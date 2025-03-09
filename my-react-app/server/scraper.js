const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();

// Configure resource blocking for better performance
const { createBlockResourcesPlugin } = require('./blockResourcesPlugin');
const blockResourcesPlugin = createBlockResourcesPlugin(['font']);
puppeteer.use(StealthPlugin());
puppeteer.use(blockResourcesPlugin);

// Configuration - Environment variables with defaults
const CONFIG = {
  // Paths
  EDGE_PATH: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  LINKS_PATH: process.env.LINKS_PATH || path.join(__dirname, '../../build/links.json'),
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '../../data'),
  UBLOCK_PATH: process.env.UBLOCK_PATH || path.resolve('C:/Users/cliff/AppData/Local/Microsoft/Edge/User Data/Default/Extensions/odfafepnkmbhccpbejgmiehpchacaeak/1.62.0_0'),
  
  // URLs
  FEED_URL: process.env.FEED_URL || 'https://www.pixiv.net/discovery?mode=r18',
  PIXIV_LOGIN_URL: process.env.PIXIV_LOGIN_URL || 'https://accounts.pixiv.net/login?return_to=https%3A%2F%2Fwww.pixiv.net%2Fen%2F&lang=en&source=pc&view_type=page',
  
  // Credentials - Always use environment variables for sensitive data
  PIXIV_USERNAME: process.env.PIXIV_USERNAME,
  PIXIV_PASSWORD: process.env.PIXIV_PASSWORD,
  
  // Scraping settings
  PAGE_TARGET: parseInt(process.env.PAGE_TARGET || '10'),
  
  // Rate limiting
  RATE_LIMIT: {
    minTime: parseInt(process.env.RATE_LIMIT_MIN_TIME || '800'),
    maxConcurrent: parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT || '3'),
    retries: parseInt(process.env.RATE_LIMIT_RETRIES || '2')
  }
};

// Derived paths
const PIXIV_LINKS_PATH = path.resolve(CONFIG.DATA_DIR, 'pixivLinks.json');

// Domain-specific selectors
const WEBSITE_SELECTORS = {
  'pixiv.net': {
    nextPage: [
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-feed-page > div > div > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target',
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-home-page > div > div.right-panel > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target',
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-view-page > div > div > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target'
    ],
    media: [
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-post-page > app-page > app-post-page-content > app-post-image > div > img'
    ]
  },
  'gelbooru.com': {
    nextPage: ['#paginator > a:nth-child(10)'],
    media: ['img#image', '#container > main > div.mainBodyPadding > section.image-container.note-container > picture']
  },
  'rule34video.com': {
    nextPage: [
      '#custom_list_videos_common_videos_pagination > div.item.pager.next > a',
      '#custom_list_videos_common_videos_pagination > div.item.pager.next > a > svg > use',
      '#custom_list_videos_most_recent_videos_pagination > div.item.pager.next',
      '#custom_list_videos_common_videos_pagination > div.item.pager.next'
    ],
  },
  'kemono.su': {
    nextPage: [
      '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div > section > div.sc-s8zj3z-4.gjeneI > div.sc-ikag3o-1.mFrzi > nav > a:nth-child(9)',
      '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div.sc-12rgki1-0.jMEnyM > nav > a:nth-child(9)'
    ],
    media: ['img[src*=".webp"]']
  },
  'r-34.xyz': {
    nextPage: [
      '#custom_list_videos_common_videos_pagination > div.item.pager.next > a'
    ],
    media: ['body > div.root.dark-theme > main > div.appbar-content > div:nth-child(2) > div.con']
  },
  'danbooru': {
    nextPage: [
      '#posts > div > div.paginator.numbered-paginator.mt-8.mb-4.space-x-2.flex.justify-center.items-center > a.paginator-next'
    ],
    media: ['#image', '#content > section.image-container.note-container.blacklisted > picture']
  },
  // Fallback selectors for any website not explicitly defined
  'default': {
    nextPage: [
      'body > div.main_content > div.overview_thumbs > ul > li:nth-child(7) > a',
      'body > div.main_content > div.overview_thumbs > ul > li:nth-child(4) > a'
    ],
    media: [
      'video source[type="video/mp4"]',
      'img#image',
      'main video#gelcomVideoPlayer source',
      'picture img',
      'img[src*=".webp"]',
      'img',
      'body > div.main_content.post_section > div.outer_post > div.post_image > div > img'
    ]
  }
};

