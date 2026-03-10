import React, { useState, useEffect, useRef } from 'react';

// Constants
const MEDIA_TYPES = {
  VIDEO: 'video',
  GIF: 'gif',
  IMAGE: 'image',
  EMBED: 'embed'
};

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const IMAGE_EXTENSIONS = ['.jpeg', '.jpg', '.png', '.webp'];
const GIF_EXTENSIONS = ['.gif'];

const EMBED_INDICATORS = ['ifr', 'embed']; // URLs containing these are embeds

export const BUTTON_CONFIG = [
  { 
    className: 'like-icon', 
    icon: 'fas fa-heart',
    ariaLabel: 'Add to likes',
    handler: 'like'
  },
  { 
    className: 'postlink-icon', 
    icon: 'fas fa-link',
    ariaLabel: 'Open post link',
    handler: 'link'
  },
  { 
    className: 'similar-icon', 
    icon: 'fas fa-clone',
    ariaLabel: 'Find similar media',
    handler: 'similar',
    condition: (postLink) => postLink && !['kusowanka', 'donmai', 'e621', 'rule34.xxx'].some(s => postLink.includes(s))
  },
  { 
    className: 'remove-icon', 
    icon: 'fas fa-trash',
    ariaLabel: 'Remove media',
    handler: 'remove'
  },
  { 
    className: 'number-icon', 
    icon: 'fas fa-film',
    ariaLabel: 'Number of video links',
    handler: 'number',
    isInfoOnly: true,
    condition: (postLink, videoLinks) => videoLinks.length > 1
  }
];

// Utility functions
const getMediaType = (url) => {
  const lower = url.toLowerCase();
  
  // Check for embed URLs first (they don't have file extensions)
  if (EMBED_INDICATORS.some(indicator => lower.includes(`/${indicator}`))) {
    return MEDIA_TYPES.EMBED;
  }
  
  if (VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext))) return MEDIA_TYPES.VIDEO;
  if (GIF_EXTENSIONS.some(ext => lower.endsWith(ext))) return MEDIA_TYPES.GIF;
  if (IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))) return MEDIA_TYPES.IMAGE;
  
  // If no extension found and not an embed, default to image
  return MEDIA_TYPES.IMAGE;
};

