import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import io from 'socket.io-client';
import config from '../config';
import { 
    getFromLocalStorage,
    saveToLocalStorage,
    LOCAL_STORAGE_KEY,
} from './VideoListUtils';

const API_URL = config.API_URL;

// Custom hook for WebSocket connection
export const useWebSocket = (onScrapeProgress, onSimilarProgress, onTagSearchProgress, onBatchScrapeProgress) => {
    const [socket, setSocket] = useState(null);
    const socketRef = useRef(null);

    useEffect(() => {
        // Only initialize once
        if (socketRef.current) return;

        const newSocket = io(API_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            forceNew: false,  // Reuse connection if available
            multiplex: true   // Allow multiple connections to same URL
        });
        
        // Setup event listeners BEFORE connecting
        newSocket.on('connect', () => {
            console.log('WebSocket connected:', newSocket.id);
            setSocket(newSocket);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
        });

        newSocket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
        });
        
        newSocket.on('scrape_progress', onScrapeProgress);
        newSocket.on('similar_progress', onSimilarProgress);
        newSocket.on('tag-search_progress', onTagSearchProgress);
        newSocket.on('batch-scrape_progress', onBatchScrapeProgress);
        
        socketRef.current = newSocket;

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
            }
        };
    }, [onScrapeProgress, onSimilarProgress, onTagSearchProgress, onBatchScrapeProgress]);
    return socket;
};

// Custom hook for notifications
export const useNotifications = (setCollectMoreFlag, setCancelScrapeFlag) => {
    const [notifications, setNotifications] = useState([]);
    const scrapeNotificationId = useRef(null);
    const similarNotificationId = useRef(null);
    const tagSearchNotificationId = useRef(null);
    const batchScrapeNotificationId = useRef(null);
    const dismissTimersRef = useRef({});

    const showNotification = useCallback((message, type = 'info') => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; 
        const newNotification = { id, message, type };
        
        setNotifications(prev => [...prev, newNotification]);
        
        const timer = setTimeout(() => {
            setNotifications(prev => prev.filter(notification => notification.id !== id));
            delete dismissTimersRef.current[id];
        }, 5000);
        
        dismissTimersRef.current[id] = timer;
    }, []);

    const removeNotification = useCallback((id) => {
        // Clear any pending timer
        if (dismissTimersRef.current[id]) {
            clearTimeout(dismissTimersRef.current[id]);
            delete dismissTimersRef.current[id];
        }
        setNotifications(prev => prev.filter(notification => notification.id !== id));
    }, []);

    const handleProgressEvent = useCallback((data, type) => {
        let notificationIdRef;
        
        switch(type) {
            case 'scrape':
                notificationIdRef = scrapeNotificationId;
                break;
            case 'similar':
                notificationIdRef = similarNotificationId;
                break;
            case 'tag-search':
                notificationIdRef = tagSearchNotificationId;
                break;
            case 'batch-scrape':
                notificationIdRef = batchScrapeNotificationId;
                break;
            default:
                return null;
        }

        // Handle completion
        if (data.isComplete) {
            if (notificationIdRef.current) {
                const notificationId = notificationIdRef.current;

                if (type === 'tag-search') {
                    setCollectMoreFlag(false);
                }
                
                // Clear any existing dismiss timer
                if (dismissTimersRef.current[notificationId]) {
                    clearTimeout(dismissTimersRef.current[notificationId]);
                }
                
                // Update to show completion message
                setNotifications(prev => {
                    const updated = prev.map(n => 
                        n.id === notificationId 
                            ? { ...n, message: 'Completed!', isComplete: true, progress: 100 }
                            : n
                    );
                    return updated;
                });

                // Auto-dismiss after 2 seconds
                const dismissTimer = setTimeout(() => {
                    setNotifications(prev => prev.filter(n => n.id !== notificationId));
                    delete dismissTimersRef.current[notificationId];
                    notificationIdRef.current = null;
                }, 2000);

                dismissTimersRef.current[notificationId] = dismissTimer;
                return dismissTimer;
            }
            return data.newItems || [];
        }

        // Handle progress
        if (!notificationIdRef.current) {
            notificationIdRef.current = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        }

        const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const message = data.message || (data.newItems?.length > 0 
            ? `${typeLabel}: ${data.newItems.length} new items found`
            : `${typeLabel}: Processing...`);
        
        // Get progress percentage (0-100)
        const progress = Math.min(100, Math.max(0, data.progress || 0));

        setNotifications(prev => {
            const existing = prev.findIndex(n => n.id === notificationIdRef.current);
            if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = {
                    ...updated[existing],
                    message,
                    progress,
                    isComplete: false
                };
                return updated;
            } else {
                return [...prev, {
                    id: notificationIdRef.current,
                    message,
                    progress,
                    type: 'progress',
                    isComplete: false
                }];
            }
        });

        return data.newItems || [];
    }, [setCollectMoreFlag, setNotifications]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            Object.values(dismissTimersRef.current).forEach(timer => clearTimeout(timer));
            dismissTimersRef.current = {};
        };
    }, []);

    return {
        notifications,
        showNotification,
        removeNotification,
        handleProgressEvent
    };
};