// For backward compatibility - create flat array of all next page selectors
const NEXT_PAGE_SELECTORS = Object.values(WEBSITE_SELECTORS)
  .flatMap(site => site.nextPage);

// DOM selectors for navigation
const scrapeVideos = async (providedLink = null, page = null, username = null, progressCallback = null) => {
    let browser;
    let totalLinksAdded = 0;  // Add this line to track total links
    
    try {
        const postLinksQueue = [];
        
        if (!page) {
            // Let Puppeteer use its bundled Chromium
            const launchOptions = {
                headless: process.env.NODE_ENV === 'production', // Use headless mode in production
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--no-zygote',
                ]
            };
            
            // Only use different options in development environment
            if (process.env.NODE_ENV !== 'production') {
                launchOptions.headless = true;
                launchOptions.args.push(`--disable-extensions-except=${CONFIG.UBLOCK_PATH}`);
                launchOptions.args.push(`--load-extension=${CONFIG.UBLOCK_PATH}`);
                // Only use Edge in development environment
                launchOptions.executablePath = CONFIG.EDGE_PATH;
            }
            
            //console.log('Launching browser with options:', JSON.stringify(launchOptions, null, 2));
            browser = await puppeteer.launch(launchOptions);
            const context = browser.defaultBrowserContext();
            page = await context.newPage();
            
            // Remove the duplicate request interception - blockResourcesPlugin already handles this
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
        }

        await page.setBypassCSP(true);


        if ((!providedLink) || providedLink.includes('pixiv')) {
            await loginToPixiv(page, providedLink);
            totalLinksAdded = await collectPixivLinks(page, postLinksQueue, providedLink, username, progressCallback);
        } else {
            totalLinksAdded = await handleProvidedLink(page, providedLink, postLinksQueue, [], username, progressCallback);
        }

        return { postLinksQueue, linksAdded: totalLinksAdded }; // Return both the queue and count
    } catch (error) {
        console.error('Error scraping videos:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

// 2. EFFICIENT DATA STRUCTURES - Use Sets for faster lookups
const readExistingLinks = (username = null) => {
    let links = [];
    let linkSet = new Set();
    
    // If username is provided, read from user-specific file
    if (username) {
        const userDir = path.resolve(__dirname, '../../data/users', username);
        const filePath = path.join(userDir, 'links.json');
        
        if (fs.existsSync(filePath)) {
            try {
                const data = fs.readFileSync(filePath, 'utf-8');
                links = JSON.parse(data);
                linkSet = new Set(links.map(link => link.postLink));
                console.log(`Read ${linkSet.size} existing links for user ${username}`);
            } catch (error) {
                console.error(`Error reading existing links for user ${username}:`, error);
            }
        }
        return { links, linkSet };
    }
    
    // Default behavior for backward compatibility
    if (fs.existsSync(CONFIG.LINKS_PATH)) {
        const data = fs.readFileSync(CONFIG.LINKS_PATH, 'utf-8');
        links = JSON.parse(data);
        linkSet = new Set(links.map(link => link.postLink));
    }
    
    return { links, linkSet };
};

const loginToPixiv = async (page, providedLink) => {
    await page.goto(CONFIG.PIXIV_LOGIN_URL, {
        timeout: 180000,
        waitUntil: 'networkidle2'
    });

    if (page.url().includes('https://www.pixiv.net/en/')) {
        console.log('Already logged in to Pixiv.');
        return;
    }

    // Wait for username field to be visible before typing
    await page.waitForSelector('input[type="text"]', { visible: true });
    await page.type('input[type="text"]', CONFIG.PIXIV_USERNAME);
    
    // Wait for password field to be visible
    await page.waitForSelector('input[type="password"]', { visible: true });
    await page.type('input[type="password"]', CONFIG.PIXIV_PASSWORD);
    
    // Wait for login button and click it
    const loginButtonSelector = '#app-mount-point > div > div > div.sc-fvq2qx-4.csnYja > div.sc-2o1uwj-0.bOKfsa > form > button.charcoal-button.sc-2o1uwj-10.ldVSLT';
    await page.waitForSelector(loginButtonSelector, { visible: true });
    await page.click(loginButtonSelector);
    
    console.log('Logging in to Pixiv...');

    // Wait for navigation to complete after login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
    
    if (page.url().includes('https://www.pixiv.net/en/')) {
        console.log('Successfully logged in to Pixiv.');
        return;
    } else {
        console.log('Waiting for complete login...');
        // More robust wait for successful login
        await page.waitForFunction(() => {
            return window.location.href.includes('https://www.pixiv.net/en/');
        }, { timeout: 60000 });
        console.log('Login completed successfully');
    }
};

const navigateToFeed = async (page, providedLink) => {
    if (providedLink){
        await page.goto(providedLink, { waitUntil: 'networkidle2' });
    }
    else {
        await page.goto(CONFIG.FEED_URL, { waitUntil: 'networkidle2' });
    }
    console.log('Successfully navigated to the Pixiv page.');
};

const handleProvidedLink = async (page, providedLink, postLinksQueue, existingLinks, username, progressCallback) => {
    console.log('Provided link:', providedLink);
    let totalAdded = 0;  // Add counter
    
    // Read ALL existing links for this user to avoid duplicates
    const { linkSet: existingLinkSet } = readExistingLinks(username);

    await page.goto(providedLink, { waitUntil: 'networkidle2' });

    if (providedLink.includes('rule34video')) {
        const buttonSelector = 'body > div > div.popup.popup_access > div > div.bottom > input:nth-child(1)';
        await page.waitForSelector(buttonSelector, { timeout: 5000 });
        await page.click(buttonSelector);
    }

    totalAdded = await collectAndScrapeLinks(page, postLinksQueue, existingLinks, providedLink, username, progressCallback, existingLinkSet);
    return totalAdded;  // Return the total
};

// 1. PARALLEL PROCESSING - Process links in parallel batches
const collectAndScrapeLinks = async (page, postLinksQueue, existingLinks, providedLink = null, username, progressCallback, existingLinkSet = null) => {
    let totalAdded = 0;  // Add counter
    let pageCount = 0;
    let feedPageUrl = providedLink || CONFIG.FEED_URL;
    const mediaSelectors = [
        'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-post-page > app-page > app-post-page-content > app-post-image > div > img',
        'video source[type="video/mp4"]',
        'img#image',
        'main video#gelcomVideoPlayer source',
        'picture img',
        'img[src*=".webp"]',
        'img',
        'body > div.main_content.post_section > div.outer_post > div.post_image > div > img'
    ];

    // If not provided, create a Set for faster duplicate checking from existingLinks
    if (!existingLinkSet) {
        // Use the enhanced readExistingLinks function to get ALL existing links
        const { linkSet } = readExistingLinks(username);
        existingLinkSet = linkSet;
    }

    while (pageCount < CONFIG.PAGE_TARGET) {
        //await page.goto(feedPageUrl, { waitUntil: 'networkidle2' });
        
        // 3. SMART WAITING - Wait for content to load
        await page.waitForSelector('a', { timeout: 50000 });
        
        // Scroll to load lazy content if needed
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        
        // Wait for any dynamic content to load after scrolling
        await new Promise(resolve => setTimeout(resolve, 1000));

        const postLinks = await page.evaluate((providedLink) => {
            const links = Array.from(document.querySelectorAll('a'));
            const kemonoRegex = /kemono\.su/;
            if (providedLink && kemonoRegex.test(providedLink)) {
                return links.map(link => link.href).filter(href => href.includes('/post') && !href.includes('/posts'));
            } else {
                return links.map(link => link.href).filter(href => href.includes('/post/') || href.includes('/index.php?page=post&s=view&id') || href.includes('/video') || href.includes('/artworks') || href.includes('/posts/'));
            }
        }, providedLink);

        // Filter only links that don't exist in our collection
        const newPostLinks = postLinks.filter(link => !existingLinkSet.has(link));
        console.log(`Found ${postLinks.length} post links, ${newPostLinks.length} are new`);
        
        postLinksQueue.push(...newPostLinks);

        if (newPostLinks.length === 0) {
            console.log('Nothing New Found, moving to the next saved link.');
            break;
        }
        
        // 1. PARALLEL PROCESSING - Process links in batches with improved resource management
        const batchSize = CONFIG.RATE_LIMIT.maxConcurrent;
        while (postLinksQueue.length > 0) {
            // Reduce batch size if we're running low on links to avoid wasting resources
            const currentBatchSize = Math.min(batchSize, postLinksQueue.length);
            const batch = postLinksQueue.splice(0, currentBatchSize);
            
            // Add retry capability to each link processing
            const results = await Promise.allSettled(
                batch.map(link => processLinkWithRetry(
                    page.browser(), 
                    link, 
                    existingLinkSet, 
                    mediaSelectors, 
                    username, 
                    progressCallback, 
                    CONFIG.RATE_LIMIT.retries
                ))
            );
            
            // Update existingLinkSet and totalAdded
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value.mediaLink) {
                    existingLinkSet.add(result.value.mediaLink.postLink);
                    existingLinks.push(result.value.mediaLink);
                    totalAdded += result.value.linksAdded;
                }
            });
            
            // Call progress callback with batch total
            if (progressCallback) {
                progressCallback(totalAdded);
            }
            
            // 4. RESOURCE MANAGEMENT - Dynamic rate limiting based on success rate
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.mediaLink).length;
            const successRate = successCount / batch.length;
            
            // If success rate is low, wait longer before next batch
            const waitTime = successRate < 0.5 ? 
                CONFIG.RATE_LIMIT.minTime * 2 : 
                CONFIG.RATE_LIMIT.minTime;
                
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        await page.goto(feedPageUrl, { waitUntil: 'networkidle2' });
        const nextPageSelector = await findNextPageSelector(page, pageCount, feedPageUrl);
        if (nextPageSelector) {
            await page.waitForSelector(nextPageSelector, { timeout: 2000 });
            if (feedPageUrl.includes('rule34video')) {
                await page.click(nextPageSelector);
            }
            else {
                await page.click(nextPageSelector);
            }

            if (feedPageUrl !== page.url()) {
                feedPageUrl = page.url();
                await page.reload({ waitUntil: 'networkidle2' }); // Refresh the page
                pageCount++;
            }

            // if (feedPageUrl.includes('rule34video') || feedPageUrl.includes('kusowanka')) {
            //     await page.reload({ waitUntil: 'networkidle2' }); // Refresh the page
            // }

        } else {
            break;
        }
        console.log(`New links added: ${newPostLinks.length}`);
        console.log(`Total links count: ${existingLinks.length}`);
    }
    
    return totalAdded;  // Return the total
};

