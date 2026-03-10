import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition} from 'react';
import './VideoList.css';
import JSZip from 'jszip';
import defaultLinks from './default-links.json';
import config from '../config';
import MiniMasonry from "minimasonry";
import { 
    MediaItem, 
    TagsPanel, 
    NotificationContainer, 
    SettingsDialog,
    BUTTON_CONFIG
} from './VideoListComponents';
import {
    LOCAL_STORAGE_KEY,
    saveToLocalStorage,
    getFromLocalStorage,
    saveFilterPreference,
    getFilterFromCookie,
    saveScrollSpeedPreference,
    getScrollSpeedFromCookie,
    saveVolumePreference,
    saveShowDefaultLinksPreference,
    saveContentFilterPreference,
    getContentFilterFromCookie,
    saveTagBlacklistPreference,
    getTagBlacklistFromCookie,
    saveAutoScrollPreference,
    getAutoScrollFromCookie,
    getActiveCollectionFromCookie,
    saveActiveCollectionPreference,
    updateSliderFill,
    updateVolumeSliderFill,
    filterMediaByTag,
    applyTagBlacklist,
    shuffleArrayOptimized,
    fetchConfig,
    exportCollection,
    importCollection,
    debounce,
    clearCollection,
    deleteBlacklistedMedia,
    saveAutoScrapePreference,
    getAutoScrapeFromCookie
} from './VideoListUtils';
import {
    useKonamiCode,
    //useWebSocket, 
    useNotifications, 
    useMediaHandlers,
    useMediaNavigation,
    useCollectionManagement,
    useTagManagement,
    useMediaErrorHandlers,
    useClickOutside
} from './VideoListHooks';

const API_URL = config.API_URL;

