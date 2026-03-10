import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition} from 'react';
import Masonry from 'react-masonry-css';
import './VideoList.css';
import JSZip from 'jszip';
import defaultLinks from './default-links.json';
import config from '../config';
import { 
    MediaItem, 
    TagsPanel, 
    NotificationContainer, 
    SettingsDialog
} from './VideoListComponents';
import {
    LOCAL_STORAGE_KEY,
    saveToLocalStorage,
    getFromLocalStorage,
    saveFilterPreference,
    getFilterFromCookie,
    saveScrollSpeedPreference,
    saveVolumePreference,
    saveShowDefaultLinksPreference,
    saveContentFilterPreference,
    saveTagBlacklistPreference,
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
    createAuthHeaders,
    addScrapeUrlToFile,
    fetchTweetsFromList,
    scrapeSavedLinks as scrapeSavedLinksUtil,
    exportCollection,
    importCollection,
    importScrapeList,
    debounce,
    throttle,
    createMediaFilter,
    shuffleArray,
    batchDOMUpdates,
    clearCollection,
    deleteBlacklistedMedia
} from './VideoListUtils';
import {
    useKonamiCode,
    useWebSocket, 
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
    const [scrapeUrl, setScrapeUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [autoScroll, setAutoScroll] = useState(getAutoScrollFromCookie());
    const [scrollDuration, setScrollDuration] = useState(0);
    const [filter, setFilter] = useState(getFilterFromCookie() || 'random');
    const [showSettings, setShowSettings] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [isClickable, setIsClickable] = useState(true);
    const [randomSeed, setRandomSeed] = useState(Date.now());
    const [tagFilter, setTagFilter] = useState(null);
    const [contentFilter, setContentFilter] = useState('sfw');
    const [globalVolume, setGlobalVolume] = useState(0.1);
    const [searchQuery, setSearchQuery] = useState('');
    const [showDefaultLinks, setShowDefaultLinks] = useState(false);
    const [activeCollection, setActiveCollection] = useState(getActiveCollectionFromCookie());
    const [collections] = useState([
        { id: 'main', name: 'Main', storageKey: LOCAL_STORAGE_KEY },
        { id: 'sub', name: 'Sub', storageKey: 'kupoNuts_sub' },
        { id: 'extra', name: 'Extra', storageKey: 'kupoNuts_extra' }
    ]);
    const [showConfirmClear, setShowConfirmClear] = useState(false);
    const [tagBlacklist, setTagBlacklist] = useState('');
    const [scrollSpeed, setScrollSpeed] = useState(4);
    const [tagSearchQuery, setTagSearchQuery] = useState('');
    const [tagsMinimized, setTagsMinimized] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [loadedMedia, setLoadedMedia] = useState({});
    
    // Refs
    const mediaRefs = useRef([]);
    const mediaSet = useRef(new Set());
    const scrolldelay = useRef(null);
    const observer = useRef();

    // Add pagination constants
    const initialMediaPerPage = 8;
    const mediaPerPage = 16;

    // MOVE scrollToMedia HERE - before custom hooks
    const scrollToMedia = useCallback((index) => {
        const mediaElement = mediaRefs.current[index];
        if (mediaElement) {
            mediaElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [])

    const BASE_SCROLL_DELAY = 100; // Adjust this value for your preferred speed range

    const pageScroll = useCallback(() => {
        window.scrollBy(0, 1);
        const delay = BASE_SCROLL_DELAY / (scrollSpeed || 1);
        scrolldelay.current = setTimeout(pageScroll, delay);
    }, [scrollSpeed]);

    // Custom hooks FIRST - before fetchMedia
    const { notifications, showNotification, removeNotification, handleProgressEvent } = useNotifications();

    // Create debounced version of fetchMedia
    const fetchMediaRef = useRef();

    // NOW fetchMedia can use all dependencies
    const fetchMedia = useCallback(async (page, limit) => {
        if (loading) return; // Prevent overlapping calls
        setLoading(true);
        try {
            let mediaLinks = [];
            let defaultMediaLinks = [];
            const currentCollectionId = activeCollection;
            
            // If no server data, check localStorage
            if (mediaLinks.length === 0) {
                const currentCollection = collections.find(c => c.id === currentCollectionId);
                const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
                const localStorageLinks = getFromLocalStorage(storageKey);
                
                if (localStorageLinks && localStorageLinks.length > 0) {
                    mediaLinks = localStorageLinks.map(item => [
                        item.postLink || '',
                        item.videoLinks || [],
                        item.tags || {}
                    ]);
                }
            }
            
            // Add default links if enabled or if no other content
            if (showDefaultLinks && defaultLinks?.length > 0) {
                defaultMediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
                mediaLinks = [...mediaLinks, ...defaultMediaLinks];
            } else if (mediaLinks.length === 0 && defaultLinks?.length > 0) {
                // Show defaults if nothing else is available
                defaultMediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
                mediaLinks = defaultMediaLinks;
            }

            // Apply tag filtering if needed
            if (tagFilter) {
                mediaLinks = filterMediaByTag(mediaLinks, tagFilter);
            }

            // Apply tag blacklist
            mediaLinks = applyTagBlacklist(mediaLinks, tagBlacklist);

            // Apply sorting based on filter
            let sortedMediaLinks = [];

            switch (filter.toLowerCase()) {
                case 'newest': 
                    sortedMediaLinks = [...mediaLinks].reverse();
                    break;
                case 'random':
                    sortedMediaLinks = shuffleArrayOptimized([...mediaLinks], randomSeed);
                    break;
                case 'oldest':
                    sortedMediaLinks = [...mediaLinks];
                    break;
                default:
                    sortedMediaLinks = shuffleArrayOptimized([...mediaLinks], randomSeed);
                    break;
            }

            //setMediaUrls(sortedMediaLinks.slice(0, INITIAL_BATCH_SIZE));

            setMediaUrls(prev => [...prev, ...sortedMediaLinks]);
            console.log(`Currently loaded: ${mediaUrls.length} items total`);

        } catch (error) {
            console.error('Error fetching media:', error);
            
            // Final fallback to default links on any error
            if (defaultLinks?.length > 0) {
                const defaultMediaLinks = defaultLinks.map(item => [item.postLink || '', item.videoLinks, item.tags || {}]);
                setMediaUrls(defaultMediaLinks);
            }
        } finally {
            setLoading(false);
        }
    }, [filter, tagFilter, showDefaultLinks, activeCollection, collections, tagBlacklist, randomSeed]);

    // Create debounced version
    useEffect(() => {
        fetchMediaRef.current = debounce(fetchMedia, 300); // 300ms debounce delay
    }, [fetchMedia, debounce]);

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

    // Add intersection observer for infinite scroll
    const lastMediaElementRef = useCallback(node => {
        if (!node) return;
        
        if (observer.current) observer.current.disconnect();
        
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && mediaUrls.length > selectedMedia.length && !loading) {
                setCurrentPage(prevPage => prevPage + 1);
            }
        }, {
            rootMargin: '200px', // Start loading 200px before user reaches the end
            threshold: 0.1
        });
        
        observer.current.observe(node);
    }, [mediaUrls.length, selectedMedia.length, loading]);

    const [konamiUnlocked, setKonamiUnlocked] = useState(() => {
        // Check if already unlocked in sessionStorage
        return sessionStorage.getItem('konami_unlocked') === 'true';
    });

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
    
    // Progress callbacks FIRST
    // Create a generic progress handler factory
    const createProgressHandler = useCallback((eventType) => {
        return (data) => {
            const newItems = handleProgressEvent(data, eventType);
            if (newItems && newItems.length > 0) {
                const currentCollection = collections.find(c => c.id === activeCollection);
                const storageKey = currentCollection?.storageKey || LOCAL_STORAGE_KEY;
                
                newItems.forEach(item => {
                    const formattedItem = {
                        postLink: item.postLink || '',
                        videoLinks: item.videoLinks || [],
                        tags: item.tags || {}
                    };
                    
                    const currentLinks = getFromLocalStorage(storageKey);
                    if (!currentLinks.some(existing => existing.postLink === formattedItem.postLink)) {
                        currentLinks.push(formattedItem);
                        saveToLocalStorage(currentLinks, storageKey);
                    }
                });
            }
        };
    }, [handleProgressEvent, collections, activeCollection]);

    const handleScrapeProgress = createProgressHandler('scrape');
    const handleSimilarProgress = createProgressHandler('similar');
    const handleTagSearchProgress = createProgressHandler('tag_search');

    const socket = useWebSocket(handleScrapeProgress, handleSimilarProgress, handleTagSearchProgress);

    // Rest of custom hooks that depend on fetchMedia
    const { handleScrape, handleRemove, handleSimilar, handleTagSearch } = useMediaHandlers(
        socket,
        collections,
        activeCollection,
        showNotification,
        API_URL,
        setMediaUrls
    );

    // Tag management hook (now handleTagSearch is defined)
    const { 
        handleTagClick, 
        handleAddTagToFilter, 
        addTagToBlacklist 
    } = useTagManagement(
        tagFilter,
        setTagFilter,
        setTagSearchQuery,
        fullscreenMedia,
        handleMediaClose,
        setCurrentPage,
        setMediaUrls,
        handleTagSearch,
        tagBlacklist,
        setTagBlacklist,
        saveTagBlacklistPreference,
        showNotification
    );
    
    // Error handlers hook
    const { handleImageError, handleVideoError } = useMediaErrorHandlers(
        mediaUrls,
        fullscreenMedia,
        setFullscreenMedia,
        mediaRefs,
        setMediaUrls
    );
    
    // Click outside handler hook
    useClickOutside(fullscreenMedia, mediaRefs, handleMediaClose);
    
    // WebSocket setup with progress handlers
    const confirmClearCollection = async () => {
        const result = await clearCollection(API_URL, fetchConfig, collections, activeCollection);

        if (result.success) {
            setMediaUrls([]);
            setActiveCollection(activeCollection); // Refresh active collection
            showNotification(result.message, 'success');
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
        const result = deleteBlacklistedMedia(mediaUrls, tagBlacklist, collections, activeCollection, LOCAL_STORAGE_KEY);
        
        if (result.success) {
            setMediaUrls(result.filteredMedia);
            showNotification(result.message, 'success');
        } else {
            showNotification(result.message, 'error');
        }
    };

    const scrapeSavedLinks = async () => {
        showNotification('Scraping saved links...', 'progress');
        try {
            await scrapeSavedLinksUtil(API_URL, fetchConfig);
            showNotification('Scraping complete!', 'success');
        } catch (error) {
            showNotification('Error scraping saved links.', 'error');
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
            
            setActiveCollection(activeCollection); // Refresh active collection
            const message = result.collectionName 
                ? `Successfully imported ${result.count} links to ${result.collectionName} collection`
                : `Successfully imported ${result.count} links`;
            
            showNotification(message, 'success');
            
            setMediaUrls([]);
            await fetchMedia();
        } catch (error) {
            console.error('Import error:', error);
            showNotification(error.message || 'Invalid file format', 'error');
        }
        event.target.value = '';
    };

    const handleImportScrapeList = async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            const result = await importScrapeList(file, API_URL, fetchConfig);
            showNotification(`Successfully imported ${result.total} URLs and started scraping`, 'success');
            
            setMediaUrls([]);
            await fetchMedia();
        } catch (error) {
            console.error('Import error:', error);
            showNotification(error.message || 'Invalid file format', 'error');
        }
        event.target.value = '';
    };

    const handleUnifiedSearch = () => {
        if (searchQuery.trim().toLowerCase().startsWith('http')) {
            setScrapeUrl(searchQuery.trim());
            
            if (searchQuery.includes('@')) {
                const listId = searchQuery.trim().replace('@', '');
                fetchTweetsFromList(listId, API_URL, fetchConfig);
            } else if (searchQuery.includes('❤️')) {
                scrapeSavedLinks();
            } else {
                addScrapeUrlToFile(searchQuery.trim(), API_URL, fetchConfig);
                handleScrape(searchQuery.trim());
            }
        } else {
            const query = searchQuery.trim();
            setTagSearchQuery(query);
            handleTagSearch(query);
        }
        
        setSearchQuery('');
    };

    const breakpointColumnsObj = useMemo(() => ({
        default: 4,
        1400: 4,
        1100: 4,
        800: 3,
        600: 2
    }), []);


    const cancelClearCollection = () => {
        setShowConfirmClear(false);
    };

    // CONSOLIDATED data fetching into a single useEffect
    useEffect(() => {
        setCurrentPage(1);
        setMediaUrls([]);
        debouncedFetchMedia(1, initialMediaPerPage);
    }, [filter, tagFilter, debouncedFetchMedia, activeCollection]);

    useEffect(() => {
        debouncedFetchMedia(currentPage, mediaPerPage);
    }, [currentPage, debouncedFetchMedia]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyPress);
        document.body.style.overflow = fullscreenMedia !== null ? 'hidden' : 'auto';
        return () => {
            document.removeEventListener('keydown', handleKeyPress);
            document.body.style.overflow = 'auto';
        };
    }, [fullscreenMedia, handleKeyPress]);

    useEffect(() => {
        if (autoScroll) {
            if (fullscreenMedia !== null) {
                const currentMedia = mediaRefs.current[fullscreenMedia];
                const videoDuration = currentMedia?.tagName === 'VIDEO' ? currentMedia.duration * 1000 : 10000;
                const durationInSeconds = videoDuration / 1000;
                
                // Set the CSS variable and state for the progress bar
                setScrollDuration(durationInSeconds);
                document.documentElement.style.setProperty('--scroll-duration', `${durationInSeconds}s`);
                
                const timeoutId = setTimeout(() => {
                    const button = document.querySelector('.auto-scroll-button');
                    button.classList.remove('scrolling');
                    setTimeout(() => button.classList.add('scrolling'), 10);

                    const nextIndex = (fullscreenMedia + 1) % mediaUrls.length;
                    setFullscreenMedia(nextIndex);
                    const nextMedia = mediaRefs.current[nextIndex];
                    if (nextMedia && nextMedia.tagName === 'VIDEO') {
                        nextMedia.play().catch(() => {});
                    }
                }, videoDuration <= 1 ? videoDuration * 5 : videoDuration);
                return () => clearTimeout(timeoutId);
            }
            else {
                pageScroll();
                return () => {
                    if (scrolldelay.current) {
                        clearTimeout(scrolldelay.current);
                    }
                };
            }
        }
    }, [fullscreenMedia, mediaUrls, autoScroll, setFullscreenMedia]);

    useEffect(() => {
        setRandomSeed(Date.now());
    }, [filter]);

    useEffect(() => {
        // When currentPage changes, load more data
        if (currentPage > 1) {
            fetchMedia(currentPage, mediaPerPage);
        }
    }, [currentPage, fetchMedia, mediaPerPage]);

    useEffect(() => {
        if (showSettings) {
            // Update slider fills when settings dialog opens
            setTimeout(() => {
                updateSliderFill(scrollSpeed);
                updateVolumeSliderFill(globalVolume);
            }, 0);
        }
    }, [showSettings, scrollSpeed, globalVolume]);

    const handleIconClick = (url) => window.open(url, '_blank');

    const handleFilterChange = (newFilter) => {
        startTransition(() => {
            setFilter(newFilter);
            saveFilterPreference(newFilter);
            setRandomSeed(Date.now());
        });
    };

    useKonamiCode(() => {
        setKonamiUnlocked(true);
        setContentFilter('nsfw');
        sessionStorage.setItem('konami_unlocked', 'true');
        showNotification('🎮 NSFW mode unlocked! You can now toggle NSFW content.', 'success');
    });

    return (
        <div className={`main-content ${fullscreenMedia !== null ? 'fullscreen-active' : ''}`}>
            {/* Top search bar */}
            <div className={`top-search-bar ${fullscreenMedia !== null ? 'hidden' : ''}`}>
                <div className="left-section">
                    <div 
                        className="app-title"
                        onClick={() => window.location.reload()}
                        style={{ cursor: 'pointer' }}
                    >
                        <i className="fas fa-cat logo-icon"></i>
                        <span>Kupo Nuts</span>
                    </div>
                    
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
                </div>
                
                {contentFilter === 'nsfw' && (
                    <button
                        onClick={() => {
                            setContentFilter('sfw');
                            saveContentFilterPreference('sfw');
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

            <NotificationContainer 
                notifications={notifications}
                onRemoveNotification={removeNotification}
            />

            {/* VirtuosoMasonry with complete dataset */}
            {Array.isArray(mediaUrls) && (
                <Masonry
                    breakpointCols={breakpointColumnsObj}
                    className="media-masonry"
                    columnClassName="media-masonry-column"
                >
                    {selectedMedia.map((media, index) => (
                        <div
                            key={`${media[0]}-${index}`}
                            ref={index === selectedMedia.length - 1 ? lastMediaElementRef : null}
                        >
                            <MediaItem
                                media={media}
                                index={index}
                                isFullscreen={fullscreenMedia === index}
                                globalVolume={globalVolume}
                                onMediaClick={handleMediaClick}
                                onImageError={handleImageError}
                                onVideoError={handleVideoError}
                                onIconClick={handleIconClick}
                                onClose={handleMediaClose}
                                onSimilar={handleSimilar}
                                onRemove={handleRemove}
                                mediaRef={el => (mediaRefs.current[index] = el)}
                            />
                        </div>
                    ))}
                </Masonry>
            )}

            {/* Show loading state when mediaUrls is not ready */}
            {(!Array.isArray(mediaUrls) || mediaUrls.length === 0) && loading && (
                <div className="loading-placeholder">Loading media...</div>
            )}

            {/* Fullscreen Media Overlay */}
            {fullscreenMedia !== null && (
                <div className="fullscreen-media-container">
                    <MediaItem
                        media={mediaUrls[fullscreenMedia]}
                        index={fullscreenMedia}
                        globalVolume={globalVolume}
                        onMediaClick={handleMediaClick}
                        onIconClick={handleIconClick}
                        onClose={handleMediaClose}
                        onSimilar={handleSimilar}
                        onRemove={handleRemove}
                        mediaRef={el => (mediaRefs.current[fullscreenMedia] = el)}
                    />
                </div>
            )}

            {/* Tags Panel for Fullscreen */}
            {fullscreenMedia !== null && (
               <TagsPanel 
                    tags={mediaUrls[fullscreenMedia]?.[2]}
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