// New function with retry capability
const processLinkWithRetry = async (browser, link, existingLinkSet, mediaSelectors, username, progressCallback, retriesLeft = 1) => {
    try {
        const result = await processLink(browser, link, existingLinkSet, mediaSelectors, username, progressCallback);
        
        // If no media was found and we have retries left, try again with different wait strategy
        if (!result.mediaLink && retriesLeft > 0) {
            console.log(`Retrying link: ${link} (${retriesLeft} retries left)`);
            return processLinkWithRetry(browser, link, existingLinkSet, mediaSelectors, username, progressCallback, retriesLeft - 1);
        }
        
        return result;
    } catch (error) {
        // If error and retries left, try again
        if (retriesLeft > 0) {
            console.log(`Error on ${link}, retrying (${retriesLeft} retries left): ${error.message}`);
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return processLinkWithRetry(browser, link, existingLinkSet, mediaSelectors, username, progressCallback, retriesLeft - 1);
        }
        
        console.error(`Failed to process ${link} after all retries:`, error.message);
        return { linksAdded: 0 };
    }
};

// Enhance the processLink function with better waiting strategy
const processLink = async (browser, link, existingLinkSet, mediaSelectors, username, progressCallback) => {
    let page = null;
    
    try {
        page = await browser.newPage();
        
        
        // Check if link already exists for efficiency
        if (existingLinkSet.has(link)) {
            return { linksAdded: 0 };
        }
        
        const jinaLink = link.includes('kemono.su') ? `https://r.jina.ai/${link}` : link;
        
        // Set a more generous timeout for navigation
        await page.setDefaultNavigationTimeout(60000);
        
        // Better waiting strategy - use networkidle2 for more complete page loading
        const response = await page.goto(jinaLink, { 
            waitUntil: ['domcontentloaded', 'networkidle2'], // Try to wait for both events
            timeout: 60000 
        });
        
        if (!response || response.status() === 404) {
            console.error(`Resource not found at ${jinaLink} (404)`);
            return { linksAdded: 0 };
        }

        let mediaData;
        if (link.includes('/video')) {
            const videoId = link.match(/\/video\/(\d+)/)?.[1];
            if (videoId) {
                mediaData = `https://rule34video.com/embed/${videoId}`;
            }
        } else {
            // Enhanced waiting - scroll and wait for possible lazy-loaded content
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight/2);
                window.scrollTo(0, document.body.scrollHeight);
                return true;
            });
            
            // Wait additional time for lazy-loaded images
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Wait for readyState complete with increased timeout
            await page.waitForFunction(() => {
                return document.readyState === 'complete';
            }, { timeout: 60000 });
            
            mediaData = await extractMediaData(page, link, mediaSelectors);
        }

        if (mediaData) {
            const mediaLink = { postLink: link, videoLinks: [mediaData] }; // Add video link with square brackets
            const linksAdded = saveMediaLinks([mediaLink], username);
            
            return { mediaLink, linksAdded };
        }
        
        return { linksAdded: 0 };
    } catch (error) {
        console.error(`Failed to load resource at ${link}:`, error.message);
        return { linksAdded: 0 };
    } finally {
        // Safety check before closing the page to prevent protocol errors
        if (page) {
            try {
                // Check if page is still connected to browser
                if (page.isClosed === undefined || !page.isClosed()) {
                    await page.close().catch(e => {
                    });
                }
            } catch (closeError) {
            }
        }
    }
};