// Custom hook for video observers
export const useVideoObservers = (fullscreenMedia, loading, handleVideoVisibilityChange) => {
    const videoObservers = useRef({});

    const setupVideoObservers = useCallback((mediaRefs) => {
        if (loading) return;
        
        Object.values(videoObservers.current).forEach(observer => {
            if (observer) observer.disconnect();
        });
        
        videoObservers.current = {};
        
        Object.entries(mediaRefs).forEach(([index, ref]) => {
            if (ref && ref.tagName === 'VIDEO' && parseInt(index) !== fullscreenMedia) {
                const observer = new IntersectionObserver(
                    handleVideoVisibilityChange, 
                    {
                        root: null,
                        threshold: 0.2,
                        rootMargin: '50px'
                    }
                );
                
                observer.observe(ref);
                videoObservers.current[index] = observer;
            }
        });
    }, [handleVideoVisibilityChange, fullscreenMedia, loading]);

    useEffect(() => {
        return () => {
            Object.values(videoObservers.current).forEach(observer => {
                if (observer) observer.disconnect();
            });
        };
    }, []);

    return { setupVideoObservers, videoObservers };
};

// Custom hook for media navigation (fullscreen control)
export const useMediaNavigation = (mediaRefs, mediaUrls, globalVolume, isClickable, setIsClickable, scrollToMedia) => {
    const [fullscreenMedia, setFullscreenMedia] = useState(null);
    const clickDebounceRef = useRef(null);

    const handleMediaClick = useCallback((index) => {
        // If a debounce is active, ignore the click
        if (clickDebounceRef.current) return;

        if (fullscreenMedia === index) return;
        
        setFullscreenMedia(index);
        setIsClickable(false);

        // Play selected video and configure for fullscreen
        const selectedMedia = mediaRefs.current[index];
        if (selectedMedia) {
            if (selectedMedia.tagName === 'VIDEO') {
                selectedMedia.muted = false;
                selectedMedia.volume = globalVolume;
                selectedMedia.controls = true;
            }
            
            // Add fullscreen class to the media wrapper
            const mediaWrapper = selectedMedia.closest('.media-wrapper, .masonry-item');
            if (mediaWrapper) {
                mediaWrapper.classList.add('fullscreen-active');
            }
        }
        
        // Update UI
        const mediaContainer = document.getElementById('media-container');
        if (mediaContainer) {
            mediaContainer.classList.add('fullscreen-active');
        }
        
        document.querySelectorAll('.postlink-icon, .close-icon, .remove-icon, .similar-icon, .tag, .tags-panel').forEach(button => {
            button.style.zIndex = '1002';
        });
        
        const profileButton = document.querySelector('.profile-button');
        if (profileButton) {
            profileButton.style.display = 'none';
        }
        
        scrollToMedia(index);
    }, [globalVolume, scrollToMedia, mediaRefs, setIsClickable, fullscreenMedia]);

    const handleMediaClose = useCallback(() => {
        // Stop and reset the fullscreen video before closing
        if (fullscreenMedia !== null) {
            const currentMedia = mediaRefs.current[fullscreenMedia];
            if (currentMedia && currentMedia.tagName === 'VIDEO') {
                currentMedia.pause();
                currentMedia.currentTime = 0;
                currentMedia.muted = true;
            }
        }
        
        setFullscreenMedia(null);
        setIsClickable(true);
        
        // Resume all videos (muted) except the one that was just in fullscreen
        mediaRefs.current.forEach((media, i) => {
            // if (media && media.tagName === 'VIDEO' && i !== fullscreenMedia) {
            if (media && media.tagName === 'VIDEO') {
                media.muted = true;
                media.volume = globalVolume;
                media.controls = true;
                media.pause();
                // media.play().catch(err => {
                //     console.log('Autoplay prevented:', err);
                // });
            }
        });

        // Update UI
        const mediaContainer = document.getElementById('media-container');
        if (mediaContainer) {
            mediaContainer.classList.remove('fullscreen-active');
        }
        
        document.querySelectorAll('.postlink-icon, .close-icon, .remove-icon, .like-icon').forEach(button => {
            button.style.zIndex = '';
        });
        
        const profileButton = document.querySelector('.profile-button');
        if (profileButton) {
            profileButton.style.display = '';
        }
        
        // Debounce clicks for 300ms after closing
        clickDebounceRef.current = true;
        setTimeout(() => {
            clickDebounceRef.current = null;
        }, 300);
    }, [globalVolume, mediaRefs, fullscreenMedia, setIsClickable]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            clickDebounceRef.current = null;
        };
    }, []);

    const handleKeyPress = useCallback((e) => {
        if (fullscreenMedia === null) return;

        if (e.key === 'ArrowDown') {
            const nextIndex = (fullscreenMedia + 1) % mediaUrls.length;
            setFullscreenMedia(nextIndex);
            const nextMedia = mediaRefs.current[nextIndex];
            if (nextMedia && nextMedia.tagName === 'VIDEO') {
                //nextMedia.play().catch(() => {});
            }
            scrollToMedia(nextIndex);
        } else if (e.key === 'ArrowUp') {
            const prevIndex = (fullscreenMedia - 1 + mediaUrls.length) % mediaUrls.length;
            setFullscreenMedia(prevIndex);
            const prevMedia = mediaRefs.current[prevIndex];
            if (prevMedia && prevMedia.tagName === 'VIDEO' ) {
                //prevMedia.play().catch(() => {});
            }
            scrollToMedia(prevIndex);
        }
    }, [fullscreenMedia, mediaUrls.length, scrollToMedia, mediaRefs]);

    return {
        fullscreenMedia,
        setFullscreenMedia,
        handleMediaClick,
        handleMediaClose, 
        handleKeyPress
    };
};

