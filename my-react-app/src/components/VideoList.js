import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Masonry from 'react-masonry-css';
import './VideoList.css';
import JSZip from 'jszip';
import defaultLinks from './default-links.json';
import config from '../config'; // Import the config file

const API_URL = config.API_URL;

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
    const mediaRefs = useRef([]);
    const mediaSet = useRef(new Set());
    const observer = useRef();

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
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
    };

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
                        setIsLoggedIn(false);
                        setShowLogin(true);
                        throw new Error('Please login to view media');
                    }
                    throw new Error('Network response was not ok');
                }
                
                const data = await response.json();
                mediaLinks = data.map(item => [item.postLink || '', item.videoLinks]);
            } else {
                // Only load default links if not logged in and they exist
                if (!defaultLinks || defaultLinks.length === 0) {
                    mediaLinks = [];
                    return; // Exit early if no default links
                }
                mediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks]);
            }

            const totalAvailableItems = mediaLinks.length;
            const startIndex = (page - 1) * limit;
            
            // Check if we've reached the end, but don't refresh
            if (startIndex >= totalAvailableItems) {
                // We've reached the end, simply return without loading more
                return;
            }

            let sortedMediaLinks;
            const shuffledLinks = shuffleArray([...mediaLinks]);
            const reversedLinks = [...mediaLinks].reverse();

            switch (filter.toLowerCase()) {
                case 'newest':
                    sortedMediaLinks = reversedLinks;
                    break;
                case 'random':
                    sortedMediaLinks = shuffleArray([...mediaLinks]); // Create completely random array
                    break;
                default:
                    sortedMediaLinks = page % 2 === 0 ? reversedLinks : shuffledLinks;
                    break;
            }

            const endIndex = Math.min(startIndex + limit, totalAvailableItems);
            const newMediaUrls = sortedMediaLinks.slice(startIndex, endIndex);

            if (page === 1) {
                mediaSet.current.clear(); // Clear mediaSet before setting new media URLs
            }

            const uniqueMediaUrls = newMediaUrls.filter(media => !mediaSet.current.has(media[1][0]));
            uniqueMediaUrls.forEach(media => mediaSet.current.add(media[1][0]));

            if (page === 1) {
                setMediaUrls(uniqueMediaUrls);
            } else {
                setMediaUrls(prevMediaUrls => [...prevMediaUrls, ...uniqueMediaUrls]);
            }
        } catch (error) {
            console.error('Failed to load media:', error);
            showNotification(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [filter, isLoggedIn, shuffleArray]);

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
        const id = Date.now(); // Create unique ID for each notification
        const newNotification = { id, message, type };
        
        setNotifications(prev => [...prev, newNotification]);
        
        // Remove this specific notification after 3 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(notification => notification.id !== id));
        }, 3000);
    };

    const showProgressNotification = (id, message, count = 0, isComplete = false) => {
        console.log('Showing progress notification:', { id, message, count, isComplete });
        
        setNotifications(prev => {
            const existing = prev.find(n => n.id === id);
            const updatedNotifications = existing 
                ? prev.map(n => n.id === id ? { ...n, message, count, isComplete } : n)
                : [...prev, { id, message, type: 'progress', count, isComplete }];
            
            return updatedNotifications;
        });
    };

    const removeNotification = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    // New helper function to fetch only the latest added media
    const fetchLatestMedia = async (count = 10) => {
        try {
            const response = await fetch(`${API_URL}/api/media/latest?count=${count}`, {
                ...fetchConfig,
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch latest media');
            }
            
            const data = await response.json();
            return data.map(item => [item.postLink || '', item.videoLinks]);
        } catch (error) {
            console.error('Error fetching latest media:', error);
            return [];
        }
    };

    // Updated handleScrape function
    const handleScrape = async () => {
        const notificationId = Date.now();
        try {
            // Show initial "in progress" notification without count
            showProgressNotification(notificationId, 'Scraping in progress...', 0, false);
            console.log('Scraping URL:', scrapeUrl);
            
            const response = await fetch(`${API_URL}/api/scrape`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${document.cookie.split('token=')[1]}`
                },
                ...fetchConfig,
                body: JSON.stringify({ url: scrapeUrl }),
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    setIsLoggedIn(false);
                    setShowLogin(true);
                    throw new Error('Please login to scrape media');
                }
                throw new Error('Network response was not ok');
            }

            const result = await response.json();
            
            // Update notification with final count when complete and mark as complete
            showProgressNotification(notificationId, 'Scraping completed successfully!', result.linksAdded || 0, true);
            
            // Handle media updates based on current sort
            if (filter.toLowerCase() === 'newest') {
                // Refresh the entire media list for "newest" sort
                setCurrentPage(1);
                setMediaUrls([]);
                await fetchMedia(1, initialMediaPerPage);
            } else if (result.linksAdded > 0) {
                // For other sorts, append new media to the end of the current list
                const latestMedia = await fetchLatestMedia(result.linksAdded);
                
                // Add only unique media that isn't already in our list
                const existingUrls = new Set(mediaUrls.map(media => media[0]));
                const uniqueNewMedia = latestMedia.filter(media => !existingUrls.has(media[0]));
                
                if (uniqueNewMedia.length > 0) {
                    setMediaUrls(prevMediaUrls => [...prevMediaUrls, ...uniqueNewMedia]);
                }
            }
            
            // Auto-remove notification after a few seconds
            setTimeout(() => removeNotification(notificationId), 5000);
        } catch (error) {
            console.error('Failed to scrape:', error);
            showNotification(error.message || 'Failed to scrape. Please try again.', 'error');
            removeNotification(notificationId);
        }
    };

    const handleRemove = async (postLink) => {
        try {
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
            console.log('Adding scrape URL to file:', url); // Add logging
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
                    setIsLoggedIn(false);
                    setShowLogin(true);
                    throw new Error('Please login to save scrape URL');
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
        const notificationId = Date.now();
        try {
            // Show initial notification without count
            showProgressNotification(notificationId, 'Searching for similar posts...', 0, false);
            console.log('Finding similar posts for:', postLink);
            
            const response = await fetch(`${API_URL}/api/similar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                ...fetchConfig,
                body: JSON.stringify({ url: postLink }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to find similar posts');
            }

            const result = await response.json();
            
            if (result.count === 0) {
                showProgressNotification(notificationId, 'No similar posts found', 0, true);
            } else {
                showProgressNotification(notificationId, 'Similar posts found!', result.count, true);
                
                // Handle media updates based on current sort
                if (filter.toLowerCase() === 'newest') {
                    // Refresh the entire media list for "newest" sort
                    setCurrentPage(1);
                    setMediaUrls([]);
                    await fetchMedia(1, initialMediaPerPage);
                } else if (result.count > 0) {
                    // For other sorts, append new media to the end of the current list
                    const latestMedia = await fetchLatestMedia(result.count);
                    
                    // Add only unique media that isn't already in our list
                    const existingUrls = new Set(mediaUrls.map(media => media[0]));
                    const uniqueNewMedia = latestMedia.filter(media => !existingUrls.has(media[0]));
                    
                    if (uniqueNewMedia.length > 0) {
                        setMediaUrls(prevMediaUrls => [...prevMediaUrls, ...uniqueNewMedia]);
                    }
                }
            }
            
            setTimeout(() => removeNotification(notificationId), 3000);
        } catch (error) {
            console.error('Failed to find similar:', error);
            showNotification(error.message || 'Failed to find similar posts', 'error');
            removeNotification(notificationId);
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
        document.querySelectorAll('.postlink-icon, .close-icon, .remove-icon, .similar-icon').forEach(button => {
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
        if (fullscreenMedia !== null && !mediaRefs.current[fullscreenMedia]?.contains(event.target) && !event.target.closest('.postlink-icon, .close-icon, .remove-icon, .scrape-button, .auto-scroll-button, .similar-icon')) {
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
    }, [filter, fetchMedia]);

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

    const handleScrapeInputKeyPress = (event) => {
        if (event.key === 'Enter') {
            if (scrapeUrl.includes('@')) {
                const listId = scrapeUrl.replace('@', '');
                fetchTweetsFromList(listId);
            } else if (scrapeUrl.includes('❤️')) {
                scrapeSavedLinks();
            } else {
                addScrapeUrlToFile(scrapeUrl);
                handleScrape();
            }
            setScrapeUrl('');
        }
    };

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
            setFilter(savedFilter);
            
            // Reset page and fetch media after successful login
            setCurrentPage(1);
            setMediaUrls([]);
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
            await fetch(`${API_URL}/api/logout`, {
                method: 'POST',
                ...fetchConfig,
            });
            
            // Update state first
            setIsLoggedIn(false);
            setFilter('random'); // Set filter to random when logging out
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

    // Add this new effect to check login status on component mount
    useEffect(() => {
        const checkLoginStatus = async () => {
            try {
                const response = await fetch(`${API_URL}/api/profile`, {
                    ...fetchConfig
                });
                
                if (response.ok) {
                    setIsLoggedIn(true);
                    setAutoScroll(false); // Disable autoScroll when user logs in
                    // Load saved filter preference
                    const savedFilter = getFilterFromCookie();
                    setFilter(savedFilter);
                    setCurrentPage(1);
                    setMediaUrls([]);
                    await fetchMedia(1, initialMediaPerPage);
                } else {
                    setIsLoggedIn(false);
                    setFilter('random'); // Explicitly set filter to random for non-logged in users
                    setShowLogin(true);
                }
            } catch (error) {
                console.error('Error checking login status:', error);
                setIsLoggedIn(false);
                setFilter('random'); // Set filter to random here too in case of error
                setShowLogin(true);
            }
        };

        checkLoginStatus();
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

                    const response = await fetch(`${API_URL}/api/import-links`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        ...fetchConfig,
                        body: JSON.stringify(validContent)
                    });

                    if (!response.ok) throw new Error('Failed to import links');
                    
                    showNotification(`Successfully imported ${validContent.length} links`, 'success');
                    // Refresh media after import
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

    return (
        <div>
            <div className="notifications-container">
                {notifications.map((notification, index) => (
                    <div 
                        key={notification.id} 
                        className={`notification ${notification.type}`}
                        style={{ top: `${20 + (index * 70)}px` }}
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
                    {selectedMedia.map((media, index) => {
                        if (!media || !media[1] || media[1].length === 0 || !media[1][0]) return null;
                        const [postLink, videoLinks] = media;
                        const firstVideoLink = videoLinks[0];
                        const isVideo = firstVideoLink && (firstVideoLink.endsWith('.mp4') || firstVideoLink.endsWith('.mov') || firstVideoLink.endsWith('.webm'));
                        const isRule34Video = postLink.includes('rule34video');
                        const embedUrl = firstVideoLink ? firstVideoLink.replace('/view/', '/embed/') : '';
                        const isLoaded = loadedMedia[index];

                        return (
                            <div
                                key={index}
                                ref={index >= selectedMedia.length - breakpointColumnsObj.default ? lastMediaElementRef : null}
                                className={`media-wrapper masonry-item ${fullscreenMedia === index ? 'fullscreen' : ''}`}
                                onClick={() => handleMediaClick(index)}
                            >
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
                                            loop
                                            onLoadedData={() => handleMediaLoad(index)}
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
                                    {fullscreenMedia === index && videoLinks.slice(1).map((link, i) => (
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
                                    {!postLink.includes('kusowanka') && (
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
                                {isLoggedIn && (
                                    <button
                                        className="remove-icon"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemove(postLink); // Now we just pass postLink, not the specific videoLink
                                        }}
                                        aria-label="Remove media"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {loading && (
                        <div className="loading-placeholder"></div>
                    )}
                </Masonry>
                <div id="bottom-of-page"></div>
                {!showLogin && (
                    <div className="overlay-buttons">
                        {isLoggedIn && (
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className="settings-button"
                                aria-label="Settings"
                            >
                                <i className="fas fa-cog"></i>
                            </button>
                        )}
                        <button
                            onClick={() => setAutoScroll(!autoScroll)}
                            className={`auto-scroll-button ${autoScroll ? 'active' : ''}`}
                            aria-label="Toggle auto scroll"
                        >
                            <i className="fas fa-arrow-down"></i>
                        </button>
                        <button
                            onClick={() => isLoggedIn ? setShowProfileMenu(!showProfileMenu) : setShowLogin(true)}
                            className={`profile-button ${isLoggedIn ? 'logged-in' : ''}`}
                            aria-label="Profile"
                        >
                            <i className={`fas ${isLoggedIn ? 'fa-user-check' : 'fa-user'}`}></i>
                        </button>
                        {showProfileMenu && isLoggedIn && (
                            <div className="profile-menu">
                                <div className="profile-menu-header">
                                    <h3>Profile Menu</h3>
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
                                    <button className="profile-menu-button danger" onClick={handleLogout}>
                                        <i className="fas fa-sign-out-alt"></i>
                                        Logout
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
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
                                <div className="settings-item">
                                    <label htmlFor="scrape-url">Scrape URL</label>
                                    <div className="scrape-input-container">
                                        <input
                                            id="scrape-url"
                                            value={scrapeUrl}
                                            onChange={(e) => setScrapeUrl(e.target.value)}
                                            onKeyPress={handleScrapeInputKeyPress}
                                            placeholder="Enter URL to scrape"
                                        />
                                        <button
                                            onClick={() => {
                                                if (scrapeUrl.includes('@')) {
                                                    const listId = scrapeUrl.replace('@', '');
                                                    fetchTweetsFromList(listId);
                                                } else if (scrapeUrl.includes('❤️')) {
                                                    scrapeSavedLinks();
                                                } else {
                                                    addScrapeUrlToFile(scrapeUrl);
                                                    handleScrape();
                                                }
                                                setScrapeUrl('');
                                            }}
                                            aria-label="Scrape URL"
                                        >
                                            Scrape
                                        </button>
                                    </div>
                                </div>
                                <div className="settings-item">
                                    <label htmlFor="filter">Sort by:</label>
                                    <select 
                                        id="filter" 
                                        value={filter} 
                                        onChange={(e) => {
                                            const newFilter = e.target.value;
                                            setFilter(newFilter);
                                            saveFilterPreference(newFilter);
                                        }}
                                    >
                                        <option value="Default">Default</option>
                                        <option value="Newest">Newest</option>
                                        <option value="Random">Random</option>
                                    </select>
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
                                <button onClick={() => {
                                    setShowLogin(false);
                                    setIsRegistering(false);
                                    setLoginError('');
                                }}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            {loginError && (
                                <div className="login-error">
                                    {loginError}
                                </div>
                            )}
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
            </div>
        </div>
    );
};

export default React.memo(VideoList);