// Enhance the extractMediaData function with more media types and better selectors
const extractMediaData = async (page, link, mediaSelectors) => {
    if (link.includes('kemono.su')) {
        const pageContent = await page.evaluate(() => document.body.innerText);
        const mediaUrls = pageContent.match(/https:\/\/n\d\.kemono\.su\/data\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32}\.(png|jpg|gif|webm|webp)\?f=\S+/g);
        return mediaUrls ? mediaUrls.find(url => url.includes('kemono') && !url.includes('/logo.png')) : null;
    } else {
        try {
            // Get site-specific selectors first, then fall back to provided ones
            const siteSelectors = getSiteSelectors(link).media;
            const combinedSelectors = [...siteSelectors, ...mediaSelectors];
            
            const result = await page.evaluate((selectors) => {
                // First try the specified selectors
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        const src = element.src || element.currentSrc;
                        if (src && /\.(mp4|png|jpg|jpeg|gif|webm|webp)$/i.test(src) && !src.includes('/logo.png')) {
                            return src;
                        }
                    }
                }
                
                return null;
            }, combinedSelectors);
            
            return result;
        } catch (error) {
            console.error(`Error extracting media data:`, error);
            return null;
        }
    }
};

const findNextPageSelector = async (page, pageCount, feedPageUrl) => {
    // Special case for gelbooru that requires page count
    if (feedPageUrl.includes('gelbooru')) {
        const selector = `#paginator > a:nth-child(${pageCount + 2})`
        const exists = await page.$(selector) !== null;
        if (exists) {
            return selector;
        } else {
            return null;
        }
    } 
    
    // Get website-specific selectors
    const siteSelectors = getSiteSelectors(feedPageUrl).nextPage;
    
    // Try site-specific selectors first
    for (const selector of siteSelectors) {
        const exists = await page.$(selector) !== null;
        if (exists) {
            return selector;
        }
    }
    
    // If not found, try all selectors as fallback
    for (const selector of NEXT_PAGE_SELECTORS) {
        if (!siteSelectors.includes(selector)) {
            const exists = await page.$(selector) !== null;
            if (exists) {
                return selector;
            }
        }
    }
    
    return null;
};