// Custom hook for collection management
export const useCollectionManagement = (
    collections, 
    activeCollection, 
    setActiveCollection,
    setMediaUrls,
    mediaSet,
    showNotification,
    fetchMedia,
    saveActiveCollectionPreference
) => {
    const handleCollectionSwitch = useCallback((collectionId) => {
        if (collectionId === activeCollection) return;

        // Scroll to top of the screen
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        setActiveCollection(collectionId);
        setMediaUrls([]);
        mediaSet.current.clear();
        
        saveActiveCollectionPreference(collectionId);
        
        const collection = collections.find(c => c.id === collectionId);
        if (collection) {
            showNotification(`Switched to ${collection.name} collection`, 'success');
        }
        
        fetchMedia(collectionId);

    }, [
        activeCollection, 
        collections, 
        setActiveCollection, 
        setMediaUrls, 
        mediaSet, 
        showNotification, 
        fetchMedia,
        saveActiveCollectionPreference
    ]);

    return {
        handleCollectionSwitch
    };
};
// Custom hook for media actions (scrape, remove, similar, tag search)
export const useMediaHandlers = (collections, activeCollection, showNotification, setMediaUrls, setActiveCollection, filter) => {
    // Track active tag searches
    const tagSearchAbortControllerRef = useRef(null);
    const isTagSearchInProgressRef = useRef(false);
    
    const handleScrape = useCallback(async (url, contentType = 0) => {
        try {
            // Get storage key for active collection
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            
            const result = await window.electronAPI.scrape(url, contentType, storageKey);
            
            if (!result.success) throw new Error(result.error);
            
            showNotification('Scraping started - results will appear below', 'info');
            return { success: true };
        } catch (error) {
            showNotification(error.message || 'Failed to scrape', 'error');
            return { success: false, error: error.message };
        }
    }, [showNotification, collections, activeCollection]);

    const handleRemove = useCallback(async (postLink) => {
        try {
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            const localStorageLinks = getFromLocalStorage(storageKey);
            const filteredLinks = localStorageLinks.filter(item => item.postLink !== postLink);
            saveToLocalStorage(filteredLinks, storageKey);

            setMediaUrls(prevUrls => prevUrls.filter(media => media.postLink !== postLink));
            showNotification('Media removed successfully', 'success');
            return { success: true, postLink };
        } catch (error) {
            showNotification('Failed to remove media', 'error');
            return { success: false, error: error.message };
        }
    }, [collections, activeCollection, showNotification, setMediaUrls]);

    const handleSimilar = useCallback(async (postLink, contentType = 0) => {
        try {
            // Get storage key for active collection
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            
            const result = await window.electronAPI.similar(postLink, contentType, storageKey);
            
            if (!result.success) throw new Error(result.error);
            
            showNotification('Similar search started - results will appear below', 'info');
            return { success: true };
        } catch (error) {
            showNotification(error.message || 'Failed to find similar posts', 'error');
            return { success: false, error: error.message };
        }
    }, [showNotification, collections, activeCollection]);

    const handleTagSearch = useCallback(async (query, contentType = 0, updateCount = 0, tagBlacklist = "") => {
        // Prevent concurrent tag searches
        if (isTagSearchInProgressRef.current) {
            console.warn('[handleTagSearch] Tag search already in progress, skipping duplicate request');
            return { success: false, error: 'Tag search already in progress' };
        }

        // Cancel any existing tag search
        if (tagSearchAbortControllerRef.current) {
            console.log('[handleTagSearch] Cancelling previous tag search...');
            tagSearchAbortControllerRef.current.abort();
        }

        // Create new abort controller for this search
        tagSearchAbortControllerRef.current = new AbortController();
        isTagSearchInProgressRef.current = true;

        try {
            // Get storage key for active collection
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            
            // Append ❤️ to query if using a filter other than 'Newest'.
            let modifiedQuery = query;
            if (filter !== 'Newest') {
                modifiedQuery = `❤️${query}`;
            }
            
            setActiveCollection('main');
            console.log(`[handleTagSearch] Starting new tag search for: "${modifiedQuery}"`);
            
            showNotification(`Searching for tags: "${modifiedQuery}"...`, 'info');
            
            // Call IPC with storageKey parameter
            const result = await window.electronAPI.searchTags(modifiedQuery, contentType, updateCount, tagBlacklist, storageKey);
            
            // Check if this request was aborted
            if (tagSearchAbortControllerRef.current.signal.aborted) {
                console.log('[handleTagSearch] This tag search was cancelled');
                return { success: false, error: 'Tag search was cancelled' };
            }
            
            if (!result.success) throw new Error(result.error);
            
            return { success: true };
        } catch (error) {
            // Don't show error if it was aborted
            if (!tagSearchAbortControllerRef.current.signal.aborted) {
                showNotification(error.message || 'Failed to search tags', 'error');
            }
            return { success: false, error: error.message };
        } finally {
            isTagSearchInProgressRef.current = false;
        }
    }, [showNotification, setActiveCollection, collections, activeCollection, filter]);

    return {
        handleScrape,
        handleRemove,
        handleSimilar,
        handleTagSearch,
        cancelTagSearch: () => {
            if (tagSearchAbortControllerRef.current) {
                tagSearchAbortControllerRef.current.abort();
                isTagSearchInProgressRef.current = false;
            }
        }
    };
};