// Optimized MediaItem with lazy loading
export const MediaItem = React.memo(({ 
    media, 
    index, 
    fullscreenIndex, 
    isFullscreen: isFullscreenProp, 
    isLoaded, 
    globalVolume, 
    onMediaClick, 
    onImageError,
    onVideoError, 
    onIconClick,
    onClose,
    onSimilar, 
    onRemove,
    onLike,
    isLiked,
    mediaRef,
    masonryRef,
}) => {
    const { postLink, videoLinks = []} = media || {};
    const [isMediaLoaded, setIsMediaLoaded] = useState(false);
    const [isLikedLocal, setIsLikedLocal] = useState(isLiked || false);
    const wrapperRef = useRef(null);
    
    if (!media || videoLinks.length === 0 || !videoLinks[0]) return null;

    const handleMediaLoad = () => {
        setIsMediaLoaded(true);
        if (wrapperRef.current) {
            wrapperRef.current.classList.add('loaded');
        }
        // ← Add this: retrigger masonry layout after image loads
        if (masonryRef?.current?.layout) {
            masonryRef.current.layout();
        }
    }


    const handleMediaError = (e, postLink, type) => {
        console.error(`${type} failed to load:`, {
            url: e.target?.src || e.target?.currentSrc,
            postLink
        });

        // Hide the broken element immediately
        if (e.target) {
            e.target.style.display = 'none';
        }

        // Hide the placeholder by marking as loaded
        setIsMediaLoaded(true);

        if (type === 'Image') {
            onImageError(e, postLink);
        } else {
            onVideoError(e, postLink);
        }
    };

    // Use explicit prop if provided, otherwise fall back to index comparison
    const isFullscreen = isFullscreenProp !== undefined ? isFullscreenProp : (fullscreenIndex === index);

    const renderMediaElement = (videoLink, postLink, globalVolume, isFullscreen, ref) => {
        const mediaType = getMediaType(videoLink);
        const isVideo = mediaType === MEDIA_TYPES.VIDEO;
        const isEmbed = mediaType === MEDIA_TYPES.EMBED;

        if (isEmbed) {
            return (
                <iframe
                    ref={ref}
                    key={`${postLink}-embed`}
                    title={`Embedded media from ${postLink}`}
                    src={videoLink}
                    frameBorder="0"
                    allowFullScreen
                    onLoad={() => handleMediaLoad()}
                    onError={(e) => handleMediaError(e, postLink, 'Embed')}
                    className="media-embed"
                    style={{ opacity: isMediaLoaded ? 1 : 0, transition: 'opacity 0.3s ease-in' }}
                />
            );
        }

        if (isVideo) {
            return (
                <video
                    ref={ref}
                    key={`${postLink}-video`}
                    src={videoLink}
                    controls
                    muted={!isFullscreen}
                    loop={isFullscreen}
                    autoPlay={isFullscreen}
                    preload={isFullscreen ? "auto" : "metadata"}
                    onLoadedData={(e) => {
                        e.target.volume = globalVolume;
                        handleMediaLoad();
                    }}
                    onPlay={(e) => { e.target.volume = globalVolume; }}
                    onError={(e) => handleMediaError(e, postLink, 'Video')}
                    className="media-video"
                    style={{ opacity: isMediaLoaded ? 1 : 0, transition: 'opacity 0.3s ease-in' }}
                />
            );
        }

        return (
            <>
                <img
                    ref={ref}
                    key={`${postLink}-img-${videoLink}`}
                    src={videoLink}
                    alt="Media content"
                    loading="eager"
                    fetchpriority={isFullscreen ? "high" : "low"}
                    decoding="async"
                    onLoad={() => {
                        handleMediaLoad();
                    }}
                    onError={(e) => handleMediaError(e, postLink, 'Image')}
                    className="media-image"
                        style={{ opacity: isMediaLoaded ? 1 : 0, transition: 'opacity 0.3s ease-in' }}
                    />
                {!isMediaLoaded && (
                    <div className="image-loading-placeholder">
                        <div className="loading-spinner"></div>
                    </div>
                )}
            </>
        );
    };

    const handleLikeClick = (e) => {
        e.stopPropagation();
        setIsLikedLocal(!isLikedLocal);
        onLike(postLink, !isLikedLocal);
    };

    const handleIconButtonClick = (handler, e) => {
        e.stopPropagation();
        switch (handler) {
            case 'like':
                handleLikeClick(e);
                break;
            case 'link':
                onIconClick(postLink);
                break;
            case 'similar':
                onSimilar(postLink);
                break;
            case 'remove':
                onRemove(postLink);
                break;
            default:
                break;
        }
    };

    return (
        <div
            ref={wrapperRef}
            className={`media-wrapper masonry-item ${isMediaLoaded ? 'loaded' : ''} ${isFullscreen ? 'fullscreen' : ''}`}
            onClick={() => onMediaClick(index)}
            data-index={index}
        >
            {isFullscreen && videoLinks.length > 1 ? (
                videoLinks.map((videoLink, idx) => 
                    renderMediaElement(videoLink, postLink, globalVolume, isFullscreen, idx === 0 ? mediaRef : null)
                )
            ) : (
                renderMediaElement(videoLinks[0], postLink, globalVolume, isFullscreen, mediaRef)
            )}
            
            {!isFullscreen && (
                <>
                    <div className="icon-container">
                        {BUTTON_CONFIG.map((btn) => {
                            const shouldRender = !btn.condition || (postLink && btn.condition(postLink, videoLinks));
                            if (!shouldRender) return null;

                            const isLikeButton = btn.handler === 'like';
                            
                            // Handle info-only buttons (like number-icon)
                            if (btn.isInfoOnly) {
                                return (
                                    <button
                                        key={btn.handler}
                                        className={btn.className}
                                        aria-label={btn.ariaLabel}
                                        disabled
                                    >
                                        <i className={btn.icon}></i>
                                        <span className="button-count">{videoLinks.length}</span>
                                    </button>
                                );
                            }
                            
                            return (
                                <button
                                    key={btn.handler}
                                    className={`${btn.className} ${isLikeButton && isLikedLocal ? 'liked' : ''}`}
                                    onClick={(e) => handleIconButtonClick(btn.handler, e)}
                                    aria-label={btn.ariaLabel}
                                >
                                    <i className={`${btn.icon} ${isLikeButton && isLikedLocal ? 'filled' : ''}`}></i>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        className="close-icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        aria-label="Close media"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.index === nextProps.index &&
        prevProps.fullscreenIndex === nextProps.fullscreenIndex &&
        prevProps.isFullscreen === nextProps.isFullscreen &&
        prevProps.isLoaded === nextProps.isLoaded &&
        prevProps.globalVolume === nextProps.globalVolume
    );
});

// TagsPanel component - displays categorized tags
export const TagsPanel = ({ 
    tags, 
    tagFilter, 
    onTagClick, 
    onAddTagToFilter, 
    onAddTagToBlacklist,
    isMinimized,
    onToggleMinimized
}) => {
    const [isCollapsed, setIsCollapsed] = useState(isMinimized);

    useEffect(() => {
        setIsCollapsed(isMinimized);
    }, [isMinimized]);

    const handleToggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
        onToggleMinimized();
    };

    if (!tags) return null;

    const categorizedTags = Array.isArray(tags) ? { general: tags } : tags;
    
    const categories = [
        { key: 'author', label: 'Artists' },
        { key: 'copyright', label: 'Copyright' },
        { key: 'character', label: 'Characters' },
        { key: 'general', label: 'General' }
    ];
    
    return (
        <div className={`tags-panel ${isMinimized ? 'minimized' : ''}`}>
            <div className="tags-header">
                <span className="tags-header-title">Tags</span>
                <div className="tags-header-controls">
                    <button 
                        className="tags-minimize-button"
                        onClick={handleToggleCollapse}
                        title={isCollapsed ? "Expand tags" : "Minimize tags"}
                    >
                        <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
                    </button>
                </div>
            </div>
            
            {!isCollapsed && (
                <div className="tags-content">
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
                                            className="tag-container"
                                        >
                                            <span 
                                                className={`tag tag-${category.key} ${tagFilter.includes(tag) ? 'active' : ''}`}
                                                onClick={(e) => onTagClick(tag, e)}
                                            >
                                                {tag}
                                            </span>
                                            <div className="tag-actions">
                                                <button 
                                                    className="tag-action tag-action-plus" 
                                                    onClick={(e) => onAddTagToFilter(tag, e)}
                                                    title="Filter by this tag"
                                                >
                                                    <i className="fas fa-plus"></i>
                                                </button>
                                                <button 
                                                    className="tag-action tag-action-minus" 
                                                    onClick={(e) => onAddTagToBlacklist(tag, e)}
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
            )}
        </div>
    );
};

// NotificationContainer component - displays notifications
export const NotificationContainer = ({ notifications, onRemoveNotification }) => (
    <div className="notifications-container">
        {notifications.map((notification) => (
            <div 
                key={notification.id} 
                className={`notification ${notification.type}`}
                style={{ top: `${20 + (Array.from(notifications).findIndex(n => n.id === notification.id) * 70)}px` }}
            >
                <button
                    className="notification-close-btn"
                    onClick={() => onRemoveNotification(notification.id)}
                    aria-label="Close notification"
                >
                    <i className="fas fa-times"></i>
                </button>
                {notification.type === 'progress' ? (
                    <>
                        {typeof notification.progress === 'number' && !notification.isComplete ? (
                            <div className="notification-progress-wrapper">
                                <p className="notification-message">{notification.message}</p>
                                <div className="notification-progress-circle">
                                    <svg className="progress-ring" viewBox="0 0 100 100">
                                        <circle className="progress-ring-bg" cx="50" cy="50" r="45" />
                                        <circle 
                                            className="progress-ring-fill" 
                                            cx="50" 
                                            cy="50" 
                                            r="45"
                                            style={{
                                                strokeDashoffset: 282.7 - (282.7 * notification.progress) / 100
                                            }}
                                        />
                                    </svg>
                                    <span className="notification-progress-text">{notification.progress}%</span>
                                </div>
                            </div>
                        ) : null}
                        {notification.isComplete ? (
                            <p className="notification-message notification-completed">
                                Completed!
                            </p>
                        ) : null}
                        {!notification.isComplete && notification.progress === undefined ? (
                            <div className="notification-loading">
                                <div className="notification-spinner"></div>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <>
                        <p className="notification-message">{notification.message}</p>
                        <div className="notification-progress" />
                    </>
                )}
            </div>
        ))}
    </div>
);

// SettingsDialog component - settings modal
export const SettingsDialog = ({ 
    showSettings,
    showDefaultLinks,
    filter,
    scrollSpeed,
    globalVolume,
    tagBlacklist,
    onClose,
    onShowDefaultLinksChange,
    onFilterChange,
    onScrollSpeedChange,
    onVolumeChange,
    onTagBlacklistChange,
    onDeleteBlacklisted,
    updateSliderFill,
    updateVolumeSliderFill
}) => {
    if (!showSettings) return null;

    return (
        <div className="settings-dialog">
            <div className="settings-content">
                <div className="settings-header">
                    <h2>Gallery Settings</h2>
                    <button onClick={onClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="settings-body">
                    <div className="settings-item">
                        <label>Include Demo Content:</label>
                        <div className="default-links-toggle settings-toggle">
                            <button 
                                className={`content-filter-option ${showDefaultLinks ? 'active' : ''}`}
                                onClick={() => onShowDefaultLinksChange(true)}
                            >
                                Show
                            </button>
                            <button 
                                className={`content-filter-option ${!showDefaultLinks ? 'active' : ''}`}
                                onClick={() => onShowDefaultLinksChange(false)}
                            >
                                Hide
                            </button>
                        </div>
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
                                onScrollSpeedChange(newSpeed);
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
                                onVolumeChange(newVolume);
                                updateVolumeSliderFill(newVolume);
                            }}
                            className="volume-slider"
                        />
                    </div>

                    <div className="settings-item">
                        <label htmlFor="tag-blacklist">Tag Blacklist (comma-separated):</label>
                        <div className="blacklist-controls">
                            <input
                                type="text"
                                id="tag-blacklist"
                                value={tagBlacklist}
                                onChange={onTagBlacklistChange}
                                placeholder="Enter tags to blacklist"
                            />
                            <button 
                                className="delete-blacklisted-button"
                                onClick={onDeleteBlacklisted}
                                title="Delete all media containing blacklisted tags"
                            >
                                <i className="fas fa-trash-alt"></i> Delete All
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};