const saveMediaLinks = (mediaLinks, username) => {
    if (!username) {
        console.error('No username provided for saving media links');
        return 0;
    }
    
    // Make path more explicit and ensure it works in development
    const userDir = path.resolve(__dirname, '../../data/users', username);
    
    // Ensure directory exists with better error handling
    try {
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
    } catch (err) {
        console.error(`Failed to create directory ${userDir}:`, err);
        // Try alternative directory
        const altUserDir = path.resolve(__dirname, '../data/users', username);
        if (!fs.existsSync(altUserDir)) {
            fs.mkdirSync(altUserDir, { recursive: true });
        }
    }
    
    const filePath = path.join(userDir, 'links.json');
    
    let existingLinks = [];
    
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            existingLinks = JSON.parse(data);
        }

        // Merge new links with existing ones, avoiding duplicates
        const newLinks = mediaLinks.filter(newLink => 
            !existingLinks.some(existingLink => 
                existingLink.postLink === newLink.postLink
            )
        );
        
        if (newLinks.length > 0) {
            const updatedLinks = [...existingLinks, ...newLinks];
            fs.writeFileSync(filePath, JSON.stringify(updatedLinks, null, 2));
            console.log(`Saved ${newLinks.length} new media links to ${filePath}`);
            return newLinks.length; // Return number of new links added
        } else {
            return 0;
        }
    } catch (error) {
        console.error(`Error saving media links to ${filePath}:`, error);
        // Try to save to an alternative location
        try {
            const altFilePath = path.resolve(__dirname, '../data/users', username, 'links.json');
            const altDir = path.dirname(altFilePath);
            if (!fs.existsSync(altDir)) {
                fs.mkdirSync(altDir, { recursive: true });
            }
            fs.writeFileSync(altFilePath, JSON.stringify(mediaLinks, null, 2));
            console.log(`Saved to alternative location: ${altFilePath}`);
            return mediaLinks.length;
        } catch (altError) {
            console.error(`Failed to save to alternative location:`, altError);
            return 0;
        }
    }
};