// Custom hook for tag management
export const useTagManagement = (
    tagFilter,
    setTagFilter,
    fullscreenMedia,
    handleMediaClose,
    setCurrentPage,
    setMediaUrls,
    handleTagSearch,
    tagBlacklist,
    setTagBlacklist,
    saveTagBlacklistPreference,
    showNotification,
    contentFilter,
    setSearchQuery
) => {
    const handleTagClick = useCallback((tag, e) => {
        e.stopPropagation();
        
        startTransition(() => {

            setTagFilter([tag]);
            
            if (fullscreenMedia !== null) {
                handleMediaClose();
            }

            handleTagSearch(tag, contentFilter);
            // setCurrentPage(1);
            // setMediaUrls([]);
        });
    }, [ 
        setTagFilter, 
        fullscreenMedia, 
        handleMediaClose,  
        handleTagSearch,
        contentFilter
    ]);

    const handleAddTagToFilter = useCallback((tag, e) => {
        e.stopPropagation();
        
        // Check if tag is already in filter
        const isTagInFilter = tagFilter.includes(tag);
        
        if (isTagInFilter) {
            showNotification(`"${tag}" is already selected`, 'info');
            return;
        }
        
        // Add tag to existing filters
        const newFilter = [...tagFilter, tag];
        setTagFilter(newFilter);
        setSearchQuery(newFilter.join(', '));  
        
        
        startTransition(() => {
            if (fullscreenMedia !== null) {
                handleMediaClose();
            }
            
            setCurrentPage(1);
            setMediaUrls([]);
        });
        
        showNotification(`Added "${tag}" to filter`, 'success');
    }, [tagFilter, setTagFilter, setSearchQuery, fullscreenMedia, handleMediaClose, setCurrentPage, setMediaUrls, showNotification]);

    const addTagToBlacklist = useCallback((tag, e) => {
        e.stopPropagation();
        
        let currentBlacklist = tagBlacklist ? tagBlacklist.split(',').map(t => t.trim()) : [];
        if (!currentBlacklist.includes(tag)) {
            currentBlacklist.push(tag);
            const newBlacklist = currentBlacklist.join(', ');
            setTagBlacklist(newBlacklist);
            saveTagBlacklistPreference(newBlacklist);
            showNotification(`Added "${tag}" to blacklist`, 'info');
        } else {
            showNotification(`"${tag}" is already in blacklist`, 'info');
        }
    }, [tagBlacklist, setTagBlacklist, saveTagBlacklistPreference, showNotification]);

    return {
        handleTagClick,
        handleAddTagToFilter,
        addTagToBlacklist
    };
};