const VideoList = () => {
    // State variables
    const [mediaUrls, setMediaUrls] = useState(() => []);
    const [loading, setLoading] = useState(false);
    const [autoScroll, setAutoScroll] = useState(getAutoScrollFromCookie());
    const [scrollDuration, setScrollDuration] = useState(0);
    const [filter, setFilter] = useState(getFilterFromCookie() || 'random');
    const [showSettings, setShowSettings] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [isClickable, setIsClickable] = useState(true);
    const [randomSeed, setRandomSeed] = useState(Date.now());
    const [tagFilter, setTagFilter] = useState([]);
    const [contentFilter, setContentFilter] = useState(getContentFilterFromCookie()); // 0 = SFW, 1 = NSFW
    const [globalVolume, setGlobalVolume] = useState(0.1);
    const [searchQuery, setSearchQuery] = useState('');
    const [showDefaultLinks, setShowDefaultLinks] = useState(false);
    const [autoScrapeEnabled, setAutoScrapeEnabled] = useState(getAutoScrapeFromCookie());
    const [activeCollection, setActiveCollection] = useState(getActiveCollectionFromCookie());
    const [cancelScrapeFlag, setCancelScrapeFlag] = useState(false);
    const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
    const [collections] = useState([
        { id: 'main', name: 'Browser / History 📜', storageKey: LOCAL_STORAGE_KEY },
        { id: 'sub', name: 'Likes ❤️', storageKey: 'kupoNuts_sub' },
        { id: 'extra', name: 'Extra Collection ❄️', storageKey: 'kupoNuts_extra' }
    ]);
    const [showConfirmClear, setShowConfirmClear] = useState(false);
    const [tagBlacklist, setTagBlacklist] = useState(getTagBlacklistFromCookie());
    const [scrollSpeed, setScrollSpeed] = useState(getScrollSpeedFromCookie());
    const [tagsMinimized, setTagsMinimized] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [collectMoreFlag, setCollectMoreFlag] = useState(false);
    const [tagSearchInProgress, setTagSearchInProgress] = useState(false);
    const [likedMediaSet, setLikedMediaSet] = useState(new Set());
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const masonryRef = useRef(null);
    
    // Refs
    const mediaRefs = useRef([]);
    const mediaSet = useRef(new Set());
    const observer = useRef();

    // Add pagination constants
    const initialMediaPerPage = 12;
    const mediaPerPage = 8;

    // MOVE scrollToMedia HERE - before custom hooks
    const scrollToMedia = useCallback((index) => {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            const mediaElement = mediaRefs.current[index];
            if (mediaElement) {
                // Get the media wrapper instead of the media element itself
                const wrapper = mediaElement.closest('.media-wrapper') || mediaElement.parentElement;
                if (wrapper) {
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    mediaElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                console.warn(`[scrollToMedia] Element at index ${index} not found in DOM`);
            }
        });
    }, []);

    // Custom hooks FIRST - before fetchMedia
    const { notifications, showNotification, removeNotification, handleProgressEvent } = useNotifications(setCollectMoreFlag, setCancelScrapeFlag);

    // Create debounced version of fetchMedia
    const fetchMediaRef = useRef();

    // NOW fetchMedia can use all dependencies
    const fetchMedia = useCallback(async (page, limit) => {
        if (loading) return;
        setLoading(true);
        try {
            console.log(`[fetchMedia] Fetching media for page ${page}...`);
            
            const currentCollectionId = activeCollection;
            const currentCollection = collections.find(c => c.id === currentCollectionId);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            
            // Build complete dataset ONLY on page 1
            let allMediaLinks = [];
            
            if (page === 1) {
                // Append localStorage
                const localStorageLinks = getFromLocalStorage(storageKey);
                //const localStorageLinks = await getFromLocalStorageAsync(storageKey);
                console.log(`[fetchMedia] Loaded ${localStorageLinks.length} links from localStorage for collection ${currentCollectionId}`);
                if (localStorageLinks?.length > 0) {
                    allMediaLinks = [...allMediaLinks, ...localStorageLinks];
                }
                
                // Add default links if enabled
                if (showDefaultLinks && defaultLinks?.length > 0) {
                    allMediaLinks = [...allMediaLinks, ...defaultLinks];
                } else if (allMediaLinks.length === 0 && defaultLinks?.length > 0) {
                   allMediaLinks = defaultLinks;
                }
                
                // Apply filters
                if (tagFilter.length > 0) {  // ✅ Explicitly check array length
                    allMediaLinks = filterMediaByTag(allMediaLinks, tagFilter);
                }
                allMediaLinks = applyTagBlacklist(allMediaLinks, tagBlacklist);
                
                // Apply sorting ONCE
                switch (filter.toLowerCase()) {
                    case 'newest':
                        allMediaLinks = [...allMediaLinks].reverse();
                        break;
                    case 'random':
                        allMediaLinks = shuffleArrayOptimized([...allMediaLinks], randomSeed);
                        break;
                    case 'oldest':
                    default:
                        // Reverse to get newest first
                        allMediaLinks = [...allMediaLinks].reverse();
                        
                        // Split in half
                        const midpoint = Math.ceil(allMediaLinks.length / 2);
                        const firstHalf = allMediaLinks.slice(0, midpoint);
                        const secondHalf = allMediaLinks.slice(midpoint);
                        
                        // Shuffle second half
                        const randomizedSecondHalf = shuffleArrayOptimized([...secondHalf], randomSeed);
                        
                        // Interleave: 4 new, 4 random, 4 new, 4 random, etc.
                        const chunkSize = 4;
                        allMediaLinks = [];
                        const maxChunks = Math.max(
                            Math.ceil(firstHalf.length / chunkSize),
                            Math.ceil(randomizedSecondHalf.length / chunkSize)
                        );
                        
                        for (let i = 0; i < maxChunks; i++) {
                            // Add chunk of new items
                            allMediaLinks.push(...firstHalf.slice(i * chunkSize, (i + 1) * chunkSize));
                            // Add chunk of random items
                            allMediaLinks.push(...randomizedSecondHalf.slice(i * chunkSize, (i + 1) * chunkSize));
                        }
                        break;
                }
                
                // Set all media once on page 1
                setMediaUrls(allMediaLinks);
                console.log(`[fetchMedia] Page 1: Loaded ${allMediaLinks.length} total items`);
            }
            // For page > 1, infinite scroll observer will trigger setCurrentPage
            // and the selectedMedia memoization will handle slicing
            
        } catch (error) {
            console.error('Error fetching media:', error);
            if (defaultLinks?.length > 0) {
                setMediaUrls(defaultLinks);
            }
        } finally {
            setLoading(false);
        }
    }, [filter, tagFilter, showDefaultLinks, activeCollection, collections, tagBlacklist, randomSeed, loading]);

    // Create debounced version
    useEffect(() => {
        fetchMediaRef.current = debounce(fetchMedia, 300); // 300ms debounce delay
    }, [fetchMedia]);

    // Use this in your useEffect calls instead of fetchMedia directly
    const debouncedFetchMedia = useCallback((...args) => {
        if (fetchMediaRef.current) {
            fetchMediaRef.current(...args);
        }
    }, []);

    const selectedMedia = useMemo(() => {
        const startIndex = (currentPage - 1) * mediaPerPage;
        return mediaUrls.slice(0, startIndex + (2 * mediaPerPage));
    }, [currentPage, mediaUrls, mediaPerPage]);

    // Navigation hook now has access to scrollToMedia
    const { 
        fullscreenMedia, 
        setFullscreenMedia,
        handleMediaClick, 
        handleMediaClose, 
        handleKeyPress 
    } = useMediaNavigation(
        mediaRefs, 
        mediaUrls, 
        globalVolume, 
        isClickable, 
        setIsClickable, 
        scrollToMedia
    );
    
    // Collection management hook
    const { handleCollectionSwitch } = useCollectionManagement(
        collections,
        activeCollection,
        setActiveCollection,
        setMediaUrls,
        mediaSet,
        showNotification,
        fetchMedia,
        saveActiveCollectionPreference
    );

    // Rest of custom hooks that depend on fetchMedia
    const { handleScrape, handleRemove, handleSimilar, handleTagSearch } = useMediaHandlers(
        //socket,
        collections,
        activeCollection,
        showNotification,
        //API_URL,
        setMediaUrls,
        setActiveCollection,
        filter
    );

    // Tag management hook (now handleTagSearch is defined)
    const { 
        handleTagClick, 
        handleAddTagToFilter, 
        addTagToBlacklist 
    } = useTagManagement(
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
    );
    
    // Error handlers hook
    const { handleImageError, handleVideoError } = useMediaErrorHandlers(
        mediaUrls,
        fullscreenMedia,
        setFullscreenMedia,
        mediaRefs,
        setMediaUrls,
        collections
    );

    // Infinite scroll refs and handlers
    const countRef = useRef(0);

    // Handle pagination when more items are available
    const handleLoadNextPage = useCallback(() => {
        if (mediaUrls.length > selectedMedia.length && !loading) {
            setCurrentPage(prev => prev + 1);
            console.log('[InfiniteScroll] Loading next page');
        }
    }, [mediaUrls.length, selectedMedia.length, loading]);

    // Handle auto-scrape when reaching end of list
    const handleAutoScrapeAtEnd = useCallback(() => {
        if (activeCollection !== 'main' || loading) return;
        if (autoScrapeEnabled && !collectMoreFlag && !tagSearchInProgress) {
            console.log(`[InfiniteScroll] End of list reached. Collecting more media...`);
            countRef.current++;
            setCollectMoreFlag(true);
            handleTagSearch(tagFilter.join('+'), contentFilter, countRef.current);
        }
    }, [activeCollection, loading, autoScrapeEnabled, collectMoreFlag, tagSearchInProgress, handleTagSearch, tagFilter, contentFilter]);

    // Intersection observer for infinite scroll
    const lastMediaElementRef = useCallback(node => {
        if (!node) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting || loading) return;

            // If more items available, load next page
            if (mediaUrls.length > selectedMedia.length) {
                handleLoadNextPage();
            } else {
                // Otherwise try to auto-scrape
                handleAutoScrapeAtEnd();
            }
        }, {
            rootMargin: '200px',
            threshold: 0.1
        });

        observer.current.observe(node);
    }, [loading, mediaUrls.length, selectedMedia.length, handleLoadNextPage, handleAutoScrapeAtEnd]);    
    // Click outside handler hook
    useClickOutside(fullscreenMedia, mediaRefs, handleMediaClose);
    
    // WebSocket setup with progress handlers
    const confirmClearCollection = async () => {
        const result = await clearCollection(API_URL, fetchConfig, collections, activeCollection);

        if (result.success) {
            setMediaUrls([]);
            setTagFilter([]);
            await fetchMedia(1, initialMediaPerPage);
            showNotification(result.message, 'success');

            await fetchMedia(1, initialMediaPerPage);
        } else {
            showNotification(result.message, 'error');
        }
        
        setShowConfirmClear(false);
    };

    const handleTagBlacklistChange = (event) => {
        const newBlacklist = event.target.value;
        setTagBlacklist(newBlacklist);
        saveTagBlacklistPreference(newBlacklist);
    };

    const handleDeleteBlacklisted = () => {
        try {
            if (!tagBlacklist || tagBlacklist.trim() === '') {
                showNotification('Please enter tags to blacklist first', 'warning');
                return;
            }

            const result = deleteBlacklistedMedia(mediaUrls, tagBlacklist, collections, activeCollection, LOCAL_STORAGE_KEY);
            
            if (result.success) {
                // Only update state if items were actually removed
                if (result.removedCount > 0) {
                    setMediaUrls(result.filteredMedia);
                }
                showNotification(result.message, result.removedCount > 0 ? 'success' : 'info');
            } else {
                showNotification(result.message, 'warning');
            }
        } catch (error) {
            console.error('Error in handleDeleteBlacklisted:', error);
            showNotification(`Failed to delete blacklisted media: ${error.message}`, 'error');
        }
    };

    const handleExport = async () => {
        try {
            const result = await exportCollection(
                collections, 
                activeCollection, 
                API_URL, 
                fetchConfig, 
                JSZip
            );
            showNotification(result.message, result.success ? 'success' : (result.type || 'error'));
        } catch (error) {
            console.error('Export error:', error);
            showNotification(error.message || 'Failed to export collection', 'error');
        }
    };

    const handleImport = async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            const result = await importCollection(
                file,
                collections,
                activeCollection,
                API_URL,
                fetchConfig
            );
            
            setActiveCollection(activeCollection);
            
            let message = result.collectionName 
                ? `Successfully imported ${result.count} links to ${result.collectionName} collection`
                : `Successfully imported ${result.count} links`;
            
            // Add duplicate count info if there were any
            if (result.duplicateCount > 0) {
                message += ` (${result.duplicateCount} duplicate${result.duplicateCount > 1 ? 's' : ''} skipped)`;
            }
            
            showNotification(message, 'success');
            
            setMediaUrls([]);
            await fetchMedia(1, initialMediaPerPage);
        } catch (error) {
            console.error('Import error:', error);
            showNotification(error.message || 'Invalid file format', 'error');
        }
        event.target.value = '';
    };

    const handleLike = useCallback(async (postLink, isLiked) => {
        const likesCollection = collections.find(c => c.id === 'sub');
        const likesStorageKey = likesCollection?.storageKey || 'kupoNuts_sub';
        
        try {
            // Get current likes from storage
            const currentLikes = getFromLocalStorage(likesStorageKey);
            let updatedLikes;
            
            if (isLiked) {
                // Add to likes if not already there
                const alreadyLiked = currentLikes.some(item => item.postLink === postLink);
                if (!alreadyLiked) {
                    // Find the media item to like
                    const mediaToLike = mediaUrls.find(item => item.postLink === postLink);
                    if (mediaToLike) {
                        updatedLikes = [...currentLikes, mediaToLike];
                        saveToLocalStorage(updatedLikes, likesStorageKey);
                    }
                }
            } else {
                // Remove from likes
                updatedLikes = currentLikes.filter(item => item.postLink !== postLink);
                saveToLocalStorage(updatedLikes, likesStorageKey);
            }
        } catch (error) {
            console.error('Error updating likes:', error);
            showNotification('Error updating likes', 'error');
        }
    }, [mediaUrls, collections, showNotification]);

    const handleImportScrapeList = async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            // Parse the file to get URLs
            const fileContent = await file.text();
            const content = JSON.parse(fileContent);
            const urls = Array.isArray(content) ? content : 
                        (content.urls ? content.urls : Object.keys(content));

            if (!urls || urls.length === 0) {
                throw new Error('No URLs found in file');
            }

            // ✅ Check if electronAPI is available
            if (!window.electronAPI?.importScrapeList) {
                throw new Error('Electron API not available');
            }

            const result = await window.electronAPI.importScrapeList(urls, 0);
            
            if (result.success) {
                showNotification(`Successfully imported ${result.total} URLs to scrape list`, 'success');
            } else {
                showNotification(result.error || 'Failed to import scrape list', 'error');
            }
        } catch (error) {
            console.error('Import error:', error);
            showNotification(error.message || 'Invalid file format', 'error');
        }
        event.target.value = '';
    };

    const handleUnifiedSearch = () => {
        if (tagSearchInProgress) {
            showNotification('A tag search is already in progress. Please wait...', 'info');
            return;
        }

        if (searchQuery.trim().toLowerCase().startsWith('http')) {

            handleScrape(searchQuery.trim());

        } else {

            if (searchQuery.includes('@')) {
                //const listId = searchQuery.trim().replace('@', '');
                //fetchTweetsFromList(listId, API_URL, fetchConfig);
                handleScrape(searchQuery.trim());
            } 
            else {
                const query = searchQuery.trim();
                setTagFilter([query]);
                setTagSearchInProgress(true);
                
                handleTagSearch(query, contentFilter, countRef.current, tagBlacklist).finally(() => {
                    setTagSearchInProgress(false);
                });
            }
        }
        
        //setSearchQuery('');
    };



    const cancelClearCollection = () => {
        setShowConfirmClear(false);
    };

    const handleIconClick = (url) => window.open(url, '_blank');

    const handleFilterChange = (newFilter) => {
        startTransition(() => {
            setFilter(newFilter);
            saveFilterPreference(newFilter);
            setRandomSeed(Date.now());
        });
    };


    // Load liked media once
    useEffect(() => {
        const loadLikedMedia = async () => {
            const likesCollection = collections.find(c => c.id === 'sub');
            const likesStorageKey = likesCollection?.storageKey || 'kupoNuts_sub';
            const likedMedia = await getFromLocalStorage(likesStorageKey);
            const postLinks = new Set(likedMedia.map(item => item.postLink));
            setLikedMediaSet(postLinks);
        };
        loadLikedMedia();
    }, [collections]);

    useKonamiCode(() => {
        setContentFilter(1); // 1 = NSFW
        saveContentFilterPreference(1);
        sessionStorage.setItem('konami_unlocked', 'true');
        showNotification('🎮 NSFW mode unlocked! You can now toggle NSFW content.', 'success');
    });

    // CONSOLIDATED data fetching into a single useEffect
    useEffect(() => {
        console.log(`[VideoList] Page: ${currentPage}, Total Media: ${mediaUrls.length}, Selected Media: ${selectedMedia.length}`);
    }, [currentPage, mediaUrls.length, selectedMedia.length]);

    useEffect(() => {
        setCurrentPage(1);
        setMediaUrls([]);
        debouncedFetchMedia(1, initialMediaPerPage);
    }, [filter, activeCollection, cancelScrapeFlag, tagFilter, tagBlacklist, debouncedFetchMedia]);

    useEffect(() => {
        // Cancel any active scraping before resetting
        if (window.electronAPI?.invoke && cancelScrapeFlag) {

            setCancelScrapeFlag(false); // Reset flag after cancelling

            window.electronAPI.invoke('cancel-scraping').catch(err => 
                console.log('[VideoList] No active scraping to cancel:', err.message)
            );
        }
    }, [cancelScrapeFlag]);

    useEffect(() => {
        debouncedFetchMedia(currentPage, mediaPerPage);
    }, [currentPage, debouncedFetchMedia]);

    useEffect(() => {
        // When currentPage changes, load more data
        if (currentPage > 1) {
            fetchMedia(currentPage, mediaPerPage);
        }
    }, [currentPage, fetchMedia, mediaPerPage]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyPress);
        document.body.style.overflow = fullscreenMedia !== null ? 'hidden' : 'auto';
        return () => {
            document.removeEventListener('keydown', handleKeyPress);
            document.body.style.overflow = 'auto';
        };
    }, [fullscreenMedia, handleKeyPress]);

    useEffect(() => {
        if (!autoScroll) return;

        if (fullscreenMedia !== null) {
            // Fullscreen mode - auto-advance to next media
            const currentMedia = mediaRefs.current[fullscreenMedia];
            const videoDuration = currentMedia?.tagName === 'VIDEO' ? currentMedia.duration * 1000 : 10000;
            const durationInSeconds = videoDuration / 1000;
            
            setScrollDuration(durationInSeconds);
            document.documentElement.style.setProperty('--scroll-duration', `${durationInSeconds}s`);
            
            const timeoutId = setTimeout(() => {
                const button = document.querySelector('.auto-scroll-button');
                if (button) {
                    button.classList.remove('scrolling');
                    setTimeout(() => button.classList.add('scrolling'), 10);
                }

                const nextIndex = (fullscreenMedia + 1) % mediaUrls.length;
                setFullscreenMedia(nextIndex);
                const nextMedia = mediaRefs.current[nextIndex];
                if (nextMedia?.tagName === 'VIDEO') {
                    nextMedia.play().catch(() => {});
                }
            }, videoDuration <= 1 ? videoDuration * 5 : videoDuration);

            return () => clearTimeout(timeoutId);
        } else if (!loading) {
             // Batch scroll updates to avoid layout thrashing
            let scrollAnimationId;
            let lastScrollTime = Date.now();
            let pendingScroll = 0;
            
            const processScroll = () => {
                const now = Date.now();
                const deltaTime = now - lastScrollTime;
                lastScrollTime = now;
                
                pendingScroll += (scrollSpeed * deltaTime) / 16; // Scale to 16ms frames
                
                if (pendingScroll >= 1) {
                    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                    if (window.scrollY < maxScroll) {
                        window.scrollBy(0, Math.floor(pendingScroll));
                        pendingScroll -= Math.floor(pendingScroll);
                    }
                }
                
                scrollAnimationId = requestAnimationFrame(processScroll);
            };
            
            scrollAnimationId = requestAnimationFrame(processScroll);
            
            return () => {
                cancelAnimationFrame(scrollAnimationId);
            };
        }
    }, [fullscreenMedia, autoScroll, scrollSpeed, loading, mediaUrls.length, setFullscreenMedia]);

    // Add this new effect after the autoScroll useEffect
    useEffect(() => {
        // When entering fullscreen, preload adjacent media
        if (fullscreenMedia !== null) {
            const nextIndex = (fullscreenMedia + 1) % mediaUrls.length;
            const prevIndex = (fullscreenMedia - 1 + mediaUrls.length) % mediaUrls.length;
            
            // Trigger loading of adjacent items by making them "in view"
            [nextIndex, prevIndex].forEach(idx => {
                const element = mediaRefs.current[idx];
                if (element) {
                    // This will trigger the IntersectionObserver in MediaItem
                    element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                }
            });
        }
    }, [fullscreenMedia, mediaUrls.length]);

    useEffect(() => {
        setRandomSeed(Date.now());
    }, [filter]);
    
    useEffect(() => {
        if (showSettings) {
            // Update slider fills when settings dialog opens
            setTimeout(() => {
                updateSliderFill(scrollSpeed);
                updateVolumeSliderFill(globalVolume);
            }, 0);
        }
    }, [showSettings, scrollSpeed, globalVolume]);

    // Setup progress listeners when component mounts (ONLY ONCE)
    useEffect(() => {
        // Guard: only setup listeners if electronAPI is available
        if (!window.electronAPI) {
            console.log('[VideoList] electronAPI not available - running in browser mode');
            return;
        }

        const createProgressListener = (eventName) => {
            return async (data) => {  // ← Make async
                console.log(`[VideoList] Received ${eventName} progress:`, data);

                if (data.newItems && data.newItems.length > 0) {
                    const storageKey = collections.find(c => c.id === 'main')?.storageKey || LOCAL_STORAGE_KEY;

                    // Load current from storage
                    const currentLinks = await getFromLocalStorage(storageKey) || [];  // ← Add await
                    
                    // Create a Set of existing video URLs (first URL in array) for O(1) lookup
                    const existingVideoUrls = new Set(
                        currentLinks.map(item => {
                            return Array.isArray(item.videoLinks) && item.videoLinks.length > 0 
                                ? item.videoLinks[0] 
                                : '';
                        }).filter(url => url)
                    );
                    
                    // Filter out duplicates from newItems by checking the first video URL
                    const uniqueNewItems = data.newItems.filter(item => {
                        const firstVideoUrl = Array.isArray(item.videoLinks) && item.videoLinks.length > 0 
                            ? item.videoLinks[0] 
                            : '';
                        return firstVideoUrl && !existingVideoUrls.has(firstVideoUrl);
                    });
                    
                    if (uniqueNewItems.length > 0) {
                        // Add unique items to existing ones
                        const allItems = [...currentLinks];
                        
                        uniqueNewItems.forEach(item => {
                            allItems.push({
                                postLink: item.postLink || '',
                                videoLinks: Array.isArray(item.videoLinks) ? item.videoLinks : [],
                                tags: item.tags || {}
                            });
                        });

                        // Update UI state with all items
                        setMediaUrls(prevUrls => [...prevUrls, ...uniqueNewItems]);
                        console.log(`[VideoList] Total items after addition: ${allItems.length}`);
                        // Save to localStorage
                        saveToLocalStorage(allItems, storageKey);
                        
                        console.log(`[VideoList] Added ${uniqueNewItems.length} unique items (filtered ${data.newItems.length - uniqueNewItems.length} duplicates)`);
                    } else {
                        console.log(`[VideoList] All ${data.newItems.length} items were duplicates, skipping`);
                    }
                }
                
                // Show notifications
                handleProgressEvent(data, eventName);
            };
        };

        // Register all listeners
        const unsubscribeScrape = window.electronAPI?.onScrape(createProgressListener('scrape'));
        const unsubscribeSimilar = window.electronAPI?.onSimilar(createProgressListener('similar'));
        const unsubscribeTagSearch = window.electronAPI?.onTagSearch(createProgressListener('tag-search'));
        const unsubscribeBatchScrape = window.electronAPI?.onBatchScrape(createProgressListener('batch-scrape'));

        // Cleanup listeners on unmount
        return () => {
            if (unsubscribeScrape) unsubscribeScrape();
            if (unsubscribeSimilar) unsubscribeSimilar();
            if (unsubscribeTagSearch) unsubscribeTagSearch();
            if (unsubscribeBatchScrape) unsubscribeBatchScrape();
            window.electronAPI?.offScrape();
            window.electronAPI?.offSimilar();
            window.electronAPI?.offTagSearch();
            window.electronAPI?.offBatchScrape();
        };
    }, [collections, handleProgressEvent]);

    // Separate effect to reflow layout when items load
    useEffect(() => {
        if (masonryRef.current && selectedMedia.length > 0) {
            masonryRef.current.layout();
            console.log(`✨ Masonry layout triggered for ${selectedMedia.length} items`);
        }
    }, [selectedMedia]);

    useEffect(() => {
        // Clean up old instance when collection changes
        if (masonryRef.current) {
            masonryRef.current.destroy();
            masonryRef.current = null;
        }

        // Initialize new masonry for current collection
        const container = document.querySelector('.media-masonry');
        const columns = 5;
        const gutter = 10;
        const baseWidth = container 
            ? (container.clientWidth - (columns - 1) * gutter) / columns 
            : 200;

        masonryRef.current = new MiniMasonry({
            container: container,
            gutter: gutter,
            baseWidth: baseWidth,
        });
    }, [activeCollection]); // Add activeCollection

    // // Cleanup on unmount only
    // useEffect(() => {
    //     return () => {
    //         if (masonryRef.current) {
    //             masonryRef.current.destroy();
    //             masonryRef.current = null;
    //         }
    //     };
    // }, []);

    // Pause and mute videos in masonry when fullscreen is active
    useEffect(() => {
        const masonryElement = document.querySelector('.media-masonry');
        if (!masonryElement) return;

        const videos = masonryElement.querySelectorAll('video');
        videos.forEach(video => {
            if (fullscreenMedia !== null) {
                // Pause and mute when fullscreen is active
                video.pause();
                video.muted = true;
            } else {
                // Keep muted when exiting fullscreen
                video.muted = true;
            }
        });
    }, [fullscreenMedia]);

    return (
        <div className={`main-content ${fullscreenMedia !== null ? 'fullscreen-active' : ''}`}>
            {/* Top search bar */}
            <div className={`top-search-bar ${fullscreenMedia !== null || autoScroll === true ? 'hidden' : ''}`}>
                
                <div className="left-section">
                    <div
                        className="app-title"
                        onClick={() => window.location.reload()}
                        style={{ cursor: 'pointer' }}
                    >
                        <svg className='logo-icon' width="50" height="50" viewBox="0 0 394 358" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M48.5534 153.787L106.957 242.571C71.9347 228.141 -2.56528 190.393 0.0680141 155.18C2.29249 125.435 29.373 127.058 48.5534 153.787Z" fill="#00D0FF"/>
                            <path d="M33.1096 225.981L103.587 244.756C80.8728 257.312 29.003 279.691 12.4281 256.475C-1.57361 236.862 11.1873 221.304 33.1096 225.981Z" fill="#ED3131"/>
                            <path d="M46.524 303.715L102.351 256.779C99.595 282.586 88.1493 337.906 59.6244 338.153C35.528 338.362 30.112 318.982 46.524 303.715Z" fill="#FFF700"/>
                            <rect width="38.7017" height="7.14139" transform="matrix(-0.258819 -0.965926 -0.965926 0.258819 204.181 150.612)" fill="#0A0A0A"/>
                            <ellipse cx="66" cy="62.5" rx="66" ry="62.5" transform="matrix(-1 0 0 1 246.535 0)" fill="#ED3131"/>
                            <ellipse cx="116.5" cy="111" rx="116.5" ry="111" transform="matrix(-1 0 0 1 354.535 136)" fill="white"/>
                            <rect width="56.8782" height="14.9023" transform="matrix(-0.893516 0.449032 0.449032 0.893516 280.315 173.887)" fill="#0A0A0A"/>
                            <ellipse cx="53.5" cy="54" rx="53.5" ry="54" transform="matrix(-1 0 0 1 393.535 182)" fill="#ED3131"/>
                        </svg>


                        <span>Kupo Nuts</span>
                    </div>

                    <div className="sort-dropdown-wrapper">
                        <button
                            className="sort-dropdown-toggle"
                            onClick={() => {
                                setShowSortDropdown(!showSortDropdown);
                                setShowCollectionDropdown(false);
                            }}
                            title="Sort gallery"
                        >
                            <i className="fas fa-sort"></i>
                            <span>{filter}</span>
                            <i className={`fas fa-chevron-down ${showSortDropdown ? 'open' : ''}`}></i>
                        </button>
                        
                        {showSortDropdown && (
                            <div className="sort-dropdown-menu">
                                {['Default', 'Newest', 'Random', 'Oldest'].map(option => (
                                    <button
                                        key={option}
                                        className={`sort-dropdown-item ${filter === option ? 'active' : ''}`}
                                        onClick={() => {
                                            handleFilterChange(option);
                                            setShowSortDropdown(false);
                                        }}
                                        title={`Sort by ${option}`}
                                    >
                                        {option}
                                        {filter === option && <i className="fas fa-check"></i>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                
                {contentFilter === 1 && (
                    <button
                        onClick={() => {
                            setContentFilter(0); // 0 = SFW
                            saveContentFilterPreference(0);
                            showNotification('Switching back to SFW mode');
                        }}
                        className={`content-filter-button nsfw`}
                        aria-label="NSFW mode active"
                        title="Click to return to SFW mode"
                    >
                        NSFW
                    </button>
                )}
                
                <div className="search-container">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleUnifiedSearch()}
                        placeholder="Use comma(,) to separate tags(blue, red house), or paste a URL to scrape"
                        className="search-input"
                    />
                    <div className="search-buttons-group">
                        <button
                            onClick={() => {
                                const newAutoScrape = !autoScrapeEnabled;
                                setAutoScrapeEnabled(newAutoScrape);
                                saveAutoScrapePreference(newAutoScrape);
                            }}
                            className={`auto-scrape-button-top ${autoScrapeEnabled ? 'active' : ''}`}
                            aria-label="Toggle auto scrape"
                            title={autoScrapeEnabled ? 'Auto Scrape: ON' : 'Auto Scrape: OFF'}
                        >
                            <i className="fas fa-magic"></i>
                        </button>
                        <button
                            onClick={handleUnifiedSearch}
                            className="search-button"
                            title='Search'
                        >
                            <i className={`fas ${searchQuery.trim().toLowerCase().startsWith('http') ? 'fa-download' : 'fa-search'}`}></i>
                        </button>
                    </div>
                </div>                
                
                <div className="right-section">
                    {/* Tabs for larger screens, dropdown for smaller screens */}
                    <div className="collection-tabs-wrapper">
                        {/* Desktop tabs view */}
                        <div className="collection-tabs collection-tabs-desktop">
                            {collections.map(collection => (
                                <button
                                    key={collection.id}
                                    className={`collection-tab ${activeCollection === collection.id ? 'active' : ''}`}
                                    onClick={() => handleCollectionSwitch(collection.id)}
                                    title={`Switch to ${collection.name} collection`}
                                >
                                    {collection.name}
                                </button>
                            ))}
                        </div>
                        
                        {/* Mobile dropdown view */}
                        <div className="collection-dropdown-wrapper">
                            <button
                                className="collection-dropdown-toggle"
                                onClick={() => {
                                    setShowCollectionDropdown(!showCollectionDropdown);
                                    setShowProfileMenu(false); // Ensure profile menu is closed when opening collection dropdown
                                }}
                                title="Select collection"
                            >
                                <i className="fas fa-folder"></i>
                                <span>{collections.find(c => c.id === activeCollection)?.name || 'Collections'}</span>
                                <i className={`fas fa-chevron-down ${showCollectionDropdown ? 'open' : ''}`}></i>
                            </button>
                            
                            {showCollectionDropdown && (
                                <div className="collection-dropdown-menu">
                                    {collections.map(collection => (
                                        <button
                                            key={collection.id}
                                            className={`collection-dropdown-item ${activeCollection === collection.id ? 'active' : ''}`}
                                            onClick={() => {
                                                handleCollectionSwitch(collection.id);
                                                setShowCollectionDropdown(false);
                                            }}
                                            title={`Switch to ${collection.name} collection`}
                                        >
                                            {collection.name}
                                            {activeCollection === collection.id && <i className="fas fa-check"></i>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setShowProfileMenu(!showProfileMenu);
                            setShowCollectionDropdown(false); // Ensure collection dropdown is closed when opening profile menu
                        }}
                        className={`profile-button`}
                        aria-label="Collection Menu"
                    >
                        <i className={`fas fa-user`}></i>
                    </button>
                    {showProfileMenu && (
                        <div className="profile-menu">
                            <div className="profile-menu-header">
                                <h3>Collection Menu</h3>
                                <button onClick={() => setShowProfileMenu(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="profile-menu-content">
                                <button className="profile-menu-button" onClick={handleExport}>
                                    <i className="fas fa-download"></i>
                                    Export Collection
                                </button>
                                <label className="profile-menu-button">
                                    <i className="fas fa-upload"></i>
                                    Import Collection
                                    <input
                                        type="file"
                                        accept=".json"
                                        onChange={handleImport}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                                <label className="profile-menu-button">
                                    <i className="fas fa-list"></i>
                                    Import Scrape List
                                    <input
                                        type="file"
                                        accept=".json"
                                        onChange={handleImportScrapeList}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                                <div className="profile-menu-divider"></div>
                                <button className="profile-menu-button danger" onClick={() => setShowConfirmClear(true)}>
                                    <i className="fas fa-ban"></i>
                                    Clear Collection
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {tagFilter && tagFilter.length > 0 && fullscreenMedia === null && (
                <div className="active-filter-indicator">
                    <span>Filtering by: {tagFilter.join('+')}</span>
                    <button 
                        className="clear-button" 
                        onClick={() => {
                            setTagFilter([]);
                            setCancelScrapeFlag(true);
                            setSearchQuery('');
                            countRef.current = 0;
                        }}
                        aria-label="Clear filter"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            )}

            <NotificationContainer 
                notifications={notifications}
                onRemoveNotification={removeNotification}
            />

            {/* Fullscreen Overlay - SEPARATE from masonry */}
            {fullscreenMedia !== null && mediaUrls[fullscreenMedia] && (
                <div className="fullscreen-overlay">
                    <MediaItem
                        media={mediaUrls[fullscreenMedia]}
                        index={fullscreenMedia}
                        fullscreenIndex={fullscreenMedia}
                        isFullscreen={true}
                        globalVolume={globalVolume}
                        onMediaClick={() => {}}
                        onImageError={handleImageError}
                        onVideoError={handleVideoError}
                        onIconClick={handleIconClick}
                        onClose={handleMediaClose}
                        onSimilar={() => {
                            if (activeCollection !== 'main') {
                                setActiveCollection('main');
                            }
                            setTagFilter([]);
                            const authorTags = mediaUrls[fullscreenMedia]?.tags?.author || [];
                            handleSimilar(mediaUrls[fullscreenMedia].postLink, contentFilter);
                            
                            const newMediaUrls = [mediaUrls[fullscreenMedia]];
                            if (Array.isArray(authorTags) && authorTags.length > 0) {
                                const authorMedia = filterMediaByTag(mediaUrls, authorTags);
                                authorMedia.forEach(item => {
                                    if (item.postLink !== mediaUrls[fullscreenMedia].postLink) {
                                        newMediaUrls.push(item);
                                    }
                                });
                            }
                            
                            setMediaUrls(newMediaUrls);
                            setFullscreenMedia(0);
                        }}
                        onRemove={handleRemove}
                        onLike={handleLike}
                        isLiked={likedMediaSet.has(mediaUrls[fullscreenMedia]?.postLink)}
                        mediaRef={el => (mediaRefs.current[fullscreenMedia] = el)}
                        masonryRef={masonryRef}
                    />
                </div>
            )}

            <div className="media-masonry">
                {selectedMedia.map((media, itemIndex) => {

                    const actualIndex = mediaUrls.indexOf(media);                    
                    const isLastItem = itemIndex === selectedMedia.length - 1;
                    const isMediaLiked = likedMediaSet.has(media.postLink);
                    
                    return (
                        <div
                            key={`${media.postLink}-${itemIndex}`}
                            ref={isLastItem ? lastMediaElementRef : null}
                            style={fullscreenMedia !== null && actualIndex === fullscreenMedia 
                                ? { visibility: 'hidden', pointerEvents: 'none' } 
                                : undefined}
                        >
                            <MediaItem
                                media={media}
                                index={actualIndex}
                                fullscreenIndex={fullscreenMedia}
                                isFullscreen={false}
                                globalVolume={fullscreenMedia !== null ? 0 : globalVolume}
                                onMediaClick={handleMediaClick}
                                onImageError={handleImageError}
                                onVideoError={handleVideoError}
                                onIconClick={handleIconClick}
                                onClose={handleMediaClose}
                                onSimilar={() => {
                                    //Set the current collection to main
                                    if (activeCollection !== 'main') {
                                        setActiveCollection('main');
                                    }
                                    setTagFilter([]);
                                    const authorTags = media?.tags?.author || [];
                                    handleSimilar(media.postLink, contentFilter);
                                    
                                    const newMediaUrls = [media];
                                    if (Array.isArray(authorTags) && authorTags.length > 0) {
                                        const authorMedia = filterMediaByTag(mediaUrls, authorTags);
                                        authorMedia.forEach(item => {
                                            if (item.postLink !== media.postLink) {
                                                newMediaUrls.push(item);
                                            }
                                        });
                                    }
                                    
                                    setMediaUrls(newMediaUrls);
                                    setFullscreenMedia(null);
                                }}
                                onRemove={handleRemove}
                                onLike={handleLike}
                                isLiked={isMediaLiked}
                                mediaRef={el => (mediaRefs.current[actualIndex] = el)}
                                masonryRef={masonryRef}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Show loading state when mediaUrls is not ready */}
            {(!Array.isArray(mediaUrls) || mediaUrls.length === 0) && loading && (
                <div className="loading-placeholder">Loading media...</div>
            )}

            {/* Tags Panel for Fullscreen */}
            {fullscreenMedia !== null && (
               <TagsPanel 
                    tags={mediaUrls[fullscreenMedia]?.tags}
                    tagFilter={tagFilter}
                    onTagClick={handleTagClick}
                    onAddTagToFilter={handleAddTagToFilter}
                    onAddTagToBlacklist={addTagToBlacklist}
                    isMinimized={tagsMinimized}
                    onToggleMinimized={() => setTagsMinimized(!tagsMinimized)}
                />
            )}

            {loading && (
                <div className="loading-placeholder"></div>
            )}
            
            {fullscreenMedia !== null && (
                <div className="fullscreen-icon-container">
                    {BUTTON_CONFIG.map((btn) => {
                        const media = mediaUrls[fullscreenMedia];
                        const { postLink, videoLinks = [] } = media || {};
                        const shouldRender = !btn.condition || btn.condition(postLink, videoLinks);
                        if (!shouldRender) return null;

                        const isLikeButton = btn.handler === 'like';
                        
                        if (btn.isInfoOnly) {
                            return null;
                        }
                        
                        return (
                            <button
                                key={btn.handler}
                                className={`${btn.className} ${isLikeButton && likedMediaSet.has(postLink) ? 'liked' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    switch (btn.handler) {
                                        case 'like':
                                            handleLike(postLink, !likedMediaSet.has(postLink));
                                            break;
                                        case 'link':
                                            handleIconClick(postLink);
                                            break;
                                        case 'similar':
                                            handleSimilar(postLink);
                                            break;
                                        case 'remove':
                                            handleRemove(postLink);
                                            break;
                                        default:
                                            break;
                                    }
                                }}
                                aria-label={btn.ariaLabel}
                            >
                                <i className={`${btn.icon} ${isLikeButton && likedMediaSet.has(postLink) ? 'filled' : ''}`}></i>
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="overlay-buttons">
                <button
                    onClick={() => setShowSettings(true)}
                    className="settings-button"
                    aria-label="Settings"
                >
                    <i className="fas fa-cog"></i>
                </button>
               <button
                    onClick={() => {
                        const newAutoScroll = !autoScroll;
                        setAutoScroll(newAutoScroll);
                        saveAutoScrollPreference(newAutoScroll);
                    }}
                    className={`auto-scroll-button ${autoScroll ? 'active' : ''} ${autoScroll && fullscreenMedia !== null ? 'scrolling' : ''}`}
                    style={autoScroll && fullscreenMedia !== null ? { '--scroll-duration': `${scrollDuration}s` } : {}}
                    aria-label="Toggle auto scroll"
                >
                    <i className="fas fa-arrow-down"></i>
                </button>
            </div>

            <SettingsDialog
                showSettings={showSettings}
                showDefaultLinks={showDefaultLinks}
                filter={filter}
                scrollSpeed={scrollSpeed}
                globalVolume={globalVolume}
                tagBlacklist={tagBlacklist}
                onClose={() => setShowSettings(false)}
                onShowDefaultLinksChange={(value) => {
                    setShowDefaultLinks(value);
                    saveShowDefaultLinksPreference(value);
                    setMediaUrls([]);
                    fetchMedia();
                }}
                onFilterChange={handleFilterChange}
                onScrollSpeedChange={(speed) => {
                    setScrollSpeed(speed);
                    saveScrollSpeedPreference(speed);
                }}
                onVolumeChange={(volume) => {
                    setGlobalVolume(volume);
                    saveVolumePreference(volume);
                }}
                onTagBlacklistChange={handleTagBlacklistChange}
                onDeleteBlacklisted={handleDeleteBlacklisted}
                updateSliderFill={updateSliderFill}
                updateVolumeSliderFill={updateVolumeSliderFill}
            />

            {showConfirmClear && (
                <div className="confirm-dialog">
                    <div className="confirm-content">
                        <div className="confirm-header">
                            <h2>Confirm Clear</h2>
                        </div>
                        <div className="confirm-body">
                            <p>Are you sure you want to clear your collection?</p>
                            <p><strong>This action cannot be undone.</strong></p>
                        </div>
                        <div className="confirm-options">
                            <button onClick={cancelClearCollection}>
                                Cancel
                            </button>
                            <button onClick={confirmClearCollection}>
                                Yes, Clear Collection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(VideoList);

