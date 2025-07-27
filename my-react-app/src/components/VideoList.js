import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Masonry from 'react-masonry-css';
import './VideoList.css';
import defaultLinks from './default-links.json';
import config from '../config'; // Import the config file
import io from 'socket.io-client';

const API_URL = config.API_URL;
const LOCAL_STORAGE_KEY = 'kupoNuts_mediaLinks'; // Add this constant for localStorage key

// Add helper functions for localStorage
const saveToLocalStorage = (mediaLinks, storageKey = LOCAL_STORAGE_KEY) => {
    try {
        localStorage.setItem(storageKey, JSON.stringify(mediaLinks));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
};

const getFromLocalStorage = (storageKey = LOCAL_STORAGE_KEY) => {
    try {
        const data = localStorage.getItem(storageKey);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return [];
    }
};

const addToLocalStorage = (mediaItem, storageKey = LOCAL_STORAGE_KEY) => {
    try {
        const currentLinks = getFromLocalStorage(storageKey);
        // Check if item already exists to prevent duplicates
        const exists = currentLinks.some(item => item.postLink === mediaItem.postLink);
        if (!exists) {
            currentLinks.push(mediaItem);
            saveToLocalStorage(currentLinks, storageKey);
        }
        return currentLinks;
    } catch (error) {
        console.error('Error adding to localStorage:', error);
        return [];
    }
};

const VideoList = () => {
    const [mediaUrls, setMediaUrls] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [fullscreenMedia, setFullscreenMedia] = useState(null);
    const [loading, setLoading] = useState(false);
    const [autoScroll, setAutoScroll] = useState(false);
    const [filter, setFilter] = useState('random'); // Default to random
    const [showSettings, setShowSettings] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [isClickable, setIsClickable] = useState(true);
    const [loadedMedia, setLoadedMedia] = useState({});
    const [randomSeed, setRandomSeed] = useState(Date.now());
    const [tagFilter, setTagFilter] = useState(null);
    const [contentFilter, setContentFilter] = useState('sfw'); // Default to 'sfw'
    const [globalVolume, setGlobalVolume] = useState(0.1); // Add global volume state with default 10%
    // eslint-disable-next-line no-unused-vars
    const [socket, setSocket] = useState(null); // Add socket state here
    const [searchQuery, setSearchQuery] = useState(''); // New unified search query
    const guestId = useRef(localStorage.getItem('kupoguestid') || `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const [showDefaultLinks, setShowDefaultLinks] = useState(false); // Add state for showing default links
    const [activeCollection, setActiveCollection] = useState('main'); // Add state for active collection
    const [collections] = useState([
        { id: 'main', name: 'Main', storageKey: LOCAL_STORAGE_KEY },
        { id: 'sub', name: 'Sub', storageKey: 'kupoNuts_sub' },
        { id: 'extra', name: 'Extra', storageKey: 'kupoNuts_extra' }
    ]); // Add predefined collections
    const [showMobileMenu, setShowMobileMenu] = useState(false); // Add state for mobile menu
    const [isMobile, setIsMobile] = useState(false); // Add state to track mobile viewport
    const prevScrollY = useRef(0); // Add ref to track previous scroll position
    const scrollAnimation = useRef(null); // Add ref for scroll animation
    const mediaRefs = useRef([]);
    const mediaSet = useRef(new Set());
    const observer = useRef();
    const scrapeNotificationId = useRef(null);
    const similarNotificationId = useRef(null); // Keep separate IDs for different operations
    const tagSearchNotificationId = useRef(null);
    const [showConfirmClear, setShowConfirmClear] = useState(false);
    const [tagBlacklist, setTagBlacklist] = useState('');
    const [scrollSpeed, setScrollSpeed] = useState(3); // Default scroll speed
    // eslint-disable-next-line no-unused-vars
    const [tagSearchQuery, setTagSearchQuery] = useState('');
    // Konami Code state for hidden NSFW toggle
    // eslint-disable-next-line no-unused-vars
    const [konamiSequence, setKonamiSequence] = useState([]);
    const konamiCode = useMemo(() => ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'], []);

    const initialMediaPerPage = 8;
    const mediaPerPage = 16;

    const shuffleArray = useCallback((array) => {
        const newArray = [...array];
        newArray.reverse();
        const rand = seedrandom(randomSeed.toString());
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        newArray.reverse();
        return newArray;
    }, [randomSeed]);

    const fetchConfig = {
        credentials: 'include',
    };

    // Add a new helper function to filter media by tag
    const filterMediaByTag = useCallback((mediaLinks, searchTerm) => {
        if (!searchTerm) return mediaLinks;
        
        const lowercaseSearchTerm = searchTerm.toLowerCase();
        return mediaLinks.filter(item => {
            const tags = item[2];
            
            // Handle array format tags (legacy format)
            if (Array.isArray(tags)) {
                return tags.some(tag => tag.toLowerCase().includes(lowercaseSearchTerm));
            }
            
            // Handle object format tags (current format)
            return Object.values(tags).some(categoryTags => 
                Array.isArray(categoryTags) && categoryTags.some(tag => 
                    tag.toLowerCase().includes(lowercaseSearchTerm)
                )
            );
        });
    }, []);

    const applyTagBlacklist = useCallback((media) => {
        if (!tagBlacklist) return media;

        const blacklist = tagBlacklist.split(',').map(tag => tag.trim().toLowerCase());

        return media.filter(item => {
            const tags = item[2];

            if (!tags) return true;

            const allTags = [];

            if (Array.isArray(tags)) {
                tags.forEach(tag => allTags.push(tag.toLowerCase()));
            } else {
                Object.values(tags).forEach(categoryTags => {
                    if (Array.isArray(categoryTags)) {
                        categoryTags.forEach(tag => allTags.push(tag.toLowerCase()));
                    }
                });
            }

            return !blacklist.some(blacklistedTag =>
                allTags.some(tag => tag.includes(blacklistedTag))
            );
        });
    }, [tagBlacklist]);

    const fetchMedia = useCallback(async (page, limit) => {
        setLoading(true);
        try {
            let mediaLinks = [];
            
            // Always use localStorage based on active collection
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            const localStorageLinks = getFromLocalStorage(storageKey);
            
            if (localStorageLinks && localStorageLinks.length > 0) {
                // Format localStorage data to match expected array format
                mediaLinks = localStorageLinks.map(item => [
                    item.postLink || '',
                    item.videoLinks || [],
                    item.tags || {}
                ]);
            }
            
            // Add default links when localStorage is empty or showDefaultLinks is enabled
            if ((mediaLinks.length === 0 || showDefaultLinks) && defaultLinks?.length > 0) {
                const defaultMediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
                mediaLinks = mediaLinks.length > 0 ? 
                    (showDefaultLinks ? [...mediaLinks, ...defaultMediaLinks] : mediaLinks) : 
                    defaultMediaLinks;
            }

            // Step 2: Apply tag filtering if needed
            if (tagFilter) {
                mediaLinks = filterMediaByTag(mediaLinks, tagFilter);
            }

            // Apply tag blacklist
            mediaLinks = applyTagBlacklist(mediaLinks);

            // Step 3: Apply sorting based on filter
            const totalAvailableItems = mediaLinks.length;
            const startIndex = (page - 1) * limit;

            let sortedMediaLinks = [];

            switch (filter.toLowerCase()) {
                case 'newest': 
                    // For non-logged in users, keep local storage items first (in reverse order)
                    // followed by default items (also in reverse order)
                    sortedMediaLinks = [...mediaLinks].reverse();
                    break;
                case 'random':
                    sortedMediaLinks = shuffleArray([...mediaLinks]);
                    break;
                case 'oldest':
                    sortedMediaLinks = [...mediaLinks];
                    break;
                default:
                    sortedMediaLinks = page % 2 === 0 
                        ? [...mediaLinks].reverse() 
                        : shuffleArray([...mediaLinks]);
                    break;
            }

            // Step 4: Paginate and update state
            const endIndex = Math.min(startIndex + limit, totalAvailableItems);
           
            const pageMediaUrls = sortedMediaLinks.slice(startIndex, endIndex);

            if (startIndex >= totalAvailableItems) {
                console.log('Reached the end of media items, refreshing...');
                return;
            }

            // Step 5: Update state with unique media items
            if (page === 1) {
                mediaSet.current.clear();
                setMediaUrls(pageMediaUrls);
            } else {
                const uniqueMediaUrls = pageMediaUrls.filter(media => !mediaSet.current.has(media[1][0]));
                uniqueMediaUrls.forEach(media => mediaSet.current.add(media[1][0]));
                setMediaUrls(prevMediaUrls => [...prevMediaUrls, ...uniqueMediaUrls]);
            }
            
        } catch (error) {
            console.error('Error fetching media:', error);
            
            // Fallback to localStorage and defaults
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            const localStorageLinks = getFromLocalStorage(storageKey);
            let mediaLinks = [];
            
            if (localStorageLinks && localStorageLinks.length > 0) {
                mediaLinks = localStorageLinks.map(item => [
                    item.postLink || '',
                    item.videoLinks || [],
                    item.tags || {},
                    { isUserContent: true } // Mark as user content
                ]);
            }
            
            // Always show defaults in error cases if localStorage is empty
            if (mediaLinks.length === 0 && defaultLinks?.length > 0) {
                const defaultMediaLinks = defaultLinks.map(item => [
                    item.postLink || '', 
                    item.videoLinks, 
                    item.tags || {},
                    { isDefault: true } // Mark as default content
                ]);
                mediaLinks = defaultMediaLinks;
            } else if (showDefaultLinks && defaultLinks?.length > 0) {
                // Add default links when showDefaultLinks is enabled
                const defaultMediaLinks = defaultLinks.map(item => [
                    item.postLink || '', 
                    item.videoLinks, 
                    item.tags || {},
                    { isDefault: true } // Mark as default content
                ]);
                mediaLinks = [...mediaLinks, ...defaultMediaLinks];
            }
            
            if (mediaLinks.length > 0) {
                // Apply filtering, sorting, and pagination similar to the main function
                if (tagFilter) {
                    mediaLinks = filterMediaByTag(mediaLinks, tagFilter);
                }

                mediaLinks = applyTagBlacklist(mediaLinks);
                
                let sortedMediaLinks = [];

                const userItems = mediaLinks.filter(item => item[3]?.isUserContent).reverse();
                const defaultItems = mediaLinks.filter(item => item[3]?.isDefault).reverse();

                switch (filter.toLowerCase()) {
                    case 'newest':
                        // Keep local storage items first (in reverse order)
                        // followed by default items (also in reverse order)
                        sortedMediaLinks = [...userItems, ...defaultItems];
                        break;
                    case 'random':
                        sortedMediaLinks = shuffleArray([...mediaLinks]);
                        break;
                    case 'oldest':
                        sortedMediaLinks = [...mediaLinks];
                        break;
                    default:
                        sortedMediaLinks = shuffleArray([...mediaLinks]);
                        break;
                }
                
                const totalAvailableItems = sortedMediaLinks.length;
                const startIndex = (page - 1) * limit;
                const endIndex = Math.min(startIndex + limit, totalAvailableItems);
                const pageMediaUrls = sortedMediaLinks.slice(startIndex, endIndex);
                
                if (startIndex >= totalAvailableItems) {
                    console.log('Reached the end of media items, refreshing...');
                    return;
                }
                
                if (page === 1) {
                    mediaSet.current.clear();
                    setMediaUrls(pageMediaUrls);
                } else {
                    const uniqueMediaUrls = pageMediaUrls.filter(media => !mediaSet.current.has(media[1][0]));
                    uniqueMediaUrls.forEach(media => mediaSet.current.add(media[1][0]));
                    setMediaUrls(prevMediaUrls => [...prevMediaUrls, ...uniqueMediaUrls]);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [filter, shuffleArray, tagFilter, showDefaultLinks, filterMediaByTag, applyTagBlacklist, activeCollection, collections]);

    const setCookies = () => {
        const cookies = JSON.parse(localStorage.getItem('cookies'));
        if (cookies) {
            cookies.forEach(cookie => {
                document.cookie = `${cookie.name}=${cookie.value}; domain=${cookie.domain}; path=${cookie.path}`;
            });
        }
    };

    const showNotification = (message, type = 'info') => {
        // Create a more unique ID using both timestamp and a random string
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; 
        const newNotification = { id, message, type };
        
        setNotifications(prev => [...prev, newNotification]);
        
        // Remove this specific notification after 3 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(notification => notification.id !== id));
        }, 3000);
    };

    const removeNotification = (id) => {
        setNotifications(prev => prev.filter(notification => notification.id !== id));
    };

    const showProgressNotification = (id, message, progress, isComplete) => {
        setNotifications(prev => {
            const existingNotificationIndex = prev.findIndex(n => n.id === id);

            if (existingNotificationIndex !== -1) {
                const updatedNotifications = [...prev];
                updatedNotifications[existingNotificationIndex] = {
                    ...updatedNotifications[existingNotificationIndex],
                    message,
                    progress,
                    isComplete
                };
                return updatedNotifications;
            } else {
                return [...prev, { id, message, type: 'progress', progress, isComplete }];
            }
        });
    };

    const handleScrape = async (url = null) => {
        const urlToScrape = url;

        try {
            const headers = {
                'Content-Type': 'application/json',
                'x-guest-id': guestId.current
            };

            console.log('Scraping URL:', urlToScrape);
            console.log('Guest user');
            
            const response = await fetch(`${API_URL}/api/scrape`, {
                method: 'POST',
                headers: headers,
                ...fetchConfig,
                body: JSON.stringify({ url: urlToScrape }),
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            // Results will come through WebSocket and be saved to browser
            showNotification('Scraping started - results will be saved to your browser', 'info');
            
        } catch (error) {
            console.error('Failed to scrape:', error);
            showNotification(error.message || 'Failed to scrape. Please try again.', 'error');
            removeNotification(scrapeNotificationId.current);
        }
    };

    const handleRemove = async (postLink) => {
        try {
            // Remove from the active collection's localStorage
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            const localStorageLinks = getFromLocalStorage(storageKey);
            saveToLocalStorage(localStorageLinks.filter(item => item.postLink !== postLink), storageKey);

            // Update the local state to remove the entire post
            setMediaUrls(prevMediaUrls => 
                prevMediaUrls.filter(media => media[0] !== postLink)
            );

            showNotification('Media removed successfully', 'success');
        } catch (error) {
            console.error('Failed to remove media:', error);
            showNotification('Failed to remove media', 'error');
        }
    };

    const scrapeSavedLinks = async () => {
        try {
            const response = await fetch(`${API_URL}/api/scrape-saved-links`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                ...fetchConfig
            });
            if (!response.ok) throw new Error('Network response was not ok');
        } catch (error) {
            alert('Failed to scrape media. Please try again later.');
            showNotification('Failed to scrape media. Please try again later.', 'error');
        }
    };

    // Updated handleSimilar function
    const handleSimilar = async (postLink) => {

        const headers = {
            'Content-Type': 'application/json',
            'x-guest-id': guestId.current
        };

        try {
            const response = await fetch(`${API_URL}/api/similar`, {
                method: 'POST',
                headers: headers,
                ...fetchConfig,
                body: JSON.stringify({ url: postLink }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to find similar posts');
            }
            
            // Show appropriate notification
            showNotification('Similar search started - results will be saved to your browser', 'info');
            
        } catch (error) {
            console.error('Failed to find similar:', error);
            showNotification(error.message || 'Failed to find similar posts', 'error');
            removeNotification(similarNotificationId.current);
        }
    };

    const handleTagSearch = async (query) => {
        if (!query || !query.trim()) {
            showNotification('Please enter a tag to search', 'info');
            return;
        }
        
        let notificationId = tagSearchNotificationId.current;
        if (!notificationId) {
            notificationId = `tag_search-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            tagSearchNotificationId.current = notificationId;
        }
        
        try {
            showProgressNotification(notificationId, 'Searching for tags...', 0, false);
            
            // Convert contentFilter string to numeric value
            const contentFilterValue = contentFilter === 'sfw' ? 0 : 1;

            const headers = {
                'Content-Type': 'application/json',
                'x-guest-id': guestId.current
            };

            console.log('Guest user');
            
            const response = await fetch(`${API_URL}/api/search-tags`, {
                method: 'POST',
                headers: headers,
                ...fetchConfig,
                body: JSON.stringify({ 
                    query: query,
                    contentType: contentFilterValue
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to search tags');
            }
            
            // Show notification for guest users
            showNotification('Tag search started - results will be saved to your browser', 'info');
            
        } catch (error) {
            console.error('Failed to search tags:', error);
            showNotification(error.message || 'Failed to search tags', 'error');
        }
    };

    const scrollToMedia = useCallback((index) => {
        const mediaElement = mediaRefs.current[index];
        if (mediaElement) {
            mediaElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, []);

    const handleMediaClick = useCallback((index) => {
        if (!isClickable) return; // Prevent clicking if in cooldown
        setFullscreenMedia(index);
        console.log("HandleMediaClick was called");
        
        // Pause all other videos first
        mediaRefs.current.forEach((media, i) => {
            if (media && i !== index && media.tagName === 'VIDEO') {
                media.pause();
                media.muted = true;
            }
        });

        // Play the selected video and unmute it with a slight delay to ensure proper state
        const selectedVideo = mediaRefs.current[index];
        if (selectedVideo && selectedVideo.tagName === 'VIDEO') {
            selectedVideo.muted = false;
            selectedVideo.volume = globalVolume;
            
            // Use a timeout to ensure the video element is ready
            setTimeout(() => {
                selectedVideo.play().catch(err => {
                    console.log('Autoplay prevented:', err);
                    // Try to play again with user interaction context
                    selectedVideo.muted = true;
                    selectedVideo.play().then(() => {
                        selectedVideo.muted = false;
                    }).catch(secondErr => {
                        console.log('Second autoplay attempt failed:', secondErr);
                    });
                });
            }, 100);
        }
        
        const mediaContainer = document.getElementById('media-container');
        if (mediaContainer) {
            mediaContainer.classList.add('fullscreen-active');
        }
        document.querySelectorAll('.postlink-icon, .close-icon, .remove-icon, .similar-icon, .tag, .tags-panel').forEach(button => {
            button.style.zIndex = '1002';
        });
        scrollToMedia(index);
    }, [isClickable, globalVolume, scrollToMedia]);

    const handleMediaClose = useCallback(() => {
        setFullscreenMedia(null);
        setIsClickable(false); // Disable clicking
       
        // Resume playing only videos that are currently in view, but keep them muted
        mediaRefs.current.forEach((media, index) => {
            if (media && media.tagName === 'VIDEO') {
                // Check if the video element is in the viewport
                const rect = media.getBoundingClientRect();
                const isInViewport = (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
                
                if (isInViewport) {
                    media.muted = true;
                    media.volume = globalVolume;
                    media.play().catch(err => {
                        console.log('Autoplay prevented:', err);
                    });
                } else {
                    // Pause videos that are not in view
                    media.pause();
                }
            }
        });

        const mediaContainer = document.getElementById('media-container');
        if (mediaContainer) {
            mediaContainer.classList.remove('fullscreen-active');
        }
        document.querySelectorAll('.postlink-icon, .close-icon, .remove-icon').forEach(button => {
            button.style.zIndex = '';
        });
        
        // Enable clicking after 500ms (0.5 seconds)
        setTimeout(() => {
            setIsClickable(true);
        }, 100);
    }, [globalVolume]);

    const handleClickOutside = useCallback((event) => {
        if (fullscreenMedia !== null && !mediaRefs.current[fullscreenMedia]?.contains(event.target) && !event.target.closest('.postlink-icon, .close-icon, .remove-icon, .scrape-button, .auto-scroll-button, .similar-icon, .tag, .tags-panel')) {
            handleMediaClose();
        }
        
        // Close mobile menu when clicking outside
        if (isMobile && showMobileMenu && !event.target.closest('.mobile-menu-container, .mobile-menu-button, .mobile-dropdown-menu')) {
            setShowMobileMenu(false);
        }
    }, [fullscreenMedia, isMobile, showMobileMenu, handleMediaClose]);

    const handleKeyPress = useCallback((e) => {
        if (fullscreenMedia === null) return;

        if (e.key === 'ArrowDown') {
            const nextIndex = (fullscreenMedia + 1) % mediaUrls.length;
            
            // Pause current video
            const currentMedia = mediaRefs.current[fullscreenMedia];
            if (currentMedia && currentMedia.tagName === 'VIDEO') {
                currentMedia.pause();
                currentMedia.muted = true;
            }
            
            setFullscreenMedia(nextIndex);
            
            // Play next video
            const nextMedia = mediaRefs.current[nextIndex];
            if (nextMedia && nextMedia.tagName === 'VIDEO') {
                nextMedia.muted = false;
                nextMedia.volume = globalVolume;
                setTimeout(() => {
                    nextMedia.play().catch(err => {
                        console.log('Autoplay prevented:', err);
                        // Fallback: try muted first
                        nextMedia.muted = true;
                        nextMedia.play().then(() => {
                            nextMedia.muted = false;
                        }).catch(() => {});
                    });
                }, 100);
            }
            scrollToMedia(nextIndex);
        } else if (e.key === 'ArrowUp') {
            const prevIndex = (fullscreenMedia - 1 + mediaUrls.length) % mediaUrls.length;
            
            // Pause current video
            const currentMedia = mediaRefs.current[fullscreenMedia];
            if (currentMedia && currentMedia.tagName === 'VIDEO') {
                currentMedia.pause();
                currentMedia.muted = true;
            }
            
            setFullscreenMedia(prevIndex);
            
            // Play previous video
            const prevMedia = mediaRefs.current[prevIndex];
            if (prevMedia && prevMedia.tagName === 'VIDEO') {
                prevMedia.muted = false;
                prevMedia.volume = globalVolume;
                setTimeout(() => {
                    prevMedia.play().catch(err => {
                        console.log('Autoplay prevented:', err);
                        // Fallback: try muted first
                        prevMedia.muted = true;
                        prevMedia.play().then(() => {
                            prevMedia.muted = false;
                        }).catch(() => {});
                    });
                }, 100);
            }
            scrollToMedia(prevIndex);
        }
    }, [fullscreenMedia, mediaUrls.length, scrollToMedia, globalVolume]);



    // Debounced function to handle page increment
    const debouncedPageIncrement = useCallback(() => {
        const timeoutId = setTimeout(() => {
            setCurrentPage(prevPage => prevPage + 1);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, []);

    const lastMediaElementRef = useCallback(node => {
        if (!node) return;
        
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
               debouncedPageIncrement();
            }
        }, { 
            threshold: 0.1,
            rootMargin: autoScroll ? '300px' : '100px' // Larger margin during auto-scroll
        });
                           
        const lastColumnItems = document.querySelectorAll('.masonry-grid_column > div:last-child');
        lastColumnItems.forEach(item => {
            observer.current.observe(item);
        });
        
        // Also observe the provided node
        observer.current.observe(node);
    }, [autoScroll, debouncedPageIncrement]); // Add debouncedPageIncrement dependency

    // Handle window resize for responsive behavior
    useEffect(() => {
        const handleResize = () => {
            const isMobileView = window.innerWidth <= 700; // Adjust breakpoint as needed
            setIsMobile(isMobileView);
            if (!isMobileView) {
                setShowMobileMenu(false); // Close mobile menu when switching to desktop
            }
        };

        // Set initial state
        handleResize();

        // Add event listener
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // Konami Code detection for hidden NSFW toggle
    useEffect(() => {
        const handleKonamiKeyPress = (e) => {
            // Only track konami when not in fullscreen to avoid conflicts
            if (fullscreenMedia !== null) return;
            // Ignore if typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            setKonamiSequence(prev => {
                const newSequence = [...prev, e.code].slice(-konamiCode.length);
                
                // Check if sequence matches konami code
                if (newSequence.length === konamiCode.length && 
                    newSequence.every((key, index) => key === konamiCode[index])) {
                    const newFilter = contentFilter === 'sfw' ? 'nsfw' : 'sfw';
                    setContentFilter(newFilter);
                    saveContentFilterPreference(newFilter);
                    showNotification(`🎮 Konami activated! Content: ${newFilter.toUpperCase()}`, 'success');
                    return []; // Reset sequence
                }
                
                return newSequence;
            });
        };

        document.addEventListener('keydown', handleKonamiKeyPress);
        return () => document.removeEventListener('keydown', handleKonamiKeyPress);
    }, [fullscreenMedia, contentFilter, konamiCode]);

    useEffect(() => {
        setCurrentPage(1);
        setMediaUrls([]);
        fetchMedia(1, initialMediaPerPage);
    }, [filter, tagFilter, tagBlacklist, fetchMedia]);

    useEffect(() => {
        fetchMedia(currentPage, mediaPerPage);
    }, [currentPage, fetchMedia]);

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyPress);
        document.body.style.overflow = fullscreenMedia !== null ? 'hidden' : 'auto';
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyPress);
            document.body.style.overflow = 'auto';
        };
    }, [fullscreenMedia, handleKeyPress, handleClickOutside]);

    useEffect(() => {
        if (autoScroll && fullscreenMedia !== null) {
            const currentMedia = mediaRefs.current[fullscreenMedia];
            const videoDuration = currentMedia && currentMedia.tagName === 'VIDEO' ? currentMedia.duration * 1000 : 10000;
            const timeoutId = setTimeout(() => {
                const nextIndex = (fullscreenMedia + 1) % mediaUrls.length;
                
                // Pause current video
                if (currentMedia && currentMedia.tagName === 'VIDEO') {
                    currentMedia.pause();
                    currentMedia.muted = true;
                }
                
                setFullscreenMedia(nextIndex);
                
                // Play next video
                const nextMedia = mediaRefs.current[nextIndex];
                if (nextMedia && nextMedia.tagName === 'VIDEO') {
                    nextMedia.muted = false;
                    nextMedia.volume = globalVolume;
                    setTimeout(() => {
                        nextMedia.play().catch(err => {
                            console.log('Auto-scroll autoplay prevented:', err);
                            // Fallback: try muted first
                            nextMedia.muted = true;
                            nextMedia.play().then(() => {
                                nextMedia.muted = false;
                            }).catch(() => {});
                        });
                    }, 100);
                }
            }, videoDuration <= 1 ? videoDuration * 5 : videoDuration);
            return () => clearTimeout(timeoutId);
        }
    }, [fullscreenMedia, mediaUrls, autoScroll, globalVolume]);

    useEffect(() => {
        if (autoScroll && fullscreenMedia === null && !loading) {
            // Use CSS scroll-behavior for smooth scrolling
            document.documentElement.style.scrollBehavior = 'auto';
            
            // Calculate scroll distance based on viewport height
            const scrollDistance = Math.max(1, scrollSpeed * 1);
            
            const smoothScroll = () => {
                // Get current scroll position
                const currentScroll = window.pageYOffset;
                const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                
                // Check if we've reached the bottom
                if (currentScroll >= maxScroll - 10) {
                    // Reached bottom, you could implement wrap-around or stop here
                    return;
                }
                
                // Use smooth scrollTo instead of scrollBy
                window.scrollTo({
                    top: currentScroll + scrollDistance,
                    behavior: 'auto'
                });
                
                scrollAnimation.current = requestAnimationFrame(smoothScroll);
            };
            
            // Start with a small delay to prevent immediate scrolling
            const timeoutId = setTimeout(() => {
                scrollAnimation.current = requestAnimationFrame(smoothScroll);
            }, 100);
            
            return () => {
                clearTimeout(timeoutId);
                if (scrollAnimation.current) {
                    cancelAnimationFrame(scrollAnimation.current);
                }
                // Reset scroll behavior
                document.documentElement.style.scrollBehavior = '';
            };
        }
    }, [autoScroll, fullscreenMedia, scrollSpeed, loading]);

    useEffect(() => {
        setRandomSeed(Date.now());
    }, [filter]);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/seedrandom/3.0.5/seedrandom.min.js';
        script.async = true;
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, []);

    const seedrandom = (seed) => {
        if (window.Math.seedrandom) {
            return new window.Math.seedrandom(seed);
        }
        return () => Math.random();
    };

    const selectedMedia = useMemo(() => {
        const startIndex = (currentPage - 1) * mediaPerPage;
        return mediaUrls.slice(0, startIndex + (2 * mediaPerPage));
    }, [currentPage, mediaUrls, mediaPerPage]);

    const handleIconClick = (url) => window.open(url, '_blank');

    const handleScroll = useCallback(() => {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY < 50) {
            prevScrollY.current = currentScrollY;
            return;
        }
        
        prevScrollY.current = currentScrollY;
    }, []);

    useEffect(() => {
        let scrollTimeout;
        
        const onScroll = () => {
            if (scrollTimeout) return;
            scrollTimeout = setTimeout(() => {
                handleScroll();
                scrollTimeout = null;
            }, 200);
        };
        
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, [handleScroll]);

    const breakpointColumnsObj = useMemo(() => ({
        default: 4,
        1100: 3,
        700: 2,
        500: 1
    }), []);

    const handleImageError = (e, link, index) => {
        console.error('Image failed to load:', e);
        e.target.style.display = 'none'; // Hide the broken image
        
        // If in fullscreen and all media in this item failed to display, move to next
        if (fullscreenMedia === index) {
            const mediaItem = mediaUrls[index];
            const allMediaFailed = mediaItem[1].every(mediaLink => {
                const mediaElement = Array.from(document.querySelectorAll(`img[src="${mediaLink}"], video[src="${mediaLink}"]`));
                return mediaElement.every(el => el.style.display === 'none');
            });
            
            if (allMediaFailed) {
                const nextIndex = (index + 1) % mediaUrls.length;
                setFullscreenMedia(nextIndex);
                const nextMedia = mediaRefs.current[nextIndex];
                if (nextMedia && nextMedia.tagName === 'VIDEO') {
                    nextMedia.play().catch(() => {});
                }
            }
        }
    };

    const handleVideoError = async (e) => {
        console.error('Video failed to load:', e);
        if (e.target.error.code === 4) { // 404 error
            e.target.style.display = 'none'; // Hide the broken video
            
            // Get the index from the video element's reference in mediaRefs
            const index = Object.keys(mediaRefs.current).find(key => 
                mediaRefs.current[key] === e.target
            );
            
            if (fullscreenMedia === Number(index)) {
                const nextIndex = (Number(index) + 1) % mediaUrls.length;
                setFullscreenMedia(nextIndex);
                const nextMedia = mediaRefs.current[nextIndex];
                if (nextMedia && nextMedia.tagName === 'VIDEO') {
                    nextMedia.play().catch(() => {});
                }
            }
        }
    };

    // Add this function to handle saving filter preference
    const saveFilterPreference = (filterValue) => {
        document.cookie = `preferred_filter=${filterValue}; max-age=31536000; path=/`; // Expires in 1 year
    };

    // Add this function to get filter from cookie
    const getFilterFromCookie = () => {
        const match = document.cookie.match(/preferred_filter=([^;]+)/);
        return match ? match[1] : 'default';
    };

    const saveScrollSpeedPreference = (speed) => {
        document.cookie = `preferred_scroll_speed=${speed}; max-age=31536000; path=/`;
    };

    const getScrollSpeedFromCookie = () => {
        const match = document.cookie.match(/preferred_scroll_speed=([^;]+)/);
        return match ? parseFloat(match[1]) : 1;
    };

    const saveVolumePreference = (volume) => {
        document.cookie = `preferred_volume=${volume}; max-age=31536000; path=/`;
    };

    const saveShowDefaultLinksPreference = (show) => {
        document.cookie = `show_default_links=${show ? '1' : '0'}; max-age=31536000; path=/`;
    };

    const getShowDefaultLinksFromCookie = () => {
        const match = document.cookie.match(/show_default_links=([^;]+)/);
        return match ? match[1] === '1' : false;
    };

    // Add new functions for content filter preference
    const saveContentFilterPreference = (filter) => {
        document.cookie = `content_filter=${filter}; max-age=31536000; path=/`;
    };

    const getContentFilterFromCookie = () => {
        const match = document.cookie.match(/content_filter=([^;]+)/);
        return match ? match[1] : 'sfw';
    };

    // Add new functions for tag blacklist preference
    const saveTagBlacklistPreference = (blacklist) => {
        document.cookie = `tag_blacklist=${encodeURIComponent(blacklist)}; max-age=31536000; path=/`;
    };

    const getTagBlacklistFromCookie = () => {
        const match = document.cookie.match(/tag_blacklist=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    };

    // Add new functions for auto scroll preference
    const saveAutoScrollPreference = (autoScroll) => {
        document.cookie = `auto_scroll=${autoScroll ? '1' : '0'}; max-age=31536000; path=/`;
    };

    const getAutoScrollFromCookie = () => {
        const match = document.cookie.match(/auto_scroll=([^;]+)/);
        return match ? match[1] === '1' : false;
    };

    const handleFilterChange = (newFilter) => {
        setFilter(newFilter);
        saveFilterPreference(newFilter);
        setRandomSeed(Date.now()); // Ensure random seed is updated when filter changes
        
        // Reset pagination and reload content
        setCurrentPage(1);
        setMediaUrls([]);
        // Don't call fetchMedia here to prevent recursion in useEffect dependencies
    };

    const loadPreferences = () => {
        // Load preferences from cookies
        setScrollSpeed(getScrollSpeedFromCookie());
        setShowDefaultLinks(getShowDefaultLinksFromCookie());
        setContentFilter(getContentFilterFromCookie());
        setAutoScroll(getAutoScrollFromCookie());
        setTagBlacklist(getTagBlacklistFromCookie());
        setFilter(getFilterFromCookie() || 'random');
    };

    useEffect(() => {
        // Load all saved preferences on component mount
        const savedTagBlacklist = getTagBlacklistFromCookie();
        setTagBlacklist(savedTagBlacklist);
        
        const savedShowDefaultLinks = getShowDefaultLinksFromCookie();
        setShowDefaultLinks(savedShowDefaultLinks);
        
        const savedContentFilter = getContentFilterFromCookie();
        setContentFilter(savedContentFilter);
        
        const savedActiveCollection = getActiveCollectionFromCookie();
        setActiveCollection(savedActiveCollection);
    }, []);

    useEffect(() => {
        Object.values(mediaRefs.current).forEach(ref => {
            if (ref && ref.tagName === 'VIDEO') {
                ref.volume = globalVolume;
            }
        });
    }, [globalVolume]);

    const handleExport = async () => {
        try {
            // Export the active collection from localStorage
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            const localData = getFromLocalStorage(storageKey);
            
            if (localData && localData.length > 0) {
                const dataStr = JSON.stringify(localData, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `kupo-nuts-${currentCollection.id}-collection.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showNotification(`${currentCollection.name} collection exported successfully`, 'success');
            } else {
                showNotification(`No items in ${currentCollection.name} collection to export`, 'info');
            }
        } catch (error) {
            console.error('Export error:', error);
            showNotification(error.message || 'Failed to export collection', 'error');
        }
    };

    const handleImport = async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    let content = JSON.parse(e.target.result);
                    
                    // Convert old format if necessary
                    if (!Array.isArray(content)) {
                        content = Object.entries(content).map(([postLink, videoLinks]) => ({
                            postLink,
                            videoLinks: Array.isArray(videoLinks) ? videoLinks : [videoLinks]
                        }));
                    }

                    // Validate content structure
                    const validContent = content.filter(item => {
                        return item && 
                               typeof item === 'object' && 
                               typeof item.postLink === 'string' && 
                               (Array.isArray(item.videoLinks) || typeof item.videoLinks === 'string');
                    });

                    if (validContent.length === 0) {
                        throw new Error('No valid media links found in file');
                    }

                    // Import to localStorage using active collection
                    const currentCollection = collections.find(c => c.id === activeCollection);
                    const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
                    saveToLocalStorage(validContent, storageKey);
                    showNotification(`Successfully imported ${validContent.length} links to ${currentCollection.name} collection`, 'success');
                    
                    // Refresh the display
                    setCurrentPage(1);
                    setMediaUrls([]);
                    await fetchMedia(1, initialMediaPerPage);
                    
                } catch (error) {
                    console.error('Import error:', error);
                    showNotification(error.message || 'Invalid file format', 'error');
                }
            };
            reader.readAsText(file);
        } catch (error) {
            console.error('File reading error:', error);
            showNotification('Failed to read import file', 'error');
        }
        // Reset file input
        event.target.value = '';
    };



    // Add function to mark media as loaded
    const handleMediaLoad = (index) => {
        setLoadedMedia(prev => ({
            ...prev,
            [index]: true
        }));
    };

    // Handle tag click for filtering
    const handleTagClick = (tag, e) => {
        e.stopPropagation(); // Prevent triggering the media click
        
        if (tagFilter === tag) {
            // If clicking the same tag again, clear the filter
            setTagFilter(null);
        } else {
            // Set the new tag filter (replacing any existing filter)
            const query = tag; // Use the tag directly
            setTagSearchQuery(query);
            setTagFilter(query);
            handleTagSearch(query);
        }
        
        // Close fullscreen view when setting a tag filter
        if (fullscreenMedia !== null) {
            handleMediaClose();
        }
        
        // Reset to page 1 when changing filters
        setCurrentPage(1);
        setMediaUrls([]);
        
        // Scroll to top when filtering or clearing tags
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Handle adding tag to current filter
    const handleAddTagToFilter = (tag, e) => {
        e.stopPropagation(); // Prevent triggering the media click
        
        if (!tagFilter) {
            // If no current filter, just set this tag
            handleTagClick(tag, e);
        } else if (!tagFilter.includes(tag)) {
            // Only add if tag isn't already in filter
            const combinedFilter = `${tagFilter} + ${tag}`;
            setTagSearchQuery(combinedFilter);
            setTagFilter(combinedFilter);
            handleTagSearch(combinedFilter);
            
            // Reset to page 1 when changing filters
            setCurrentPage(1);
            setMediaUrls([]);
            
            // Scroll to top when adding tags
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Add a component for the tags panel that supports categorized tags
    const TagsPanel = ({ tags }) => {
        // Handle the case where tags is null or empty
        if (!tags) return <div className="tags-panel"><div className="tags-header">No tags available</div></div>;
        
        // Convert old format (array) to new format (object with categories) if needed
        const categorizedTags = Array.isArray(tags) ? { general: tags } : tags;
        
        // Check if we have any tags in any category
        const hasTags = Object.values(categorizedTags).some(categoryTags => 
            Array.isArray(categoryTags) && categoryTags.length > 0
        );
        
        if (!hasTags) return <div className="tags-panel"><div className="tags-header">No tags available</div></div>;
        
        // Define category display order and labels
        const categories = [
            { key: 'author', label: 'Artists' },
            { key: 'copyright', label: 'Copyright' },
            { key: 'character', label: 'Characters' },
            { key: 'general', label: 'General' }
        ];
        
        const addTagToBlacklist = (tag, e) => {
            e.stopPropagation(); // Prevent triggering the media click
            
            // Get current blacklist and add the new tag
            let currentBlacklist = tagBlacklist ? tagBlacklist.split(',').map(t => t.trim()) : [];
            // Make sure we don't add duplicates
            if (!currentBlacklist.includes(tag)) {
                currentBlacklist.push(tag);
                const newBlacklist = currentBlacklist.join(', ');
                setTagBlacklist(newBlacklist);
                saveTagBlacklistPreference(newBlacklist);
                showNotification(`Added "${tag}" to blacklist`, 'info');
            } else {
                showNotification(`"${tag}" is already in blacklist`, 'info');
            }
        };
        
        return (
            <div className="tags-panel">
                <div className="tags-header">
                    Tags
                </div>
                
                {categories.map(category => {
                    const categoryTags = categorizedTags[category.key];
                    if (!categoryTags || categoryTags.length === 0) return null;
                    
                    return (
                        <div key={category.key} className="tag-category">
                            <h3 className="tag-category-header">{category.label}</h3>
                            <div className="tags-list">
                                {categoryTags.map((tag, idx) => (
                                    <div 
                                        key={`${category.key}-${idx}`}
                                        className={`tag-container`}
                                    >
                                        <span 
                                            className={`tag tag-${category.key} ${tagFilter === tag ? 'active' : ''}`}
                                            onClick={(e) => handleTagClick(tag, e)}
                                        >
                                            {tag}
                                        </span>
                                        <div className="tag-actions">
                                            <button 
                                                className="tag-action tag-action-plus" 
                                                onClick={(e) => handleAddTagToFilter(tag, e)}
                                                title="Filter by this tag"
                                            >
                                                <i className="fas fa-plus"></i>
                                            </button>
                                            <button 
                                                className="tag-action tag-action-minus" 
                                                onClick={(e) => addTagToBlacklist(tag, e)}
                                                title="Add to blacklist"
                                            >
                                                <i className="fas fa-minus"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    useEffect(() => {
        // Store the guest ID in localStorage for persistence
        localStorage.setItem('kupoguestid', guestId.current);
        
        // Load preferences on component mount
        loadPreferences();
        
        const setupSocket = () => {
            const newSocket = io(API_URL, {
                withCredentials: true,
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000
            });
            
            newSocket.on('connect', () => {
                console.log('Connected');
                // Always authenticate as a guest
                newSocket.emit('authenticate', { isGuest: true, guestId: guestId.current });
            });
            
            const handleProgressEvent = (data, type) => {
                
                let notificationIdRef;
                switch (type) {
                    case 'scrape':
                        notificationIdRef = scrapeNotificationId;
                        break;
                    case 'similar':
                        notificationIdRef = similarNotificationId;
                        break;
                    case 'tag_search':
                        notificationIdRef = tagSearchNotificationId;
                        break;
                    default:
                        notificationIdRef = scrapeNotificationId;
                }
                
                if (!notificationIdRef.current) {
                    // Create a more unique ID for progress notifications
                    notificationIdRef.current = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                }
                
                setNotifications(prevNotifications => {
                    const currentNotification = prevNotifications.find(n => n.id === notificationIdRef.current);
                    
                    const totalLinksAdded = currentNotification?.linksAdded || 0;
                    const newLinksCount = data.newItems?.length || 0;
                    
                    const updatedLinksAdded = data.count !== undefined ? 
                        data.count :
                        (totalLinksAdded + newLinksCount);
                    
                    const typeLabel = type.split('_')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                    
                    let linkCountMessage;
                    if (data.isComplete) {
                        linkCountMessage = `${typeLabel}: ${updatedLinksAdded} links found`;
                    } else if (updatedLinksAdded > 0) {
                        linkCountMessage = `${typeLabel}: ${updatedLinksAdded} links found so far`;
                    } else {
                        linkCountMessage = `${typeLabel}: ${data.message || 'Processing...'}`;
                    }
                    
                    const updated = currentNotification 
                        ? prevNotifications.map(n => n.id === notificationIdRef.current ? {
                            ...n,
                            message: linkCountMessage,
                            count: data.count !== undefined ? data.count : n.count || 0,
                            isComplete: data.isComplete,
                            linksAdded: updatedLinksAdded
                        } : n)
                        : [...prevNotifications, {
                            id: notificationIdRef.current,
                            message: linkCountMessage,
                            type: 'progress',
                            count: data.count || 0,
                            isComplete: data.isComplete,
                            linksAdded: updatedLinksAdded
                        }];
                    
                    return updated;
                });
                
                if (data.isComplete) {
                    setTimeout(() => {
                        const currentId = notificationIdRef.current;
                        notificationIdRef.current = null;
                        
                        
                        setNotifications(prev => prev.filter(n => n.id !== currentId));
                    }, 3000);
                }
                
                if (data.newItems && data.newItems.length > 0) {
                    try {
                        setMediaUrls(prevMediaUrls => {
                            let formattedItems = data.newItems.map(item => [
                                item.postLink || '',
                                item.videoLinks || [],
                                item.tags || {}
                            ]);
                            
                            // Add to localStorage
                            const currentCollection = collections.find(c => c.id === activeCollection);
                            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
                            
                            data.newItems.forEach(item => {
                                // Use the active collection's storage key
                                addToLocalStorage(item, storageKey);
                            });

                            return [...prevMediaUrls, ...formattedItems];
                        });
                        
                    } catch (error) {
                        console.error(`Error processing new ${type} items:`, error);
                    }
                }
            };
            
            newSocket.on('scrape_progress', (data) => handleProgressEvent(data, 'scrape'));
            newSocket.on('similar_progress', (data) => handleProgressEvent(data, 'similar'));
            newSocket.on('tag_search_progress', (data) => handleProgressEvent(data, 'tag_search'));
            
            newSocket.on('error', (error) => {
                console.error('WebSocket error:', error);
                showNotification('WebSocket error. Some features may be affected.', 'error');
            });

            newSocket.on('reconnect', () => {
                // Always authenticate as guest on reconnect
                newSocket.emit('authenticate', { isGuest: true, guestId: guestId.current });
                showNotification('WebSocket reconnected', 'success');
            });
            
            newSocket.on('reconnect_error', (error) => {
                console.error('WebSocket reconnect error:', error);
                showNotification('Failed to reconnect WebSocket', 'error');
            });
            
            return newSocket;
        };
        
        // Create socket connection
        const newSocket = setupSocket();
        setSocket(newSocket);
        
        return () => {
            if (newSocket) {
                newSocket.disconnect();
            }
        };
        
    }, [loadPreferences, activeCollection, collections]); // Removed API_URL dependency

    const handleSettingsOpen = () => {
        setShowSettings(true);
    };

    const handleClearCollection = () => {
        setShowConfirmClear(true);
    };

    const confirmClearCollection = () => {
        try {
            // Clear from localStorage for the active collection
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            localStorage.removeItem(storageKey);
            setMediaUrls([]);
            showNotification(`${currentCollection.name} collection cleared`, 'success');
            setShowConfirmClear(false);
        } catch (error) {
            console.error('Error clearing collection:', error);
            showNotification('Failed to clear collection', 'error');
        } finally {
            // Reset media URLs to default
            const defaultMediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
            setMediaUrls(defaultMediaLinks);
        }
    };

    const cancelClearCollection = () => {
        setShowConfirmClear(false);
    };

    const handleTagBlacklistChange = (event) => {
        const newBlacklist = event.target.value;
        setTagBlacklist(newBlacklist);
        saveTagBlacklistPreference(newBlacklist);
    };

    const handleDeleteBlacklisted = () => {
        try {
            const blacklist = tagBlacklist.split(',').map(tag => tag.trim().toLowerCase());
            const filteredMedia = mediaUrls.filter(media => {
                const tags = media[2];
                if (!tags) return true;
                const allTags = [];
                if (Array.isArray(tags)) {
                    tags.forEach(tag => allTags.push(tag.toLowerCase()));
                } else {
                    Object.values(tags).forEach(categoryTags => {
                        if (Array.isArray(categoryTags)) {
                            categoryTags.forEach(tag => allTags.push(tag.toLowerCase()));
                        }
                    });
                }
                return !blacklist.some(blacklistedTag =>
                    allTags.some(tag => tag.includes(blacklistedTag))
                );
            });
            setMediaUrls(filteredMedia);
            showNotification('Deleted all media containing blacklisted tags', 'success');
        } catch (error) {
            console.error('Error deleting blacklisted media:', error);
            showNotification('Failed to delete blacklisted media', 'error');
        }
    };

    const handleUnifiedSearch = () => {
        if (searchQuery.trim().toLowerCase().startsWith('http')) {
            // It's a URL, trigger scraping
            
            // Handle special cases
            if (searchQuery.includes('❤️')) {
                scrapeSavedLinks();
            } else {
                handleScrape(searchQuery.trim()); // Pass URL directly
            }
        } else {
            // It's a tag, trigger tag search
            const query = searchQuery.trim();
            setTagSearchQuery(query);
            handleTagSearch(query);
        }
        
        // Clear the search input
        setSearchQuery('');
    };

    // Add a new ref to store video observers
    const videoObservers = useRef({});

    // Create a function to handle visibility changes for videos
    const handleVideoVisibilityChange = useCallback((entries, observer) => {
        entries.forEach(entry => {
            const video = entry.target;
            
            // If video is intersecting (visible in viewport)
            if (entry.isIntersecting) {
                // Only play if not in fullscreen mode and autoplay is enabled
                if (fullscreenMedia === null && video.tagName === 'VIDEO') {
                    video.play().catch(err => {
                        // Silent catch for autoplay restrictions
                        console.log('Autoplay prevented:', err);
                    });
                }
            } else {
                // If video is not visible and not the fullscreen video, pause it
                if (fullscreenMedia === null && video.tagName === 'VIDEO') {
                    video.pause();
                }
            }
        });
    }, [fullscreenMedia]);

    // Function to setup observers for all video elements
        const setupVideoObservers = useCallback(() => {
            // Skip if currently loading to avoid performance issues
            if (loading) return;
            
            // Clean up any existing observers more efficiently
            Object.values(videoObservers.current).forEach(observer => {
                if (observer) observer.disconnect();
            });
            
            // Clear the observers object
            videoObservers.current = {};
            
            // Setup new observers for all video elements (except fullscreen video)
            Object.entries(mediaRefs.current).forEach(([index, ref]) => {
                if (ref && ref.tagName === 'VIDEO' && parseInt(index) !== fullscreenMedia) {
                    const observer = new IntersectionObserver(
                        handleVideoVisibilityChange, 
                        {
                            root: null, // viewport
                            threshold: 0.2, // 20% visibility triggers callback
                            rootMargin: '50px' // Add margin to reduce frequent triggering
                        }
                    );
                    
                    observer.observe(ref);
                    videoObservers.current[index] = observer;
                }
            });
        }, [handleVideoVisibilityChange, fullscreenMedia, loading]);

    // Setup video observers when media refs change
    useEffect(() => {
        // Only setup observers if not currently loading to avoid interrupting autoscroll
        if (!loading) {
            const timer = setTimeout(() => {
                setupVideoObservers();
            }, 1000); // Increased delay to let loading settle
            
            return () => {
                clearTimeout(timer);
                // Clean up observers on unmount
                Object.values(videoObservers.current).forEach(observer => {
                    if (observer) observer.disconnect();
                });
            };
        }
    }, [mediaUrls.length, setupVideoObservers, loading]); // Added loading dependency

    // Refresh video observers after page changes
    useEffect(() => {
        if (!loading) {
            const timer = setTimeout(() => {
                setupVideoObservers();
            }, 1000);
            
            return () => clearTimeout(timer);
        }
    }, [currentPage, loading, setupVideoObservers]);

    // Refresh video observers when fullscreen changes
    useEffect(() => {
        if (!loading) {
            const timer = setTimeout(() => {
                setupVideoObservers();
            }, 500);
            
            return () => clearTimeout(timer);
        }
    }, [fullscreenMedia, setupVideoObservers, loading]);



    const handleCollectionSwitch = (collectionId) => {
        if (collectionId === activeCollection) return;
        
        // Complete reset of all media-related state
        setActiveCollection(collectionId);
        setCurrentPage(1);
        setMediaUrls([]);
        setLoadedMedia({}); // Reset loaded media state
        setFullscreenMedia(null); // Close any fullscreen media
        setTagFilter(null); // Clear any tag filters
        setSearchQuery(''); // Clear search query
        setTagSearchQuery(''); // Clear tag search query
        mediaSet.current.clear();
        
        // Clear media refs
        mediaRefs.current = [];
        
        // Scroll to top when switching collections
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Save preference
        document.cookie = `active_collection=${collectionId}; max-age=31536000; path=/`;
        
        // Show notification
        const collection = collections.find(c => c.id === collectionId);
        if (collection) {
            showNotification(`Switched to ${collection.name} collection`, 'success');
        }
        
        // Reload content with the new collection
        fetchMedia(1, initialMediaPerPage);
    };

    // Get active collection from cookie on init
    const getActiveCollectionFromCookie = () => {
        const match = document.cookie.match(/active_collection=([^;]+)/);
        return match ? match[1] : 'main';
    };

    return (
        <div>
            <div className="top-search-bar">
                <div className="left-section">
                    <div 
                        className="app-title"
                        onClick={() => window.location.reload()}
                        style={{ cursor: 'pointer' }}
                    >
                        <i className="fas fa-cat logo-icon"></i>
                        <span>Kupo Nuts</span>
                    </div>
                    
                    {/* NSFW indicator - only visible when NSFW mode is active */}
                    {contentFilter === 'nsfw' && (
                        <button
                            onClick={() => {
                                setContentFilter('sfw');
                                saveContentFilterPreference('sfw');
                                showNotification('Content filter set to SFW', 'info');
                            }}
                            className="nsfw-indicator"
                            title="Click to switch to SFW mode"
                            style={{
                                background: '#ff4757',
                                color: 'white',
                                border: 'none',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                marginLeft: '10px',
                                animation: 'pulse 2s infinite'
                            }}
                        >
                            🔞 NSFW
                        </button>
                    )}
                    
                    {!isMobile && (
                        <>
                            {/* NSFW button hidden - use Konami code ↑↑↓↓←→←→BA to toggle */}
                            
                            <div className="collection-tabs">
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
                        </>
                    )}
                </div>
                
                {isMobile ? (
                    <div className="right-section">
                        <div className="mobile-search-and-menu">
                            <div className="mobile-search-container">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleUnifiedSearch()}
                                    placeholder="Search or URL..."
                                    className="search-input"
                                />
                                <button
                                    onClick={handleUnifiedSearch}
                                    className="search-button"
                                >
                                    <i className={`fas ${searchQuery.trim().toLowerCase().startsWith('http') ? 'fa-download' : 'fa-search'}`}></i>
                                </button>
                            </div>
                            
                            {/* NSFW indicator for mobile - only visible when NSFW mode is active */}
                            {contentFilter === 'nsfw' && (
                                <button
                                    onClick={() => {
                                        setContentFilter('sfw');
                                        saveContentFilterPreference('sfw');
                                        showNotification('Content filter set to SFW', 'info');
                                    }}
                                    className="nsfw-indicator mobile-nsfw"
                                    title="Click to switch to SFW mode"
                                    style={{
                                        background: '#ff4757',
                                        color: 'white',
                                        border: 'none',
                                        padding: '6px 10px',
                                        borderRadius: '5px',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        marginLeft: '5px',
                                        marginRight: '5px',
                                        animation: 'pulse 2s infinite'
                                    }}
                                >
                                    🔞
                                </button>
                            )}
                            
                            <div className="mobile-menu-container">
                                <button 
                                    className="mobile-menu-button"
                                    onClick={() => setShowMobileMenu(!showMobileMenu)}
                                    aria-label="Open menu"
                                >
                                    <i className="fas fa-bars"></i>
                                </button>
                            
                            {showMobileMenu && (
                                <div className="mobile-dropdown-menu">
                                    {/* Content Filter hidden - use Konami code ↑↑↓↓←→←→BA to toggle */}
                                    
                                    <div className="mobile-menu-section">
                                        <div className="mobile-menu-header">Collections</div>
                                        {collections.map(collection => (
                                            <button
                                                key={collection.id}
                                                className={`mobile-menu-item collection-item ${activeCollection === collection.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    handleCollectionSwitch(collection.id);
                                                    setShowMobileMenu(false);
                                                }}
                                            >
                                                <i className="fas fa-folder"></i>
                                                {collection.name}
                                                {activeCollection === collection.id && <i className="fas fa-check"></i>}
                                            </button>
                                        ))}
                                    </div>
                                    
                                    <div className="mobile-menu-section">
                                        <div className="mobile-menu-header">Actions</div>
                                        <button 
                                            className="mobile-menu-item" 
                                            onClick={() => {
                                                handleExport();
                                                setShowMobileMenu(false);
                                            }}
                                        >
                                            <i className="fas fa-download"></i>
                                            Export Collection
                                        </button>
                                        <button 
                                            className="mobile-menu-item" 
                                            onClick={() => {
                                                document.getElementById('top-import-file-input').click();
                                                setShowMobileMenu(false);
                                            }}
                                        >
                                            <i className="fas fa-upload"></i>
                                            Import Collection
                                        </button>
                                        <button 
                                            className="mobile-menu-item clear-item" 
                                            onClick={() => {
                                                handleClearCollection();
                                                setShowMobileMenu(false);
                                            }}
                                        >
                                            <i className="fas fa-trash"></i>
                                            Clear Collection
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            <input
                                id="top-import-file-input"
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                style={{ display: 'none' }}
                            />
                        </div>
                    </div>
                    </div>
                ) : (
                    <>
                        <div className="search-container">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleUnifiedSearch()}
                                placeholder="Enter tag to search or URL to scrape..."
                                className="search-input"
                            />
                            <button
                                onClick={handleUnifiedSearch}
                                className="search-button"
                            >
                                <i className={`fas ${searchQuery.trim().toLowerCase().startsWith('http') ? 'fa-download' : 'fa-search'}`}></i>
                            </button>
                        </div>

                        <div className="right-section">
                            <div className="collection-management">
                                <button 
                                    className="collection-mgmt-btn export-btn" 
                                    onClick={handleExport}
                                    title="Export Collection"
                                >
                                    <i className="fas fa-download"></i>
                                    <span>Export</span>
                                </button>
                                <button 
                                    className="collection-mgmt-btn import-btn" 
                                    onClick={() => document.getElementById('top-import-file-input').click()}
                                    title="Import Collection"
                                >
                                    <i className="fas fa-upload"></i>
                                    <span>Import</span>
                                </button>
                                <input
                                    id="top-import-file-input"
                                    type="file"
                                    accept=".json"
                                    onChange={handleImport}
                                    style={{ display: 'none' }}
                                />
                                <button 
                                    className="collection-mgmt-btn clear-btn" 
                                    onClick={handleClearCollection}
                                    title="Clear Collection"
                                >
                                    <i className="fas fa-trash"></i>
                                    <span>Clear</span>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
            
            {tagFilter && fullscreenMedia === null && (
                <div className="active-filter-indicator">
                    <span>Filtering by: {tagFilter}</span>
                    <button 
                        className="clear-button" 
                        onClick={() => {
                            setTagFilter(null);
                            // Scroll to top when clearing filter
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        aria-label="Clear filter"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            )}
            <div className="notifications-container">
                {notifications.map((notification) => (
                    <div 
                        key={notification.id} 
                        className={`notification ${notification.type}`}
                        style={{ top: `${20 + (Array.from(notifications).findIndex(n => n.id === notification.id) * 70)}px` }}
                    >
                        <p className="notification-message">{notification.message}</p>
                        {notification.type === 'progress' && notification.isComplete && (
                            <>
                                <p className="notification-count">
                                    {notification.count} items found
                                </p>
                                <div 
                                    className="notification-progress-bar" 
                                    style={{ width: '100%' }}
                                />
                            </>
                        )}
                        {notification.type === 'progress' && !notification.isComplete && (
                            <div className="notification-loading">
                                <div className="notification-spinner"></div>
                            </div>
                        )}
                        {notification.type !== 'progress' && (
                            <div className="notification-progress" />
                        )}
                    </div>
                ))}
            </div>
            <div className="main-content">
                <Masonry
                    breakpointCols={breakpointColumnsObj}
                    className="masonry-grid"
                    columnClassName="masonry-grid_column"
                >
                    {selectedMedia && selectedMedia.map((media, index) => {
                        const [postLink, videoLinks = [], tags] = media || [];
                        if (!media || videoLinks.length === 0 || !videoLinks[0]) return null;
                        const firstVideoLink = videoLinks && videoLinks[0];
                        const isVideo = firstVideoLink && (firstVideoLink.endsWith('.mp4') || firstVideoLink.endsWith('.mov') || firstVideoLink.endsWith('.webm'));
                        const isRule34Video = postLink && postLink.includes('rule34video');
                        const embedUrl = firstVideoLink ? firstVideoLink.replace('/view/', '/embed/') : '';
                        const isLoaded = loadedMedia[index];

                        return (
                            <div
                                key={index}
                                ref={index >= selectedMedia.length - breakpointColumnsObj.default ? lastMediaElementRef : null}
                                className={`media-wrapper masonry-item ${fullscreenMedia === index ? 'fullscreen' : ''}`}
                                onClick={() => handleMediaClick(index)}
                            >
                                {fullscreenMedia === index && <TagsPanel tags={tags} />}
                                
                                <div className={`media-container ${isLoaded ? 'media-loaded' : 'media-loading'}`}>
                                    {isRule34Video ? (
                                        <iframe
                                            className="media-container"
                                            src={embedUrl}
                                            frameBorder="0"
                                            allowFullScreen
                                            loop
                                            title="Embedded Video"
                                            onLoad={() => handleMediaLoad(index)}
                                        ></iframe>
                                    ) : isVideo ? (
                                        <video
                                            ref={el => mediaRefs.current[index] = el}
                                            src={firstVideoLink}
                                            controls
                                            muted={fullscreenMedia !== index}
                                            volume={globalVolume}
                                            loop
                                            
                                            onClick={fullscreenMedia === index ? (e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            
                                            const video = mediaRefs.current[index];
                                            if (video && video.tagName === 'VIDEO') {
                                                if (video.paused) {
                                                    video.play().catch(err => console.log('Play prevented:', err));
                                                } else {
                                                    video.pause();
                                                }
                                            }
                                        } : undefined}
                                            onLoadedData={() => {
                                                handleMediaLoad(index);
                                                // Apply global volume on load
                                                if (mediaRefs.current[index]) {
                                                    mediaRefs.current[index].volume = globalVolume;
                                                }
                                            }}
                                            onError={(e) => handleVideoError(e, firstVideoLink)}
                                            onLoadStart={() => {
                                                setCookies();
                                            }}
                                        />
                                    ) : (
                                        <img
                                            ref={el => mediaRefs.current[index] = el}
                                            src={firstVideoLink}
                                            alt="Media"
                                            onLoad={() => handleMediaLoad(index)}
                                            onError={(e) => handleImageError(e, firstVideoLink, index)}
                                        />
                                    )}
                                    {fullscreenMedia === index && videoLinks && Array.isArray(videoLinks) && videoLinks.slice(1).map((link, i) => (
                                        <div key={i} className="fullscreen-media-container">
                                            <img className='fullscreen-media'
                                                ref={el => mediaRefs.current[`${index}_${i}`] = el}
                                                src={link}
                                                alt="Media"
                                                onError={(e) => handleImageError(e, link, index)}
                                                onLoad={() => {
                                                    setCookies();
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="icon-container">
                                    <button
                                        className="close-icon"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleMediaClose();
                                        }}
                                        aria-label="Close media"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                    <button
                                        className="postlink-icon"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleIconClick(postLink);
                                        }}
                                        aria-label="Open post link"
                                    >
                                        <i className="fas fa-link"></i>
                                    </button>
                                    {(!postLink.includes('kusowanka') && !postLink.includes('donmai')  && !postLink.includes('e621')) && (
                                        <button
                                            className="similar-icon"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSimilar(postLink);
                                            }}
                                            aria-label="Find similar media"
                                        >
                                            <i className="fas fa-clone"></i>
                                        </button>
                                    )}
                                </div>
                                <button
                                    className="remove-icon"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemove(postLink);
                                    }}
                                    aria-label="Remove media"
                                >
                                        <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        );
                    })}
                    {loading && (
                        <div className="loading-placeholder"></div>
                    )}
                </Masonry>
                <div id="bottom-of-page"></div>
                <div className="overlay-buttons">
                    <button
                        onClick={handleSettingsOpen}
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
                        className={`auto-scroll-button ${autoScroll ? 'active' : ''}`}
                        aria-label="Toggle auto scroll"
                    >
                        <i className="fas fa-arrow-down"></i>
                    </button>
                </div>
                {showSettings && (
                    <div className="settings-dialog">
                        <div className="settings-content">
                            <div className="settings-header">
                                <h2>Gallery Settings</h2>
                                <button onClick={() => setShowSettings(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="settings-body">
                                {/* 1. Tag Blacklist */}
                                <div className="settings-item">
                                    <label htmlFor="tag-blacklist">
                                        <i className="fas fa-ban"></i>
                                        Tag Blacklist (comma-separated)
                                    </label>
                                    <div className="blacklist-controls">
                                        <input
                                            type="text"
                                            id="tag-blacklist"
                                            value={tagBlacklist}
                                            onChange={handleTagBlacklistChange}
                                            placeholder="Enter tags to blacklist"
                                        />
                                        <button 
                                            className="delete-blacklisted-button"
                                            onClick={handleDeleteBlacklisted}
                                            title="Delete all media containing blacklisted tags"
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                            Delete All
                                        </button>
                                    </div>
                                </div>

                                {/* 3. Include Demo Content */}
                                <div className="settings-item">
                                    <label>
                                        <i className="fas fa-eye"></i>
                                        Include Demo Content
                                    </label>
                                    <div className="default-links-toggle settings-toggle">
                                        <button 
                                            className={`content-filter-option ${showDefaultLinks ? 'active' : ''}`}
                                            onClick={() => {
                                                const newValue = true;
                                                setShowDefaultLinks(newValue);
                                                saveShowDefaultLinksPreference(newValue);
                                                setCurrentPage(1);
                                                setMediaUrls([]);
                                                fetchMedia(1, initialMediaPerPage);
                                            }}
                                        >
                                            Show
                                        </button>
                                        <button 
                                            className={`content-filter-option ${!showDefaultLinks ? 'active' : ''}`}
                                            onClick={() => {
                                                const newValue = false;
                                                setShowDefaultLinks(newValue);
                                                saveShowDefaultLinksPreference(newValue);
                                                setCurrentPage(1);
                                                setMediaUrls([]);
                                                fetchMedia(1, initialMediaPerPage);
                                            }}
                                        >
                                            Hide
                                        </button>
                                    </div>
                                </div>

                                {/* 4. Sort by */}
                                <div className="settings-item">
                                    <label htmlFor="filter">
                                        <i className="fas fa-sort"></i>
                                        Sort by
                                    </label>
                                    <select 
                                        id="filter" 
                                        value={filter} 
                                        onChange={(e) => {
                                            handleFilterChange(e.target.value);
                                        }}
                                    >
                                        <option value="Default">Default</option>
                                        <option value="Newest">Newest</option>
                                        <option value="Random">Random</option>
                                        <option value="Oldest">Oldest</option>
                                    </select>
                                </div>

                                {/* 5. Auto-Scroll Speed */}
                                <div className="settings-item">
                                    <label htmlFor="scroll-speed">
                                        <i className="fas fa-arrow-down"></i>
                                        Auto-Scroll Speed: {scrollSpeed}px/tick
                                    </label>
                                    <input
                                        id="scroll-speed"
                                        type="range"
                                        min="0.2"
                                        max="2"
                                        step="0.2"
                                        value={scrollSpeed}
                                        onChange={(e) => {
                                            const newSpeed = parseFloat(e.target.value);
                                            setScrollSpeed(newSpeed);
                                            saveScrollSpeedPreference(newSpeed);
                                        }}
                                        className="scroll-speed-slider"
                                    />
                                    <div className="speed-range-labels">
                                        <span>Very Slow</span>
                                        <span>Fast</span>
                                    </div>
                                </div>

                                {/* 6. Volume */}
                                <div className="settings-item">
                                    <label htmlFor="volume-control">
                                        <i className="fas fa-volume-up"></i>
                                        Volume: {Math.round(globalVolume * 100)}%
                                    </label>
                                    <input
                                        id="volume-control"
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={globalVolume}
                                        onChange={(e) => {
                                            const newVolume = parseFloat(e.target.value);
                                            setGlobalVolume(newVolume);
                                            saveVolumePreference(newVolume);
                                        }}
                                        className="volume-slider"
                                    />
                                    <div className="volume-range-labels">
                                        <span>0%</span>
                                        <span>100%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {showConfirmClear && (
                    <div className="confirm-dialog">
                        <div className="confirm-content">
                            <div className="confirm-header">
                                <h2>Confirm Clear Collection</h2>
                            </div>
                            <div className="confirm-body">
                                <p>Are you sure you want to clear your <strong>{collections.find(c => c.id === activeCollection)?.name}</strong> collection?</p>
                                <p>This action cannot be undone and will remove all saved media.</p>
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
        </div>
    );
};

export default React.memo(VideoList);