const savePixivLinks = (pixivLinks, username, providedLink) => {
    if (!username) {
        console.error('No username provided for saving Pixiv links');
        return 0;
    }
    
    // Use data/users instead of build/users to match server.js
    const userDir = path.join(__dirname, '../../data/users', username);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    
    const filePath = providedLink && providedLink.includes('discovery?mode=r18') 
        ? path.join(userDir, 'pixivLinks.json') 
        : path.join(userDir, 'links.json');
    
    let existingLinks = [];
    
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        existingLinks = JSON.parse(data);
    }

    // Merge new links with existing ones, avoiding duplicates
    const newLinks = pixivLinks.filter(newLink => 
        !existingLinks.some(existingLink => 
            existingLink.postLink === newLink.postLink
        )
    );
    
    const updatedLinks = [...existingLinks, ...newLinks];
    fs.writeFileSync(filePath, JSON.stringify(updatedLinks, null, 2));
    console.log(`Saved ${newLinks.length} new Pixiv links to ${filePath}`);
    return newLinks.length; // Return number of new links added
};

const clearPixivLinks = () => {
    if (fs.existsSync(PIXIV_LINKS_PATH)) {
        fs.writeFileSync(PIXIV_LINKS_PATH, JSON.stringify([], null, 2));
        console.log('Pixiv links cleared in', PIXIV_LINKS_PATH);
    }
};

const randomWait = () => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 500));

const scrapeSavedLinks = async () => {
    const filePath = path.join(__dirname, '../public/scrape-links.json');
    if (!fs.existsSync(filePath)) {
        throw new Error('scrape-links.json file not found');
    }

    const data = fs.readFileSync(filePath, 'utf8');
    const links = JSON.parse(data);

    // Let Puppeteer use its bundled Chromium
    const launchOptions = {
        headless: process.env.NODE_ENV === 'production',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ]
        // Remove executablePath to use bundled Chromium
    };
    
    // Only use different options in development environment
    if (process.env.NODE_ENV !== 'production') {
        launchOptions.args.push(`--disable-extensions-except=${CONFIG.UBLOCK_PATH}`);
        launchOptions.args.push(`--load-extension=${CONFIG.UBLOCK_PATH}`);
        launchOptions.executablePath = CONFIG.EDGE_PATH;
    }
    
    const browser = await puppeteer.launch(launchOptions);

    const scrapePromises = links.map(async (link) => {
        const page = await browser.newPage();
        try {
            await scrapeVideos(link, page);
        } catch (error) {
            console.error(`Error scraping link ${link}:`, error);
        } finally {
            await page.close();
        }
    });

    await Promise.all(scrapePromises);
    await browser.close();

    return links; // Return the list of post links
};