// Utility function to detect correct media type by testing extensions
const detectMediaType = async (url) => {
  try {
    // Split URL and query string
    let [urlWithoutQuery, queryString] = url.includes('safebooru') 
      ? url.split('?')
      : [url, ''];
    
    // Remove existing extension (.jpg, .png, etc.) from the URL
    const urlWithoutExtension = urlWithoutQuery.replace(/\.(jpg|jpeg|png|gif|webm|mp4|webp)$/i, '');
    
    // Test different extensions using fast HEAD requests
    const mediaTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    
    for (const ext of mediaTypes) {
      const testUrl = `${urlWithoutExtension}.${ext}${queryString ? '?' + queryString : ''}`;
      
      try {
        // Use fetch with HEAD request to check if file exists (much faster)
        const response = await fetch(testUrl, { 
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        // If we get a 200 status and content-length > 0, file exists
        if (response.ok && response.headers.get('content-length') !== '0') {
          console.log(`✓ Found media type: ${ext} for ${urlWithoutExtension}`);
          return testUrl;
        }
        
        // Log status for debugging (but don't give up on non-200)
        console.debug(`URL returned status ${response.status}: ${ext}`);
      } catch (error) {
        // CORS or network errors - log and try next extension
        console.debug(`Failed to test ${ext}: ${error.message}`);
        continue;
      }
    }
    
    // Fallback: return with .jpg if none found
    const fallbackUrl = `${urlWithoutExtension}.jpg${queryString ? '?' + queryString : ''}`;
    console.warn(`Could not detect media type for ${urlWithoutExtension}, defaulting to .jpg`);
    return fallbackUrl;
  } catch (error) {
    console.error('Error in detectMediaType:', error);
    return null;
  }
};

// Custom hook for handling media loading errors
export const useMediaErrorHandlers = (mediaUrls, fullscreenMedia, setFullscreenMedia, mediaRefs, setMediaUrls, collections) => {
    const detectionInProgressRef = useRef(new Set());

    const handleImageError = useCallback(async (e, postLink) => {
        console.error('Image failed to load:', { postLink });
        const mediaToRetry = mediaUrls.find(media => media.postLink === postLink);
        
        // Validate media exists
        if (!mediaToRetry) {
            console.warn(`Media not found for postLink: ${postLink}`);
            setMediaUrls(prevUrls => prevUrls.filter(media => media.postLink !== postLink));
            return;
        }
        
        const videoLink = mediaToRetry.videoLinks[0];
        
        // Validate videoLink exists
        if (!videoLink) {
            console.warn(`No videoLink found for postLink: ${postLink}`);
            setMediaUrls(prevUrls => prevUrls.filter(media => media.postLink !== postLink));
            return;
        }

        // Check for 404 error code
        if (e.target?.error?.code === 4) {
            console.error('Image not found (404):', e);
            setMediaUrls(prevUrls => prevUrls.filter(media => media.postLink !== postLink));
            return;
        }
        
        // If detection is already in progress for this URL, skip
        if (detectionInProgressRef.current.has(videoLink)) {
            console.log(`Detection already in progress for: ${videoLink}`);
            return;
        }

        // Mark detection as in progress
        detectionInProgressRef.current.add(videoLink);

        try {
            console.log(`Attempting to detect correct media type for: ${videoLink}`);
            const detectedUrl = await detectMediaType(videoLink);

            if (!detectedUrl || detectedUrl === videoLink) {
                console.log('No alternative media type found, removing media');
                
                // Remove from storage
                const collection = collections.find(c => c.id === mediaToRetry.collectionId);
                const storageKey = collection?.storageKey || LOCAL_STORAGE_KEY;
                const localStorageLinks = getFromLocalStorage(storageKey);
                const filteredLinks = localStorageLinks.filter(item => item.postLink !== mediaToRetry.postLink);
                saveToLocalStorage(filteredLinks, storageKey);
                
                // Remove from UI
                setMediaUrls(prevMediaUrls => prevMediaUrls.filter(media => media.postLink !== mediaToRetry.postLink));
                return;
            }

            // Update the media with the detected URL
            setMediaUrls(prevMediaUrls =>
                prevMediaUrls.map(media =>
                    media.videoLinks[0] === videoLink
                        ? { ...media, videoLinks: [detectedUrl] }
                        : media
                )
            );

            // Save updated media to local storage
            const updatedMedia = { ...mediaToRetry, videoLinks: [detectedUrl] };
            const collection = collections.find(c => c.id === updatedMedia.collectionId);
            const storageKey = collection?.storageKey || LOCAL_STORAGE_KEY;
            const localStorageLinks = getFromLocalStorage(storageKey);
            
            // Replace old entry with new one
            const filteredLinks = localStorageLinks.filter(item => item.postLink !== mediaToRetry.postLink);
            filteredLinks.push(updatedMedia);
            saveToLocalStorage(filteredLinks, storageKey);

            console.log(`✓ Updated media with detected URL: ${detectedUrl}`);
        } catch (error) {
            console.error('Error detecting media type:', error);
            
            // Remove from storage on error
            const collection = collections.find(c => c.id === mediaToRetry.collectionId);
            const storageKey = collection?.storageKey || LOCAL_STORAGE_KEY;
            const localStorageLinks = getFromLocalStorage(storageKey);
            const filteredLinks = localStorageLinks.filter(item => item.postLink !== mediaToRetry.postLink);
            saveToLocalStorage(filteredLinks, storageKey);
            
            // Remove from UI (use mediaToRetry.postLink for consistency)
            setMediaUrls(prevUrls => prevUrls.filter(media => media.postLink !== mediaToRetry.postLink));
        } finally {
            // Remove from in-progress set
            detectionInProgressRef.current.delete(videoLink);
        }

    }, [setMediaUrls, mediaUrls, collections]);

    const handleVideoError = useCallback((e, postLink) => {
        console.error('Video failed to load:', e);
        
        // Check for 404 error code
        if (e.target.error && e.target.error.code === 4) {
            console.error('Video not found (404):', e);
        }
        
        // Remove the media by postLink
        setMediaUrls(prevMediaUrls => prevMediaUrls.filter(media => media.postLink !== postLink));
        
    }, [setMediaUrls]);

    return { handleImageError, handleVideoError };
};

// Custom hook for detecting clicks outside an element
export const useClickOutside = (fullscreenMedia, mediaRefs, handleMediaClose) => {
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (fullscreenMedia !== null && !mediaRefs.current[fullscreenMedia]?.contains(event.target) && !event.target.closest('.postlink-icon, .close-icon, .remove-icon, .like-icon, .scrape-button, .auto-scroll-button, .similar-icon, .tag, .tags-panel, .fullscreen img, .fullscreen video')) {
                handleMediaClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [fullscreenMedia, mediaRefs, handleMediaClose]);
};

export const useVideoVisibilityChange = (fullscreenMedia) => {
    return useCallback((entries, observer) => {
        entries.forEach(entry => {
            const video = entry.target;
            
            if (entry.isIntersecting) {
                if (fullscreenMedia === null && video.tagName === 'VIDEO') {
                    video.muted = true;
                }
            } else {
                if (fullscreenMedia === null && video.tagName === 'VIDEO') {
                    video.pause();
                }
            }
        });
    }, [fullscreenMedia]);
};

// Custom hook for Konami code detection
export const useKonamiCode = (onUnlock) => {
    const keySequence = useRef([]);

    useEffect(() => {
        const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        const handleKeyDown = (e) => {
            let key = e.key;
            
            // Normalize key for letters (case-insensitive)
            if (key === 'B' || key === 'b') key = 'b';
            if (key === 'A' || key === 'a') key = 'a';
            
            keySequence.current.push(key);
            
            // Keep only the last 10 keys
            if (keySequence.current.length > konamiCode.length) {
                keySequence.current.shift();
            }
            
            // Check if current sequence matches the Konami code
            if (keySequence.current.length === konamiCode.length) {
                const isMatch = konamiCode.every((key, index) => keySequence.current[index] === key);
                if (isMatch) {
                    keySequence.current = [];
                    onUnlock();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onUnlock]);
};