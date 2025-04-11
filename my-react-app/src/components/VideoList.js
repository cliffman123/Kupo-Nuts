import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Masonry from 'react-masonry-css';
import './VideoList.css';
import JSZip from 'jszip';
import defaultLinks from './default-links.json';
import config from '../config'; // Import the config file
import io from 'socket.io-client';

const API_URL = config.API_URL;
const LOCAL_STORAGE_KEY = 'kupoNuts_mediaLinks'; // Add this constant for localStorage key

// Add helper functions for localStorage
const saveToLocalStorage = (mediaLinks) => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mediaLinks));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
};

const getFromLocalStorage = () => {
    try {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return [];
    }
};

const addToLocalStorage = (mediaItem) => {
    try {
        const currentLinks = getFromLocalStorage();
        // Check if item already exists to prevent duplicates
        const exists = currentLinks.some(item => item.postLink === mediaItem.postLink);
        if (!exists) {
            currentLinks.push(mediaItem);
            saveToLocalStorage(currentLinks);
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
    const [scrapeUrl, setScrapeUrl] = useState('');
    const [fullscreenMedia, setFullscreenMedia] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [autoScroll, setAutoScroll] = useState(!isLoggedIn);
    const [filter, setFilter] = useState('random'); // Default to random for non-logged in users
    const [showSettings, setShowSettings] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [showLogin, setShowLogin] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [passwordRequirements, setPasswordRequirements] = useState({
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false
    });
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [isClickable, setIsClickable] = useState(true);
    const [loadedMedia, setLoadedMedia] = useState({});
    const [randomSeed, setRandomSeed] = useState(Date.now());
    const [tagFilter, setTagFilter] = useState(null);
    const [contentFilter, setContentFilter] = useState('sfw'); // Default to 'sfw'
    const [globalVolume, setGlobalVolume] = useState(0.1); // Add global volume state with default 10%
    const [socket, setSocket] = useState(null); // Add socket state here
    const [searchQuery, setSearchQuery] = useState(''); // New unified search query
    const guestId = useRef(localStorage.getItem('kupoguestid') || `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const [showDefaultLinks, setShowDefaultLinks] = useState(false); // Add state for showing default links
    const prevScrollY = useRef(0); // Add ref to track previous scroll position
    const mediaRefs = useRef([]);
    const mediaSet = useRef(new Set());
    const observer = useRef();
    const scrapeNotificationId = useRef(null);
    const similarNotificationId = useRef(null); // Keep separate IDs for different operations
    const tagSearchNotificationId = useRef(null);
    const [showConfirmClear, setShowConfirmClear] = useState(false);
    const [tagBlacklist, setTagBlacklist] = useState('');
    const [scrollSpeed, setScrollSpeed] = useState(3); // Default scroll speed
    const [tagSearchQuery, setTagSearchQuery] = useState('');
    let defaultMediaLinks = [];

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
            let mediaLinks;
            if (isLoggedIn) {
                const response = await fetch(`${API_URL}/api/media`, {
                    ...fetchConfig,
                    cache: 'no-cache'
                });
                
                if (!response.ok) {
                    if (response.status === 401) {
                        //setIsLoggedIn(false);
                        //throw new Error('Jlullaby');
                    }
                    //throw new Error('Network response was not ok');
                }
                
                const data = await response.json();
                if (data && data.length > 0) {
                    mediaLinks = data.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
                }
                
                // Load default links if option is enabled
                if (showDefaultLinks && defaultLinks?.length > 0) {
                    defaultMediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
                }
            } else {
                // Non-logged in users - prioritize links from localStorage
                const localStorageLinks = getFromLocalStorage();
                
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
                    defaultMediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
                }
            }
            
            // Combine user links with default links if needed
            if (defaultMediaLinks.length > 0) {
                if (isLoggedIn && showDefaultLinks) {
                    mediaLinks = [...mediaLinks, ...defaultMediaLinks];
                } else if (!isLoggedIn) {
                    // For non-logged in users, ensure we add default links if empty or requested
                    mediaLinks = mediaLinks.length > 0 ? 
                        (showDefaultLinks ? [...mediaLinks, ...defaultMediaLinks] : mediaLinks) : 
                        defaultMediaLinks;
                }
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
            
            // As a fallback for non-logged in users when fetch fails, use localStorage and defaults
            if (!isLoggedIn) {
                const localStorageLinks = getFromLocalStorage();
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
                            // For non-logged in users, keep local storage items first (in reverse order)
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
            }
        } finally {
            setLoading(false);
        }
    }, [filter, isLoggedIn, shuffleArray, tagFilter, showDefaultLinks, filterMediaByTag, applyTagBlacklist]);

    const setCookies = () => {
        const cookies = JSON.parse(localStorage.getItem('cookies'));
        if (cookies) {
            cookies.forEach(cookie => {
                document.cookie = `${cookie.name}=${cookie.value}; domain=${cookie.domain}; path=${cookie.path}`;
            });
        }
    };

    const fetchTweetsFromList = async (username) => {
        try {
            const response = await fetch(`${API_URL}/api/tweets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
                ...fetchConfig
            });
            if (!response.ok) throw new Error('Network response was not ok');
        } catch (error) {
            alert('Failed to fetch tweets. Please try again later.');
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
        const urlToScrape = url || scrapeUrl;

        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(isLoggedIn ? {
                    'Authorization': `Bearer ${document.cookie.split('token=')[1]}`
                } : {
                    'x-guest-id': guestId.current
                })
            };

            console.log('Scraping URL:', urlToScrape);
            console.log(isLoggedIn ? 'Logged in' : 'Guest user');
            
            // Use the same API endpoint for both logged-in and guest users
            const response = await fetch(`${API_URL}/api/scrape`, {
                method: 'POST',
                headers: headers,
                ...fetchConfig,
                body: JSON.stringify({ url: urlToScrape }),
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Please login to scrape media');
                }
                throw new Error('Network response was not ok');
            }
            
            // For both logged-in users and guests, results will come through WebSocket
            if (!isLoggedIn) {
                showNotification('Scraping started - results will be saved to your browser', 'info');
            }
            
            setScrapeUrl('');
            
        } catch (error) {
            console.error('Failed to scrape:', error);
            showNotification(error.message || 'Failed to scrape. Please try again.', 'error');
            removeNotification(scrapeNotificationId.current);
        }
    };

    const handleRemove = async (postLink) => {
        try {
            if (isLoggedIn) {
                // Original server-side remove logic
                const response = await fetch(`${API_URL}/api/remove`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                    },
                    ...fetchConfig,
                    body: JSON.stringify({ postLink }),
                });

                if (!response.ok) {
                    throw new Error('Failed to remove media');
                }
            } else {
                // For non-logged in users, remove from localStorage
                const localStorageLinks = getFromLocalStorage();
                saveToLocalStorage(localStorageLinks.filter(item => item.postLink !== postLink));
            }

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

    const addScrapeUrlToFile = async (url) => {
        try {
            const response = await fetch(`${API_URL}/api/save-scrape-url`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    // Add credentials header if needed
                    'Authorization': `Bearer ${document.cookie.split('token=')[1]}`
                },
                ...fetchConfig,
                body: JSON.stringify({ url }),
            });
            if (!response.ok) {
                if (response.status === 401) {
                    //setIsLoggedIn(false);
                    //setShowLogin(true);
                    //throw new Error('Please login to save scrape URL');
                }
                throw new Error('Network response was not ok');
            }
        } catch (error) {
            console.error('Failed to add scrape URL to file:', error);
            showNotification(error.message || 'Failed to save scrape URL', 'error');
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
            ...(isLoggedIn ? {
                'Authorization': `Bearer ${document.cookie.split('token=')[1]}`
            } : {
                'x-guest-id': guestId.current
            })
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
            
            // For both user types, show appropriate notification
            if (!isLoggedIn) {
                showNotification('Similar search started - results will be saved to your browser', 'info');
            }
            
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
                ...(isLoggedIn ? {
                    'Authorization': `Bearer ${document.cookie.split('token=')[1]}`
                } : {
                    'x-guest-id': guestId.current
                })
            };

            console.log(isLoggedIn ? 'Logged in' : 'Guest user');
            
            const response = await fetch(`${API_URL}/api/search-tags`, {
                method: 'POST',
                headers: headers,
                ...fetchConfig,
                body: JSON.stringify({ 
                    query: tagSearchQuery,
                    contentType: contentFilterValue
                }),
            });

            if (!response.ok) {
                if (response.status === 401 && isLoggedIn) {
                    setIsLoggedIn(false);
                    setShowLogin(true);
                    throw new Error('Please login to search tags');
                }
                throw new Error('Failed to search tags');
            }
            
            // Appropriate notification for guest users
            if (!isLoggedIn) {
                showNotification('Tag search started - results will be saved to your browser', 'info');
            }
            
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

    const handleMediaClick = (index) => {
        if (!isClickable) return; // Prevent clicking if in cooldown
        setFullscreenMedia(index);
        mediaRefs.current.forEach((media, i) => {
            if (media && i !== index && media.tagName === 'VIDEO') media.pause();
        });
        const mediaContainer = document.getElementById('media-container');
        if (mediaContainer) {
            mediaContainer.classList.add('fullscreen-active');
        }
        document.querySelectorAll('.postlink-icon, .close-icon, .remove-icon, .similar-icon, .tag, .tags-panel').forEach(button => {
            button.style.zIndex = '1002';
        });
        document.querySelector('.profile-button').style.display = 'none';
        scrollToMedia(index);
    };

    const handleMediaClose = () => {
        setFullscreenMedia(null);
        setIsClickable(false); // Disable clicking
        mediaRefs.current.forEach(media => {
            if (media && media.tagName === 'VIDEO') media.pause();
        });
        const mediaContainer = document.getElementById('media-container');
        if (mediaContainer) {
            mediaContainer.classList.remove('fullscreen-active');
        }
        document.querySelectorAll('.postlink-icon, .close-icon, .remove-icon').forEach(button => {
            button.style.zIndex = '';
        });
        document.querySelector('.profile-button').style.display = '';
        
        // Enable clicking after 500ms (0.5 seconds)
        setTimeout(() => {
            setIsClickable(true);
        }, 100);
    };

    const handleClickOutside = (event) => {
        if (fullscreenMedia !== null && !mediaRefs.current[fullscreenMedia]?.contains(event.target) && !event.target.closest('.postlink-icon, .close-icon, .remove-icon, .scrape-button, .auto-scroll-button, .similar-icon, .tag, .tags-panel')) {
            handleMediaClose();
        }
    };

    const handleKeyPress = useCallback((e) => {
        if (fullscreenMedia === null) return;

        if (e.key === 'ArrowDown') {
            const nextIndex = (fullscreenMedia + 1) % mediaUrls.length;
            setFullscreenMedia(nextIndex);
            const nextMedia = mediaRefs.current[nextIndex];
            if (nextMedia && nextMedia.tagName === 'VIDEO') {
                nextMedia.play().catch(() => {});
            }
            scrollToMedia(nextIndex);
        } else if (e.key === 'ArrowUp') {
            const prevIndex = (fullscreenMedia - 1 + mediaUrls.length) % mediaUrls.length;
            setFullscreenMedia(prevIndex);
            const prevMedia = mediaRefs.current[prevIndex];
            if (prevMedia && prevMedia.tagName === 'VIDEO') {
                prevMedia.play().catch(() => {});
            }
            scrollToMedia(prevIndex);
        }
    }, [fullscreenMedia, mediaUrls.length, scrollToMedia]);

    const lastMediaElementRef = useCallback(node => {
        if (!node) return;
        
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setCurrentPage(prevPage => prevPage + 1);
            }
        }, { 
            threshold: 0.1,
            rootMargin: '100px'
        });
                           
        const lastColumnItems = document.querySelectorAll('.masonry-grid_column > div:last-child');
        lastColumnItems.forEach(item => {
            observer.current.observe(item);
        });
        
        // Also observe the provided node
        observer.current.observe(node);
    }, []);

    useEffect(() => {
        setCurrentPage(1);
        setMediaUrls([]);
        fetchMedia(1, initialMediaPerPage);
    }, [filter, tagFilter, fetchMedia]);

    useEffect(() => {
        setCurrentPage(1);
        setMediaUrls([]);
        fetchMedia(1, initialMediaPerPage);
    }, [tagBlacklist, fetchMedia]);

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
    }, [fullscreenMedia, handleKeyPress]);

    useEffect(() => {
        if (autoScroll && fullscreenMedia !== null) {
            const currentMedia = mediaRefs.current[fullscreenMedia];
            const videoDuration = currentMedia.tagName === 'VIDEO' ? currentMedia.duration * 1000 : 10000;
            const timeoutId = setTimeout(() => {
                const nextIndex = (fullscreenMedia + 1) % mediaUrls.length;
                setFullscreenMedia(nextIndex);
                const nextMedia = mediaRefs.current[nextIndex];
                if (nextMedia && nextMedia.tagName === 'VIDEO') {
                    nextMedia.play().catch(() => {});
                }
            }, videoDuration <= 1 ? videoDuration * 5 : videoDuration);
            return () => clearTimeout(timeoutId);
        }
    }, [fullscreenMedia, mediaUrls, autoScroll]);

    useEffect(() => {
        if (autoScroll && fullscreenMedia === null) {
            const intervalId = setInterval(() => {
                window.scrollBy({ top: 3, behavior: 'smooth' });
            }, 1);
            return () => clearInterval(intervalId);
        }
    }, [autoScroll, fullscreenMedia]);

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
    });

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

    const checkPasswordRequirements = (password) => {
        setPasswordRequirements({
            length: password.length >= 12,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password),
            special: /[@$!%*?&]/.test(password)
        });
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        
        try {
            const response = await fetch(`${API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                ...fetchConfig,
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Login failed');
            }

            setIsLoggedIn(true);
            setShowLogin(false);
            showNotification('Login successful', 'success');
            setUsername('');
            setPassword('');
            
            // Load saved filter preference after login
            const savedFilter = getFilterFromCookie();
            setFilter(savedFilter || 'default'); 
            
            // Reset page and fetch media after successful login
            setCurrentPage(1);
            setMediaUrls([]);
            
            // Update socket authentication status after successful login
            if (socket) {
                socket.emit('authenticate', { username });
            }
            
            await fetchMedia(1, initialMediaPerPage);
            
        } catch (error) {
            setLoginError(error.message);
            showNotification(error.message, 'error');
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoginError('');

        try {
            const response = await fetch(`${API_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Registration failed');
            }

            showNotification('Registration successful! Please log in.', 'success');
            setIsRegistering(false);
            setUsername('');
            setPassword('');
        } catch (error) {
            setLoginError(error.message);
            showNotification(error.message, 'error');
        }
    };

    const handleLogout = async () => {
        try {
            if (!isLoggedIn) {
                setShowLogin(true);
                return;
            }
            
            await fetch(`${API_URL}/api/logout`, {
                method: 'POST',
                ...fetchConfig,
            });
            
            // Update state first
            setIsLoggedIn(false);
            setFilter('random'); // Don't trigger extra render cycle with handleFilterChange
            showNotification('Logged out successfully', 'success');
            
            // Close profile menu
            setShowProfileMenu(false);
            
            // Instead of fetching from API, just set to default links for non-logged in users
            if (defaultLinks && defaultLinks.length > 0) {
                const links = defaultLinks.map(item => [item.postLink || '', item.videoLinks]);
                const shuffledLinks = shuffleArray([...links]);
                setMediaUrls(shuffledLinks.slice(0, initialMediaPerPage));
            } else {
                setMediaUrls([]);
            }
            
            // Reset page
            setCurrentPage(1);
            
        } catch (error) {
            showNotification('Logout failed', 'error');
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
        return match ? parseInt(match[1], 10) : 3;
    };

    const saveVolumePreference = (volume) => {
        document.cookie = `preferred_volume=${volume}; max-age=31536000; path=/`;
    };

    const getVolumeFromCookie = () => {
        const match = document.cookie.match(/preferred_volume=([^;]+)/);
        return match ? parseFloat(match[1]) : 0.1;
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

    const checkLoginStatus = async () => {
        try {
            const response = await fetch(`${API_URL}/api/verify-auth`, {
                ...fetchConfig,
                cache: 'no-cache'
            });

            if (response.ok) {
                const userData = await response.json();
                setIsLoggedIn(true);
                setUsername(userData.username || '');
                
                // Get user preferences after confirming login
                const savedFilter = getFilterFromCookie();
                setFilter(savedFilter || 'default');
                
                // If socket exists, authenticate with the confirmed username
                if (socket) {
                    socket.emit('authenticate', { username: userData.username });
                }
            } else {
                setIsLoggedIn(false);
                setFilter('random'); // Default for non-logged users
            }

            // Load preferences from cookies regardless of login status
            setScrollSpeed(getScrollSpeedFromCookie());
            setShowDefaultLinks(getShowDefaultLinksFromCookie());
            setContentFilter(getContentFilterFromCookie());
            setAutoScroll(getAutoScrollFromCookie());

        } catch (error) {
            console.error('Error checking login status:', error);
            setIsLoggedIn(false);
            setFilter('random');

            // Load preferences even on error
            setScrollSpeed(getScrollSpeedFromCookie());
            setContentFilter(getContentFilterFromCookie());
            setAutoScroll(getAutoScrollFromCookie());

            console.log('Error during login check, loading local storage content');
        }
    };

    useEffect(() => {
        setCurrentPage(1);
        setMediaUrls([]);
        fetchMedia(1, initialMediaPerPage);
    }, [isLoggedIn, filter, fetchMedia]);

    useEffect(() => {
        const savedScrollSpeed = getScrollSpeedFromCookie();
        setScrollSpeed(savedScrollSpeed);
        // Initialize the slider fill on component mount
        setTimeout(() => updateSliderFill(savedScrollSpeed), 100);
    }, []);

    useEffect(() => {
        const savedVolume = getVolumeFromCookie();
        setGlobalVolume(savedVolume);
        // Initialize the slider fill on component mount
        setTimeout(() => updateVolumeSliderFill(savedVolume), 100);
    }, []);

    useEffect(() => {
        Object.values(mediaRefs.current).forEach(ref => {
            if (ref && ref.tagName === 'VIDEO') {
                ref.volume = globalVolume;
            }
        });
    }, [globalVolume]);

    useEffect(() => {
        const savedShowDefaultLinks = getShowDefaultLinksFromCookie();
        setShowDefaultLinks(savedShowDefaultLinks);
    }, []);

    useEffect(() => {
        const savedContentFilter = getContentFilterFromCookie();
        setContentFilter(savedContentFilter);
    }, []);

    const handleExport = async () => {
        try {
            const mediaResponse = await fetch(`${API_URL}/api/export-links`, {
                ...fetchConfig,
                headers: {
                    ...fetchConfig.headers,
                    'Accept': 'application/json'
                }
            });
            
            if (!mediaResponse.ok) {
                throw new Error(`Failed to export media links: ${mediaResponse.statusText}`);
            }
            
            const scrapeResponse = await fetch(`${API_URL}/api/export-scrape-list`, {
                ...fetchConfig,
                headers: {
                    ...fetchConfig.headers,
                    'Accept': 'application/json'
                }
            });
            
            if (!scrapeResponse.ok) {
                throw new Error(`Failed to export scrape links: ${scrapeResponse.statusText}`);
            }

            // Parse responses with error handling
            let mediaData;
            let scrapeData;
            
            try {
                mediaData = await mediaResponse.json();
                // Accept either array or object with links property
                if (!Array.isArray(mediaData) && !mediaData.links) {
                    mediaData = []; // Default to empty array if no valid data
                }
                // Convert to array if it's in object format
                mediaData = Array.isArray(mediaData) ? mediaData : mediaData.links || [];
            } catch (error) {
                console.error('Media parse error:', error);
                mediaData = []; // Default to empty array on parse error
            }

            try {
                scrapeData = await scrapeResponse.json();
                // Accept either array or object format
                if (typeof scrapeData === 'string') {
                    scrapeData = [scrapeData]; // Convert single string to array
                } else if (!Array.isArray(scrapeData) && typeof scrapeData === 'object') {
                    scrapeData = scrapeData.urls || Object.values(scrapeData) || []; // Try to extract URLs
                } else if (!Array.isArray(scrapeData)) {
                    scrapeData = []; // Default to empty array if no valid data
                }
            } catch (error) {
                console.error('Scrape parse error:', error);
                scrapeData = []; // Default to empty array on parse error
            }
            
            // Create zip file with error handling
            try {
                const zip = new JSZip();
                zip.file("media-links.json", JSON.stringify(mediaData, null, 2));
                zip.file("scrape-links.json", JSON.stringify(scrapeData, null, 2));
                
                const content = await zip.generateAsync({ type: "blob" });
                
                // Create download link
                const url = window.URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'KupoNutEX.zip';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                showNotification('Collection exported successfully', 'success');
            } catch (error) {
                throw new Error('Failed to create zip file: ' + error.message);
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

                    if (isLoggedIn) {
                        // Server-side import for logged-in users
                        const response = await fetch(`${API_URL}/api/import-links`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            ...fetchConfig,
                            body: JSON.stringify(validContent)
                        });

                        if (!response.ok) throw new Error('Failed to import links');
                        
                        showNotification(`Successfully imported ${validContent.length} links`, 'success');
                    } else {
                        // Local storage import for non-logged-in users
                        saveToLocalStorage(validContent);
                        showNotification(`Successfully imported ${validContent.length} links to local storage`, 'success');
                    }
                    
                    // Refresh the display in both cases
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

    const handleImportScrapeList = async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const content = JSON.parse(e.target.result);
                    
                    const response = await fetch(`${API_URL}/api/import-scrape-list`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        ...fetchConfig,
                        body: JSON.stringify(content)
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.message || 'Failed to import scrape list');
                    }

                    const result = await response.json();
                    showNotification(`Successfully imported ${result.total} URLs and started scraping`, 'success');
                    
                    // Refresh media after import and scrape
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
            // Set the new tag filter
            const query = searchQuery.trim();
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
                                    <span 
                                        key={`${category.key}-${idx}`}
                                        className={`tag tag-${category.key} ${tagFilter === tag ? 'active' : ''}`}
                                        onClick={(e) => handleTagClick(tag, e)}
                                    >
                                        {tag}
                                    </span>
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
                checkLoginStatus(); // Ensure login status is checked on connection
                if (isLoggedIn && username) {
                    newSocket.emit('authenticate', { username });
                } else {
                    // Authenticate as a guest
                    newSocket.emit('authenticate', { isGuest: true, guestId: guestId.current });
                }
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
                            
                            // For non-logged in users, also add to localStorage
                            if (!isLoggedIn) {
                                data.newItems.forEach(item => {
                                    addToLocalStorage(item);
                                });
                            }

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
                
                if (isLoggedIn && username) {
                    newSocket.emit('authenticate', { username });
                } else {
                    newSocket.emit('authenticate', { isGuest: true, guestId: guestId.current });
                }
                
                showNotification('WebSocket reconnected', 'success');
            });
            
            newSocket.on('reconnect_error', (error) => {
                console.error('WebSocket reconnect error:', error);
                showNotification('Failed to reconnect WebSocket', 'error');
            });
            
            return newSocket;
        };
        
        // Create socket connection regardless of login state
        const newSocket = setupSocket();
        setSocket(newSocket);
        
        return () => {
            if (newSocket) {
                newSocket.disconnect();
            }
        };
        
    }, [isLoggedIn, username, API_URL]); // Removed guestId from dependencies

    const updateSliderFill = (value) => {
        const slider = document.getElementById('scroll-speed');
        if (slider) {
            const percentage = ((value - 1) / 9) * 100;
            slider.style.backgroundSize = `${percentage}% 100%`;
        }
    };

    const updateVolumeSliderFill = (value) => {
        const slider = document.getElementById('volume-control');
        if (slider) {
            const percentage = value * 100;
            slider.style.backgroundSize = `${percentage}% 100%`;
        }
    };

    const handleSettingsOpen = () => {
        setShowSettings(true);
        // Initialize sliders on settings open
        setTimeout(() => {
            updateSliderFill(scrollSpeed);
            updateVolumeSliderFill(globalVolume);
        }, 50); // Small timeout to ensure DOM elements are rendered
    };

    const handleClearCollection = () => {
        setShowConfirmClear(true);
    };

    const confirmClearCollection = () => {
        try {
            if (isLoggedIn) {
                // Clear from server
                fetch(`${API_URL}/api/clear-collection`, {
                    method: 'POST',
                    ...fetchConfig,
                }).then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to clear collection on server');
                    }
                    setMediaUrls([]);
                    showNotification('Collection cleared successfully', 'success');
                }).catch(error => {
                    console.error('Error clearing collection:', error);
                    showNotification('Failed to clear collection', 'error');
                });
            } else {
                // Clear from localStorage
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                setMediaUrls([]);
                showNotification('Local collection cleared', 'success');
            }
            setShowConfirmClear(false);
        } catch (error) {
            console.error('Error clearing collection:', error);
            showNotification('Failed to clear collection', 'error');
        } finally {
            // Reset media URLs to default if not logged in
            const defaultMediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
            setMediaUrls(defaultMediaLinks);
        }
    };

    const cancelClearCollection = () => {
        setShowConfirmClear(false);
    };

    const handleTagBlacklistChange = (event) => {
        setTagBlacklist(event.target.value);
    };

    const handleUnifiedSearch = () => {
        if (searchQuery.trim().toLowerCase().startsWith('http')) {
            // It's a URL, set scrapeUrl and trigger scraping
            setScrapeUrl(searchQuery.trim());
            
            // Handle special cases
            if (searchQuery.includes('@')) {
                const listId = searchQuery.trim().replace('@', '');
                fetchTweetsFromList(listId);
            } else if (searchQuery.includes('❤️')) {
                scrapeSavedLinks();
            } else {
                // Regular URL
                addScrapeUrlToFile(searchQuery.trim());
                handleScrape(searchQuery.trim()); // Pass URL directly
            }
        } else {
            // It's a tag, trigger tag search
            const query = searchQuery.trim();
            setTagSearchQuery(query);
            setTagFilter(query);
            handleTagSearch(query);
        }
        
        // Clear the search input
        setSearchQuery('');
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
                </div>
                
                <button
                    onClick={() => {
                        const newFilter = contentFilter === 'sfw' ? 'nsfw' : 'sfw';
                        setContentFilter(newFilter);
                        saveContentFilterPreference(newFilter);
                    }}
                    className={`content-filter-button ${contentFilter}`}
                    aria-label="Toggle content filter"
                    title={`Content filter: ${contentFilter.toUpperCase()}`}
                >
                    {contentFilter === 'sfw' ? 'SFW' : 'NSFW'}
                </button>
                
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
                    <button
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className={`profile-button ${isLoggedIn ? 'logged-in' : ''}`}
                        aria-label="Profile"
                    >
                        <i className={`fas ${isLoggedIn ? 'fa-user-check' : 'fa-user'}`}></i>
                    </button>
                </div>
            </div>
            
            {tagFilter && fullscreenMedia === null && (
                <div className="active-filter-indicator">
                    <span>Filtering by: {tagFilter}</span>
                    <button 
                        className="clear-button" 
                        onClick={() => setTagFilter(null)}
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
                    {showProfileMenu && (
                        <div className="profile-menu">
                            <div className="profile-menu-header">
                                <h3>Profile Menu</h3>
                                <button onClick={() => setShowProfileMenu(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="profile-menu-content">
                                {isLoggedIn ? (
                                    <>
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
                                        <button className="profile-menu-button danger" onClick={handleClearCollection}>
                                            <i className="fas fa-ban"></i>
                                            Clear Collection
                                        </button>
                                        <button className="profile-menu-button danger" onClick={handleLogout}>
                                            <i className="fas fa-sign-out-alt"></i>
                                            Logout
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button className="profile-menu-button" onClick={() => {
                                            setShowLogin(true);
                                            setShowProfileMenu(false);
                                        }}>
                                            <i className="fas fa-sign-in-alt"></i>
                                            Login
                                        </button>
                                        <button className="profile-menu-button" onClick={() => {
                                            setShowLogin(true);
                                            setIsRegistering(true);
                                            setShowProfileMenu(false);
                                        }}>
                                            <i className="fas fa-user-plus"></i>
                                            Register
                                        </button>
                                        <div className="profile-menu-divider"></div>
                                        <button className="profile-menu-button" onClick={() => {
                                            // For non-logged in users, directly export from localStorage
                                            try {
                                                const localData = getFromLocalStorage();
                                                if (localData && localData.length > 0) {
                                                    const dataStr = JSON.stringify(localData, null, 2);
                                                    const dataBlob = new Blob([dataStr], { type: 'application/json' });
                                                    const url = URL.createObjectURL(dataBlob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = 'kupo-nuts-local-collection.json';
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    document.body.removeChild(a);
                                                    URL.revokeObjectURL(url);
                                                    showNotification('Local collection exported successfully', 'success');
                                                } else {
                                                    showNotification('No local collection to export', 'info');
                                                }
                                            } catch (error) {
                                                showNotification('Failed to export local collection', 'error');
                                            }
                                        }}>
                                            <i className="fas fa-download"></i>
                                            Export Local Collection
                                        </button>
                                        <label className="profile-menu-button">
                                            <i className="fas fa-upload"></i>
                                            Import Collection
                                            <input
                                                type="file"
                                                accept=".json"
                                                onChange={(event) => {
                                                    try {
                                                        const file = event.target.files[0];
                                                        if (!file) return;
                                                        
                                                        const reader = new FileReader();
                                                        reader.onload = (e) => {
                                                            try {
                                                                const json = JSON.parse(e.target.result);
                                                                if (Array.isArray(json)) {
                                                                    saveToLocalStorage(json);
                                                                    setMediaUrls(json.map(item => [item.postLink || '', item.videoLinks]));
                                                                    showNotification('Local collection imported successfully', 'success');
                                                                } else {
                                                                    showNotification('Invalid file format', 'error');
                                                                }
                                                            } catch (error) {
                                                                showNotification('Failed to parse import file', 'error');
                                                            }
                                                        };
                                                        reader.readAsText(file);
                                                    } catch (error) {
                                                        showNotification('Failed to read import file', 'error');
                                                    }
                                                    event.target.value = '';
                                                }}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                        <button className="profile-menu-button danger" onClick={handleClearCollection}>
                                            <i className="fas fa-ban"></i>
                                            Clear Local Collection
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
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
                                {/* Content filter moved to top bar, removed from here */}
                                
                                {isLoggedIn && (
                                    <div className="settings-item">
                                        <label>Include Demo Content:</label>
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
                                )}
                                
                                <div className="settings-item">
                                    <label htmlFor="filter">Sort by:</label>
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
                                
                                <div className="settings-item">
                                    <label htmlFor="scroll-speed">Auto-Scroll Speed: {scrollSpeed}px/tick</label>
                                    <input
                                        id="scroll-speed"
                                        type="range"
                                        min="1"
                                        max="10"
                                        value={scrollSpeed}
                                        onChange={(e) => {
                                            const newSpeed = parseInt(e.target.value, 10);
                                            setScrollSpeed(newSpeed);
                                            saveScrollSpeedPreference(newSpeed);
                                            updateSliderFill(newSpeed);
                                        }}
                                        className="scroll-speed-slider"
                                    />
                                    <div className="speed-range-labels">
                                        <span>Slow</span>
                                        <span>Fast</span>
                                    </div>
                                </div>

                                <div className="settings-item">
                                    <label htmlFor="volume-control">Volume: {Math.round(globalVolume * 100)}%</label>
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
                                            updateVolumeSliderFill(newVolume);
                                        }}
                                        className="volume-slider"
                                    />
                                </div>

                                <div className="settings-item">
                                    <label htmlFor="tag-blacklist">Tag Blacklist (comma-separated):</label>
                                    <input
                                        type="text"
                                        id="tag-blacklist"
                                        value={tagBlacklist}
                                        onChange={handleTagBlacklistChange}
                                        placeholder="Enter tags to blacklist"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {showLogin && (
                    <div className="login-dialog">
                        <div className="login-content">
                            <div className="login-header">
                                <h2>{isRegistering ? 'Create Account' : 'Login'}</h2>
                                <button onClick={() => setShowLogin(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            {loginError && <div className="login-error">{loginError}</div>}
                            <form className="login-form" onSubmit={isRegistering ? handleRegister : handleLogin}>
                                <input
                                    type="text"
                                    placeholder="Username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                />
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (isRegistering) {
                                            checkPasswordRequirements(e.target.value);
                                        }
                                    }}
                                    required
                                />
                                {isRegistering && (
                                    <div className="password-requirements">
                                        <p className={passwordRequirements.length ? 'met' : ''}>
                                            ✓ At least 12 characters
                                        </p>
                                        <p className={passwordRequirements.uppercase ? 'met' : ''}>
                                            ✓ One uppercase letter
                                        </p>
                                        <p className={passwordRequirements.lowercase ? 'met' : ''}>
                                            ✓ One lowercase letter
                                        </p>
                                        <p className={passwordRequirements.number ? 'met' : ''}>
                                            ✓ One number
                                        </p>
                                        <p className={passwordRequirements.special ? 'met' : ''}>
                                            ✓ One special character (@$!%*?&)
                                        </p>
                                    </div>
                                )}
                                <button type="submit">
                                    {isRegistering ? 'Create Account' : 'Login'}
                                </button>
                            </form>
                            <div className="login-options">
                                <button onClick={() => {
                                    setIsRegistering(!isRegistering);
                                    setLoginError('');
                                }}>
                                    {isRegistering 
                                        ? 'Already have an account? Login' 
                                        : 'Need an account? Register'}
                                </button>
                            </div>
                            {isLoggedIn && (
                                <div className="profile-actions">
                                    <button onClick={handleExport} className="export-button">
                                        <i className="fas fa-download"></i> Export Links
                                    </button>
                                    <label className="import-button">
                                        <i className="fas fa-upload"></i> Import Links
                                        <input
                                            type="file"
                                            accept=".json"
                                            onChange={handleImport}
                                            style={{ display: 'none' }}
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {showConfirmClear && (
                    <div className="login-dialog">
                        <div className="login-content">
                            <div className="login-header">
                                <h2>Confirm Clear</h2>
                                <button onClick={cancelClearCollection}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <p>Are you sure you want to clear your collection? This action cannot be undone.</p>
                            <div className="login-options">
                                <button onClick={confirmClearCollection} className="profile-menu-button danger">
                                    Yes, Clear Collection
                                </button>
                                <button onClick={cancelClearCollection}>
                                    Cancel
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
