export const LOCAL_STORAGE_KEY = 'kupoNuts_mediaLinks';

// localStorage helper functions
export const saveToLocalStorage = (mediaLinks, storageKey = LOCAL_STORAGE_KEY) => {
    try {
        localStorage.setItem(storageKey, JSON.stringify(mediaLinks));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
};

export const getFromLocalStorage = (storageKey = LOCAL_STORAGE_KEY) => {
    try {
        const data = localStorage.getItem(storageKey);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return [];
    }
};

export const addToLocalStorage = (mediaItem, storageKey = LOCAL_STORAGE_KEY) => {
    try {
        const currentLinks = getFromLocalStorage(storageKey);
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

export const clearLocalStorage = async (storageKey = LOCAL_STORAGE_KEY) => {
    try {
        if (window.electronAPI?.clearCollection) {
            await window.electronAPI.clearCollection(storageKey);
        }
    } catch (error) {
        console.error('Error clearing storage:', error);
    }
};

// Cookie helper functions
export const saveFilterPreference = (filterValue) => {
    try {
        localStorage.setItem('preferred_filter', filterValue);
    } catch (error) {
        console.error('Error saving filter preference:', error);
    }
};

export const getFilterFromCookie = () => {
    try {
        return localStorage.getItem('preferred_filter') || 'random';
    } catch (error) {
        console.error('Error reading filter preference:', error);
        return 'random';
    }
};

export const saveScrollSpeedPreference = (speed) => {
    try {
        localStorage.setItem('preferred_scroll_speed', speed.toString());
    } catch (error) {
        console.error('Error saving scroll speed preference:', error);
    }
};

export const getScrollSpeedFromCookie = () => {
    try {
        const speed = localStorage.getItem('preferred_scroll_speed');
        return speed ? parseInt(speed, 10) : 3;
    } catch (error) {
        console.error('Error reading scroll speed preference:', error);
        return 3;
    }
};

export const saveVolumePreference = (volume) => {
    try {
        localStorage.setItem('preferred_volume', volume.toString());
    } catch (error) {
        console.error('Error saving volume preference:', error);
    }
};

export const getVolumeFromCookie = () => {
    try {
        const volume = localStorage.getItem('preferred_volume');
        return volume ? parseFloat(volume) : 0.1;
    } catch (error) {
        console.error('Error reading volume preference:', error);
        return 0.1;
    }
};

export const saveShowDefaultLinksPreference = (show) => {
    try {
        localStorage.setItem('show_default_links', show ? '1' : '0');
    } catch (error) {
        console.error('Error saving default links preference:', error);
    }
};

export const getShowDefaultLinksFromCookie = () => {
    try {
        return localStorage.getItem('show_default_links') === '1';
    } catch (error) {
        console.error('Error reading default links preference:', error);
        return false;
    }
};

export const saveContentFilterPreference = (filter) => {
    try {
        localStorage.setItem('content_filter', filter.toString());
    } catch (error) {
        console.error('Error saving content filter preference:', error);
    }
};

export const getContentFilterFromCookie = () => {
    try {
        const value = localStorage.getItem('content_filter');
        return value === '1' ? 1 : 0; // Return 1 for NSFW, 0 for SFW
    } catch (error) {
        console.error('Error reading content filter preference:', error);
        return 0; // Default to SFW
    }
};

export const saveTagBlacklistPreference = (blacklist) => {
    try {
        localStorage.setItem('tag_blacklist', blacklist);
    } catch (error) {
        console.error('Error saving tag blacklist preference:', error);
    }
};

export const getTagBlacklistFromCookie = () => {
    try {
        return localStorage.getItem('tag_blacklist') || '';
    } catch (error) {
        console.error('Error reading tag blacklist preference:', error);
        return '';
    }
};

export const saveAutoScrollPreference = (autoScroll) => {
    try {
        localStorage.setItem('auto_scroll', autoScroll ? '1' : '0');
    } catch (error) {
        console.error('Error saving auto scroll preference:', error);
    }
};

export const getAutoScrollFromCookie = () => {
    try {
        return localStorage.getItem('auto_scroll') !== '0'; // Default to true
    } catch (error) {
        console.error('Error reading auto scroll preference:', error);
        return true;
    }
};

export const getActiveCollectionFromCookie = () => {
    try {
        return localStorage.getItem('active_collection') || 'main';
    } catch (error) {
        console.error('Error reading active collection preference:', error);
        return 'main';
    }
};

export const saveActiveCollectionPreference = (collectionId) => {
    try {
        localStorage.setItem('active_collection', collectionId);
    } catch (error) {
        console.error('Error saving active collection preference:', error);
    }
};

export const saveAutoScrapePreference = (autoScrape) => {
    try {
        localStorage.setItem('auto_scrape_enabled', autoScrape ? '1' : '0');
    } catch (error) {
        console.error('Error saving auto scrape preference:', error);
    }
};

export const getAutoScrapeFromCookie = () => {
    try {
        return localStorage.getItem('auto_scrape_enabled') !== '0'; // Default to true
    } catch (error) {
        console.error('Error reading auto scrape preference:', error);
        return true;
    }
};

// Slider UI helper functions
export const updateSliderFill = (value) => {
    const slider = document.querySelector('.scroll-speed-slider');
    if (slider) {
        const percentage = ((value - 1) / 9) * 100;
        slider.style.backgroundSize = `${percentage}% 100%`;
    }
};

export const updateVolumeSliderFill = (value) => {
    const volumeSlider = document.querySelector('.volume-slider');
    if (volumeSlider) {
        const percentage = value * 100;
        volumeSlider.style.backgroundSize = `${percentage}% 100%`;
    }
};

// Media filtering functions
export const filterMediaByTag = (mediaLinks, tagFilters) => {
    // If no filters or empty array, return all media
    if (!tagFilters || tagFilters.length === 0) return mediaLinks;
    
    return mediaLinks.filter(item => {
        const tags = item.tags || item[2];
        
        // Flatten all tags into a single array for comparison
        let allTags = [];
        
        if (Array.isArray(tags)) {
            allTags = tags.map(t => t.toLowerCase());
        } else if (typeof tags === 'object') {
            Object.values(tags).forEach(categoryTags => {
                if (Array.isArray(categoryTags)) {
                    categoryTags.forEach(tag => allTags.push(tag.toLowerCase()));
                }
            });
        }
        
        // Check if ALL filter tags are present in the media (AND logic)
        return tagFilters.every(filterTag => 
            allTags.some(mediaTag => mediaTag.includes(filterTag.toLowerCase()))
        );
    });
};

export const applyTagBlacklist = (media, tagBlacklist) => {
    if (!tagBlacklist) return media;

    const blacklist = tagBlacklist.split(',').map(tag => tag.trim().toLowerCase());

    return media.filter(item => {
        const tags = item.tags;
        if (!tags) return true;

        const allTags = [];
        Object.values(tags).forEach(categoryTags => {
            if (Array.isArray(categoryTags)) {
                categoryTags.forEach(tag => allTags.push(tag.toLowerCase()));
            }
        });

        return !blacklist.some(blacklistedTag =>
            allTags.some(tag => tag.includes(blacklistedTag))
        );
    });
};

// Performance utilities
export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

export const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// Debounced media click handler - prevents accidental clicks when exiting fullscreen
export const createDebouncedMediaClick = (handleMediaClick, wait = 300) => {
    let timeout;
    let isClickable = true;
    
    return function debouncedClick(index) {
        if (!isClickable) return;
        
        isClickable = false;
        clearTimeout(timeout);
        
        handleMediaClick(index);
        
        timeout = setTimeout(() => {
            isClickable = true;
        }, wait);
    };
};

// Memoize expensive filter operations
export const createMediaFilter = () => {
    const cache = new Map();
    
    return (mediaLinks, tagFilter, tagBlacklist) => {
        const cacheKey = `${JSON.stringify(tagFilter)}-${tagBlacklist}`;  

        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        
        let filtered = mediaLinks;
        
        if (tagFilter && tagFilter.length > 0) {
            filtered = filterMediaByTag(filtered, tagFilter);
        }
        
        if (tagBlacklist) {
            filtered = applyTagBlacklist(filtered, tagBlacklist);
        }
        
        cache.set(cacheKey, filtered);
        
        // Limit cache size
        if (cache.size > 50) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        
        return filtered;
    };
};

// Optimize array shuffling with Web Workers (for large datasets)
export const shuffleArrayOptimized = (array, seed) => {
    // For small arrays, use regular shuffle
    if (array.length < 1000) {
        return shuffleArray(array, seed);
    }
    
    // For large arrays, use optimized version
    const newArray = [...array];
    const rand = window.Math.seedrandom ? 
        new window.Math.seedrandom(seed.toString()) : 
        Math.random;
    
    // Fisher-Yates shuffle optimized
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        // Swap without destructuring (faster)
        const temp = newArray[i];
        newArray[i] = newArray[j];
        newArray[j] = temp;
    }
    
    return newArray;
};

// Shuffle array with seeded random
export const shuffleArray = (array, seed) => {
    const newArray = [...array];
    newArray.reverse();
    
    // Use seedrandom if available, otherwise use Math.random
    const rand = window.Math.seedrandom ? 
        new window.Math.seedrandom(seed.toString()) : 
        Math.random;
    
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    newArray.reverse();
    return newArray;
};

// API helper functions
export const fetchConfig = {
    credentials: 'include',
};

export const createAuthHeaders = (guestId) => {
    return {
        'Content-Type': 'application/json',
        'x-guest-id': guestId
    };
};

// INP Performance monitoring
export const measureINP = () => {
    if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name === 'first-input') {
                    console.log('First Input Delay:', entry.processingStart - entry.startTime);
                }
                if (entry.duration > 100) {
                    console.log('Long interaction detected:', {
                        duration: entry.duration,
                        startTime: entry.startTime,
                        target: entry.target?.className || 'unknown'
                    });
                }
            }
        });
        
        try {
            observer.observe({ type: 'first-input', buffered: true });
            observer.observe({ type: 'event', buffered: true });
        } catch (e) {
            console.log('Performance monitoring not fully supported');
        }
    }
};