const processPixivLink = async (page, link, feedPageUrl, username, progressCallback) => {
    try {
        const artworkId = link.match(/\/artworks\/(\d+)/)[1];
        const apiUrl = `https://www.phixiv.net/api/info?id=${artworkId}&language=en`;
        await page.goto(apiUrl, { waitUntil: 'networkidle2' });

        const mediaData = await page.evaluate(() => document.body.innerText);
        if (mediaData) {
            const imageUrls = mediaData.match(/https:\/\/[^"]+\.(jpg|jpeg|png|gif|webp)/g) || [];
            if (imageUrls.length > 0) {
                const mediaLink = { postLink: link, videoLinks: imageUrls };
                console.log('Image URLs:', imageUrls);

                const linksAdded = feedPageUrl.includes("bookmark_new_illust_r18") || 
                                 feedPageUrl.includes("illustrations") || 
                                 feedPageUrl.includes("artworks")
                    ? saveMediaLinks([mediaLink], username)
                    : savePixivLinks([mediaLink], username, feedPageUrl);
                
                // Call progress callback after saving links
                if (progressCallback) {
                    progressCallback(linksAdded);
                }
                return linksAdded;
            }
        }
        return 0;
    } catch (error) {
        console.error(`Failed to load resource at ${link}:`, error);
        return 0;
    }
};

const collectPixivLinks = async (page, postLinksQueue, providedLink, username, progressCallback) => {
    let feedPageUrl = providedLink || CONFIG.FEED_URL;
    let pageCount = 0;
    let existingLinks = [];

    if (!feedPageUrl.includes("bookmark_new_illust_r18") && !feedPageUrl.includes("illustrations") || feedPageUrl.includes("artworks")) {
        clearPixivLinks(); // Clear pixivLinks at the beginning
    }

    if (fs.existsSync(PIXIV_LINKS_PATH)) {
        const data = fs.readFileSync(PIXIV_LINKS_PATH, 'utf-8');
        existingLinks = JSON.parse(data);
    }

    // Load existing links from links.json to avoid duplicates - Use our enhanced function
    const { linkSet: existingLinkSet } = readExistingLinks(username);
    console.log(`Loaded ${existingLinkSet.size} existing links for duplicate checking`);

    let totalAdded = 0;

    while (pageCount < CONFIG.PAGE_TARGET) {
        await page.goto(feedPageUrl, { waitUntil: 'networkidle2' });

        
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(resolve => setTimeout(resolve, 1000)); //Wait for 1 second
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(resolve => setTimeout(resolve, 1000)); //Wait for 1 second
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(resolve => setTimeout(resolve, 3000)); //Wait for 3 second

        const postLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            return links.map(link => link.href).filter(href => href.includes('/artworks'));
        });

        // Use our Set for O(1) lookups instead of O(n) array searches
        const pixivExistingSet = new Set(existingLinks.map(link => link.postLink));
        const newPostLinks = postLinks.filter(link => 
            !pixivExistingSet.has(link) && !existingLinkSet.has(link)
        );
        
        const uniqueNewPostLinks = [...new Set(newPostLinks)]; // Ensure uniqueness efficiently
        console.log(`Found ${postLinks.length} Pixiv links, ${uniqueNewPostLinks.length} are new`);
        
        postLinksQueue.push(...uniqueNewPostLinks);

        if (uniqueNewPostLinks.length === 0) {
            console.log('Nothing New Found, moving to the next saved link.');
            break;
        }
        while (postLinksQueue.length > 0) {
            const link = postLinksQueue.shift();
            // Check if the link already exists in links.json
            if (!existingLinks.some(existingLink => existingLink.postLink === link)) {
                const newLinks = await processPixivLink(page, link, feedPageUrl, username, progressCallback);
                totalAdded += newLinks;
                // Call progress callback after each link is processed
                if (progressCallback) {
                    progressCallback(totalAdded);
                }
            } else {
                console.log(`Skipping duplicate link: ${link}`);
            }
        }

        const nextPageSelector = await findNextPageSelector(page, pageCount, feedPageUrl);
        if (nextPageSelector) {
            await page.waitForSelector(nextPageSelector, { timeout: 2000 });
            await page.click(nextPageSelector);
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            feedPageUrl = page.url();
            pageCount++;
        } else {
            console.log('No next page button found, moving to the next saved link.');
            break;
        }

        console.log(`New links added: ${uniqueNewPostLinks.length}`);
        console.log(`Total links count: ${postLinksQueue.length}`);
    }
    return totalAdded;
};

// Helper function to get appropriate selectors for a given URL
const getSiteSelectors = (url) => {
  if (!url) return WEBSITE_SELECTORS.default;
  
  // Get domain from URL
  let domain;
  try {
    domain = new URL(url).hostname.toLowerCase();
  } catch (e) {
    return WEBSITE_SELECTORS.default;
  }
  
  // Find matching domain in WEBSITE_SELECTORS
  for (const siteDomain in WEBSITE_SELECTORS) {
    if (domain.includes(siteDomain)) {
      return WEBSITE_SELECTORS[siteDomain];
    }
  }
  
  return WEBSITE_SELECTORS.default;
};

module.exports = { scrapeVideos, scrapeSavedLinks };