// Load seedrandom library
export const loadSeedrandomScript = () => {
    return new Promise((resolve, reject) => {
        if (window.Math.seedrandom) {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/seedrandom/3.0.5/seedrandom.min.js';
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
};

// API call functions
export const setCookies = () => {
    const cookies = JSON.parse(localStorage.getItem('cookies'));
    if (cookies) {
        cookies.forEach(cookie => {
            document.cookie = `${cookie.name}=${cookie.value}; domain=${cookie.domain}; path=${cookie.path}`;
        });
    }
};

export const addScrapeUrlToFile = async (url, API_URL, fetchConfig) => {
    try {
        const response = await fetch(`${API_URL}/api/save-scrape-url`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${document.cookie.split('token=')[1]}`
            },
            ...fetchConfig,
            body: JSON.stringify({ url }),
        });
        if (!response.ok && response.status !== 401) {
            throw new Error('Network response was not ok');
        }
        return { success: true };
    } catch (error) {
        console.error('Failed to add scrape URL to file:', error);
        return { success: false, error: error.message };
    }
};

export const fetchTweetsFromList = async (username, API_URL, fetchConfig) => {
    try {
        const response = await fetch(`${API_URL}/api/tweets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
            ...fetchConfig
        });
        if (!response.ok) throw new Error('Network response was not ok');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to fetch tweets. Please try again later.' };
    }
};

export const scrapeSavedLinks = async (API_URL, fetchConfig) => {
    try {
        const response = await fetch(`${API_URL}/api/scrape-saved-links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...fetchConfig
        });
        if (!response.ok) throw new Error('Network response was not ok');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to scrape media. Please try again later.' };
    }
};

export const seedrandom = (seed) => {
    if (window.Math.seedrandom) {
        return new window.Math.seedrandom(seed);
    }
    return () => Math.random();
};

// File export/import operations
export const exportCollection = async (collections, activeCollection, API_URL, fetchConfig, JSZip) => {
    const currentCollection = collections.find(c => c.id === activeCollection);
    const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
    const localData = await getFromLocalStorage(storageKey);
    
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
        return { success: true, message: `${currentCollection.name} collection exported successfully` };
    } else {
        return { success: false, message: `No items in ${currentCollection.name} collection to export`, type: 'info' };
    }
};

export const importCollection = async (file, collections, activeCollection, API_URL, fetchConfig) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let content = JSON.parse(e.target.result);
                
                if (!Array.isArray(content)) {
                    content = Object.entries(content).map(([postLink, videoLinks]) => ({
                        postLink,
                        videoLinks: Array.isArray(videoLinks) ? videoLinks : [videoLinks]
                    }));
                }

                const validContent = content.filter(item => {
                    return item && 
                           typeof item === 'object' && 
                           typeof item.postLink === 'string' && 
                           (Array.isArray(item.videoLinks) || typeof item.videoLinks === 'string');
                });

                if (validContent.length === 0) {
                    throw new Error('No valid media links found in file');
                }

                const currentCollection = collections.find(c => c.id === activeCollection);
                const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
                
                // Get existing data
                const existingData = await getFromLocalStorage(storageKey) || [];
                
                // Create a Set of existing postLinks for quick lookup
                const existingPostLinks = new Set(existingData.map(item => item.postLink));
                
                // Filter out duplicates from the imported content
                const newItems = validContent.filter(item => !existingPostLinks.has(item.postLink));
                
                // Track how many were duplicates
                const duplicateCount = validContent.length - newItems.length;
                
                // Merge: add new items to existing data
                const mergedData = [...existingData, ...newItems];
                await saveToLocalStorage(mergedData, storageKey);
                
                resolve({ 
                    success: true, 
                    count: newItems.length,
                    duplicateCount,
                    collectionName: currentCollection.name 
                });
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsText(file);
    });
};

// Collection management functions
export const clearCollection = (API_URL, fetchConfig, collections, activeCollection) => {
    try {
        const currentCollection = collections.find(c => c.id === activeCollection);
        const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
        
        localStorage.removeItem(storageKey);
        
        return { success: true, message: 'Collection cleared' };
    } catch (error) {
        console.error('Error clearing collection:', error);
        return { success: false, message: 'Failed to clear collection', error };
    }
};

// Tag blacklist operations
export const deleteBlacklistedMedia = (mediaUrls, tagBlacklist, collections, activeCollection, LOCAL_STORAGE_KEY) => {
    try {
        // Validate inputs
        if (!tagBlacklist || typeof tagBlacklist !== 'string') {
            return { 
                success: false, 
                message: 'No tags to blacklist',
                filteredMedia: mediaUrls,
                removedCount: 0
            };
        }

        // Split and filter out empty strings
        const blacklist = tagBlacklist
            .split(',')
            .map(tag => tag.trim().toLowerCase())
            .filter(tag => tag.length > 0); // Remove empty strings
        
        if (blacklist.length === 0) {
            return { 
                success: false, 
                message: 'No valid tags provided to blacklist',
                filteredMedia: mediaUrls,
                removedCount: 0
            };
        }
        
        const filteredMedia = mediaUrls.filter(media => {
            const tags = media.tags;
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

        const removedCount = mediaUrls.length - filteredMedia.length;
        
        // Only update storage if items were actually removed
        if (removedCount > 0) {
            const currentCollection = collections.find(c => c.id === activeCollection);
            const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
            const localStorageLinks = getFromLocalStorage(storageKey);
            const updatedLinks = localStorageLinks.filter(item => 
                filteredMedia.some(media => media.postLink === item.postLink)
            );
            saveToLocalStorage(updatedLinks, storageKey);
        }
        
        return { 
            success: true, 
            filteredMedia, 
            removedCount,
            message: removedCount > 0 
                ? `Deleted ${removedCount} media item(s) containing blacklisted tags from storage` 
                : 'No media items matched the blacklist tags'
        };
    } catch (error) {
        console.error('Error deleting blacklisted media:', error);
        return { 
            success: false, 
            message: `Failed to delete blacklisted media: ${error.message}`,
            filteredMedia: mediaUrls,
            removedCount: 0,
            error 
        };
    }
};

// Search routing logic
export const routeUnifiedSearch = (searchQuery) => {
    const query = searchQuery.trim();
    
    if (query.toLowerCase().startsWith('http')) {
        // It's a URL
        if (query.includes('@')) {
            return { type: 'twitter', value: query.replace('@', '') };
        } else if (query.includes('❤️')) {
            return { type: 'saved', value: query };
        } else {
            return { type: 'scrape', value: query };
        }
    } else {
        // It's a tag search
        return { type: 'tag', value: query };
    }
};

/**
 * Distribute media items into columns using minimasonry-style shortest column algorithm
 * @param {Array} media - Array of media items to distribute
 * @param {number} columnCount - Number of columns to create
 * @returns {Array<Array>} Array of columns, each containing media items
 */
export const distributeMasonryItems = (media, columnCount) => {
    if (!Array.isArray(media) || media.length === 0) {
        return Array.from({ length: columnCount }, () => []);
    }

    if (columnCount <= 0) {
        columnCount = 1;
    }

    // Initialize columns
    const columns = Array.from({ length: columnCount }, () => []);
    const columnHeights = Array(columnCount).fill(0);

    // Distribute items to the shortest column
    media.forEach((item) => {
        // Find the column with the minimum height
        let minHeightIndex = 0;
        for (let i = 1; i < columnCount; i++) {
            if (columnHeights[i] < columnHeights[minHeightIndex]) {
                minHeightIndex = i;
            }
        }

        // Add item to the shortest column
        columns[minHeightIndex].push(item);
        
        // Update the height (approximate based on item type and aspect ratio)
        // For videos/images, estimate height; for iframes, use standard height
        let itemHeight = 300; // Default height
        
        if (item.mediaType === 'iframe' || item.type === 'iframe') {
            itemHeight = 400;
        } else if (item.aspect_ratio && typeof item.aspect_ratio === 'number') {
            // Calculate height based on a standard width and aspect ratio
            const columnWidth = 300; // Approximate column width
            itemHeight = columnWidth / item.aspect_ratio;
        }
        
        columnHeights[minHeightIndex] += itemHeight;
    });

    return columns;
};
