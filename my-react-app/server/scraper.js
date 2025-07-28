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
  UBLOCK_PATH: process.env.UBLOCK_PATH || 'C:\\Users\\cliff\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Extensions\\odfafepnkmbhccpbejgmiehpchacaeak\\1.62.0_0',
  COOKIES_PATH: process.env.COOKIES_PATH || path.join(__dirname, './cookies.json'),
  
  // URLs
  FEED_URL: process.env.FEED_URL || 'https://www.pixiv.net/discovery?mode=r18',
  PIXIV_LOGIN_URL: process.env.PIXIV_LOGIN_URL || 'https://accounts.pixiv.net/login?return_to=https%3A%2F%2Fwww.pixiv.net%2Fen%2F&lang=en&source=pc&view_type=page',
  
  // Credentials - Always use environment variables for sensitive data
  PIXIV_USERNAME: process.env.PIXIV_USERNAME,
  PIXIV_PASSWORD: process.env.PIXIV_PASSWORD,
  
  // Scraping settings
  PAGE_TARGET: parseInt(process.env.PAGE_TARGET || '5'), // Number of pages to scrape
  
  // Rate limiting
  RATE_LIMIT: {
    minTime: parseInt(process.env.RATE_LIMIT_MIN_TIME || '500'),
    maxConcurrent: parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT || '10'),
    retries: parseInt(process.env.RATE_LIMIT_RETRIES || '2')
  }
};

// Derived paths
const PIXIV_LINKS_PATH = path.resolve(CONFIG.DATA_DIR, 'pixivLinks.json');

// Domain-specific selectors
const WEBSITE_SELECTORS = {
    'erome.com': {
        nextPage: ['#page > ul > li:nth-child(13) > a',],
        media: ['[id^="album_"]'],  // Match any ID starting with "album_" and common media elements
        tag: [
        ],
        links: 'a[href*="/a/"]'  // Match links containing "/a/" which will find both relative and absolute URLs
    },
    'e621.net': {
    nextPage: ['#paginator-next'],
    media: ['body > div#page > div#c-posts > div#a-show > div.post-index > div.content > div#image-and-nav > section#image-container > #image'],
    tag: [
        '#tag-list > ul.tag-list.artist-tag-list > li > a.tag-list-search > span:nth-child(1)',
        '#tag-list > ul.tag-list.copyright-tag-list > li > a.tag-list-search > span:nth-child(1)',
        '#tag-list > ul.tag-list.character-tag-list > li > a.tag-list-search > span:nth-child(1)',
        '#tag-list > ul.tag-list.general-tag-list > li > a.tag-list-search > span:nth-child(1)',
    ],
    links: 'a[href*="/posts/"]'
    },
  'pixiv.net': {
    nextPage: [
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-feed-page > div > div > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target',
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-home-page > div > div.right-panel > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target',
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-view-page > div > div > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target'
    ],
    media: [
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-post-page > app-page > app-post-page-content > app-post-image > div > img'
    ],
    links: 'a[href*="/artworks"]'
  },
  'gelbooru': {
    nextPage: ['#paginator > a:nth-child(10)'],
    media: ['img#image', '#container > main > div.mainBodyPadding > section.image-container.note-container > picture'],
    tag: [
        'body > div > section.aside > ul > li.tag-type-artist > a',
        'body > div > section.aside > ul > li.tag-type-copyright > a',
        'body > div > section.aside > ul > li.tag-type-character > a',
        'body > div > section.aside > ul > li.tag-type-general > a',
    ],
    links: 'a[href*="/index.php?page=post&s=view&id"]'
  },
  'rule34video': {
    nextPage: [
      '#custom_list_videos_common_videos_pagination > div.item.pager.next > a',
      '#custom_list_videos_common_videos_pagination > div.item.pager.next > a > svg > use',
      '#custom_list_videos_most_recent_videos_pagination > div.item.pager.next',
      '#custom_list_videos_common_videos_pagination > div.item.pager.next'
    ],
    links: 'a[href*="/video"]'
  },
  'kemono.su': {
    nextPage: [
      '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div > section > div.sc-s8zj3z-4.gjeneI > div.sc-ikag3o-1.mFrzi > nav > a:nth-child(9)',
      '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div.sc-12rgki1-0.jMEnyM > nav > a:nth-child(9)'
    ],
    media: ['img[src*=".webp"]'],
    links: 'a[href*="/post"]:not([href*="/posts"])'
  },
  'r-34.xyz': {
    nextPage: [
      '#custom_list_videos_common_videos_pagination > div.item.pager.next > a'
    ],
    media: ['body > div > main > div.appbar-content > div:nth-child(2) > div.con > img'],
    tag: [
        'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div:nth-child(1) > a.b-link > button > h4',
        'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div:nth-child(2) > a.b-link > button > h4',
        'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div:nth-child(3) > a.b-link > button > h4',
        'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div.flow-root > div > a.b-link > button > h4',
    ],
    links: 'a[href*="/post/"]:not([href*="/post/random"])'
  },
  'donmai': {
    nextPage: [
      '#posts > div > div.paginator.numbered-paginator.mt-8.mb-4.space-x-2.flex.justify-center.items-center > a.paginator-next'
    ],
    media: ['#image', '#content > section.image-container.note-container.blacklisted > picture'],
    tag: [
        '#tag-list > div > ul.artist-tag-list > li > span:nth-child(2) > a',
        'body > div#page > div#c-posts > div > div > aside > section#tag-list > div > ul.copyright-tag-list > li > span:nth-child(2) > a',
        'body > div#page > div#c-posts > div > div > aside > section#tag-list > div > ul.character-tag-list > li > span:nth-child(2) > a',
        'body > div#page > div#c-posts > div > div > aside > section#tag-list > div > ul.general-tag-list > li > span:nth-child(2) > a',
    ],
    links: 'a[href*="/posts/"]'
  },
  'pixiv.net': {
    nextPage: [
        '#__next > div > div:nth-child(2) > div.sc-1e6e6d57-0.gQkIQm.__top_side_menu_body > div.sc-3d8ed48f-1 > div > section > div:nth-child(2) > div.sc-afb2b593-4.fJdNho > div.sc-b3f71196-1.iUnFZF > nav > a:nth-child(9)',
      ],
    media: ['#__next > div > div:nth-child(2) > div.sc-1e6e6d57-0.gQkIQm.__top_side_menu_body > div.sc-3d8ed48f-1 > div > section > div:nth-child(2) > div.sc-afb2b593-4.fJdNho > div.sc-b3f71196-1.iUnFZF > nav > a:nth-child(9)'],
    tag: [
        'body > div.main_content > div.sidebar > ul.artists_list > li > a',
        'body > div.main_content > div.sidebar > ul.parodies_list > li > a',
        'body > div.main_content > div.sidebar > ul.characters_list > li > a',
        'body > div.main_content > div.sidebar > ul.tags_list > li > a'
    ],
    links:  'a[href*="/artworks/"]'
  },
  'kusowanka': {
    nextPage: [
        'body > div.main_content > div.overview_thumbs > ul > li:last-child > a',
      ],
    media: ['body > div.main_content.post_section > div.main_post.related_post > div.outer_post > div.post_image > div > img'],
    tag: [
        'body > div.main_content > div.sidebar > ul.artists_list > li > a',
        'body > div.main_content > div.sidebar > ul.parodies_list > li > a',
        'body > div.main_content > div.sidebar > ul.characters_list > li > a',
        'body > div.main_content > div.sidebar > ul.tags_list > li > a'
    ],
    links: 'a[href*="/post/"]:not([href*="/post/random"])'
  },
  // Fallback selectors for any website not explicitly defined
  'default': {
    nextPage: [
      'body > div.main_content > div.overview_thumbs > ul > li:nth-child(7) > a',
      'body > div.main_content > div.overview_thumbs > ul > li:nth-child(4) > a'
    ],
    media: [
      'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-post-page > app-page > app-post-page-content > app-post-image > div > img',
      'video source[type="video/mp4"]',
      'img#image',
      'main video#gelcomVideoPlayer source',
      'picture img',
      'img[src*=".webp"]',
      'img',
      'body > div.main_content.post_section > div.outer_post > div.post_image > div > img'
    ],
    links: 'a[href*="/post/"], a[href*="/index.php?page=post&s=view&id"], a[href*="/video"], a[href*="/artworks"], a[href*="/posts/"]:not([href*="/post/random"])'
  }
};

// Extract allowed domains from WEBSITE_SELECTORS for tab monitoring
const ALLOWED_DOMAINS = Object.keys(WEBSITE_SELECTORS)
    .filter(key => key !== 'default')
    .map(domain => domain.replace(/\./g, '\\.'));  // Escape dots for regex

// Function to check if a URL belongs to our allowed domains
const isAllowedUrl = (url) => {
    if (!url) return false;
    // Create regex pattern to match any of our allowed domains
    const pattern = new RegExp(`(${ALLOWED_DOMAINS.join('|')})`, 'i');
    return pattern.test(url);
};

// Debounce utility function
const debounce = (func, delay) => {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
};

// Function to monitor and close ad tabs
const monitorAndCloseAdTabs = async (browser, ignoredPage = null) => {
    try {
        const pages = await browser.pages();
        for (const page of pages) {
            // Skip the main page we're working with
            if (ignoredPage && page === ignoredPage) continue;
            
            // Check if page is still valid and connected to browser
            if (!page || page.isClosed?.()) continue;
            
            // Try to get URL and skip if it fails (indicates a disconnected page)
            let url;
            try {
                url = await page.url();
                
                // Skip about:blank pages
                if (!url || url === 'about:blank') continue;
                
                if (!isAllowedUrl(url) && !page.isBusy) {
                    console.log(`Closing ad tab with URL: ${url}`);
                    // Add additional safety check before closing
                    if (!page.isClosed?.()) {
                        await page.close().catch(e => console.error('Error closing ad tab:', e.message));
                    }
                }
            } catch (urlError) {
                // If we can't get the URL, the page is likely already closed or disconnected
                console.log("Skipping tab - unable to get URL");
            }
        }
    } catch (error) {
        console.error('Error in tab monitor:', error.message);
    }
};

// Create debounced version of the ad tab monitor function
const debouncedMonitorAndCloseAdTabs = debounce(monitorAndCloseAdTabs, 2000); // 2 second debounce

// For backward compatibility - create flat array of all next page selectors
const NEXT_PAGE_SELECTORS = Object.values(WEBSITE_SELECTORS)
  .flatMap(site => site.nextPage);

// DOM selectors for navigation
const scrapeVideos = async (providedLink = null, page = null, username = null, progressCallback = null, options = {}) => {
    let browser;
    let totalLinksAdded = 0;  // Add this line to track total links
    let tabMonitorInterval;  // Create interval reference
    const { skipSave = false, contentType = 0 } = options; // Add contentType option with default 0 (SFW)
    
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
                launchOptions.headless = false;
                // Only use Edge in development environment
                launchOptions.executablePath = CONFIG.EDGE_PATH;
                
                // Add uBlock Origin extension in development mode if the path exists
                if (fs.existsSync(CONFIG.UBLOCK_PATH)) {
                    launchOptions.args.push(`--load-extension=${CONFIG.UBLOCK_PATH}`);
                    console.log('Using uBlock Origin ad blocker');
                } else {
                    console.log('uBlock Origin path not found:', CONFIG.UBLOCK_PATH);
                }
            }
            
            //console.log('Launching browser with options:', JSON.stringify(launchOptions, null, 2));
            browser = await puppeteer.launch(launchOptions);
            const context = browser.defaultBrowserContext();
            page = await context.newPage();
            
            // Setup tab monitor interval - check every 3 seconds for ad tabs with debouncing
            tabMonitorInterval = setInterval(() => {
                debouncedMonitorAndCloseAdTabs(browser, page);
            }, 3000);
        }

        await page.setBypassCSP(true);


        if ((!providedLink) || providedLink.includes('pixiv')) {
            await loginToPixiv(page, providedLink);
            totalLinksAdded = await collectPixivLinks(page, postLinksQueue, providedLink, username, progressCallback, skipSave);
        } else {
            totalLinksAdded = await handleProvidedLink(page, providedLink, postLinksQueue, [], username, progressCallback, { skipSave, contentType });
        }
        
        // Send a final progress update
        if (progressCallback) {
            progressCallback(totalLinksAdded, `Scraping completed: found ${totalLinksAdded} items`, true);
        }

        return { postLinksQueue, linksAdded: totalLinksAdded }; // Return both the queue and count
    } catch (error) {
        console.error('Error scraping videos:', error);
        throw error;
    } finally {
        if (tabMonitorInterval) {
            clearInterval(tabMonitorInterval);
        }
        if (browser) {
            await browser.close();
        }
    }
};

// 2. EFFICIENT DATA STRUCTURES - Use Sets for faster lookups
const readExistingLinks = (username = null, contentType = 0) => {
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
                
                // Ensure all links have categorized tags
                links = links.map(link => ensureCategorizedTags(link, contentType));
                
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
        
        // Ensure all links have categorized tags
        links = links.map(link => ensureCategorizedTags(link, contentType));
        
        linkSet = new Set(links.map(link => link.postLink));
    }
    
    return { links, linkSet };
};

// Helper function to save cookies to file
const saveCookies = async (page) => {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(CONFIG.COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('Cookies saved successfully to', CONFIG.COOKIES_PATH);
    return true;
  } catch (error) {
    console.error('Error saving cookies:', error);
    return false;
  }
};

// Helper function to load cookies from file
const loadCookies = async (page) => {
  try {
    if (fs.existsSync(CONFIG.COOKIES_PATH)) {
      const cookiesString = fs.readFileSync(CONFIG.COOKIES_PATH, 'utf8');
      const cookies = JSON.parse(cookiesString);
      
      if (cookies.length > 0) {
        for (const cookie of cookies) {
          await page.setCookie(cookie);
        }
        console.log('Cookies loaded successfully from', CONFIG.COOKIES_PATH);
        return true;
      }
    }
    console.log('No cookies file found or cookies are empty');
    return false;
  } catch (error) {
    console.error('Error loading cookies:', error);
    return false;
  }
};

const loginToPixiv = async (page, providedLink) => {
  // First try to load cookies and check if we're already logged in
  await loadCookies(page);
  
  // Try to navigate to the page to check if cookies worked
  await page.goto(CONFIG.PIXIV_LOGIN_URL, {
    timeout: 180000,
    waitUntil: 'networkidle2'
  });

  // Check if we're already logged in after applying cookies
  if (page.url().includes('https://www.pixiv.net/en/')) {
    console.log('Already logged in to Pixiv using saved cookies.');
    return;
  }

  console.log('Cookies expired or not found. Proceeding with manual login...');

  // Wait for username field to be visible before typing
  await page.waitForSelector('input[type="text"]', { visible: true });
  await page.type('input[type="text"]', CONFIG.PIXIV_USERNAME);
  
  // Wait for password field to be visible
  await page.waitForSelector('input[type="password"]', { visible: true });
  await page.type('input[type="password"]', CONFIG.PIXIV_PASSWORD);
  
  // Wait for login button and click it
  const loginButtonSelector = '#app-mount-point > div > div > div.sc-fvq2qx-4.bntRDI > div.sc-2oz7me-0.iGLGot > form > button.charcoal-button.sc-2o1uwj-10.divuub';
  await page.waitForSelector(loginButtonSelector, { visible: true });
  await page.click(loginButtonSelector);
  
  console.log('Logging in to Pixiv...');

  // Wait for navigation to complete after login
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
  
  if (page.url().includes('https://www.pixiv.net/en/')) {
    console.log('Successfully logged in to Pixiv.');
    // Save cookies after successful login
    await saveCookies(page);
    return;
  } else {
    console.log('Waiting for complete login...');
    // More robust wait for successful login
    await page.waitForFunction(() => {
      return window.location.href.includes('https://www.pixiv.net/en/');
    }, { timeout: 60000 });
    console.log('Login completed successfully');
    // Save cookies after successful login
    await saveCookies(page);
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

const handleProvidedLink = async (page, providedLink, postLinksQueue, existingLinks, username, progressCallback, options = {}) => {
    console.log('Provided link:', providedLink);
    let totalAdded = 0;  // Add counter
    const { skipSave = false, contentType = 0 } = options;
    
    // Initial progress update
    if (progressCallback) {
        progressCallback(0, 'Starting to scrape...', false);
    }
    
    // Read ALL existing links for this user to avoid duplicates - unless we're not saving (guest mode)
    const { linkSet: existingLinkSet } = skipSave ? { linkSet: new Set() } : readExistingLinks(username, contentType);

    await page.goto(providedLink, { waitUntil: 'networkidle2' });

    if (providedLink.includes('rule34video')) {
        const buttonSelector = 'body > div > div.popup.popup_access > div > div.bottom > input:nth-child(1)';
        await page.waitForSelector(buttonSelector, { timeout: 5000 });
        await page.click(buttonSelector);
    }
    else if (providedLink.includes('e621.net')) {
        const buttonSelector = '#guest-warning-accept';
        await page.waitForSelector(buttonSelector, { timeout: 5000 });
        await page.click(buttonSelector);
    }
    else if (providedLink.includes('erome.com')) {
        const buttonSelector = '#home-box > div.enter';
        await page.waitForSelector(buttonSelector, { timeout: 5000 });
        await page.click(buttonSelector);
        await page.goto(providedLink, { waitUntil: 'networkidle2' });
    }

    totalAdded = await collectAndScrapeLinks(page, postLinksQueue, existingLinks, providedLink, username, progressCallback, existingLinkSet, skipSave, contentType);
    return totalAdded;  // Return the total
};

// 1. PARALLEL PROCESSING - Process links in parallel batches
const collectAndScrapeLinks = async (page, postLinksQueue, existingLinks, providedLink = null, username, progressCallback, existingLinkSet = null, skipSave = false, contentType = 0) => {
    let totalAdded = 0;  // Add counter
    let pageCount = 0;
    let feedPageUrl = providedLink || CONFIG.FEED_URL;

    // If not provided, create a Set for faster duplicate checking from existingLinks
    if (!existingLinkSet) {
        // Use the enhanced readExistingLinks function to get ALL existing links
        const { linkSet } = readExistingLinks(username, contentType);
        existingLinkSet = linkSet;
    }
    
    // Setup tab cleanup interval
    let tabCleanupInterval;
    
    try {
        const browser = page.browser();
        
        // // Setup tab monitor interval - check every 3 seconds with debouncing
        // tabCleanupInterval = setInterval(() => {
        //     debouncedMonitorAndCloseAdTabs(browser, page);
        // }, 3000);

        while (pageCount < CONFIG.PAGE_TARGET) {
            //await page.goto(feedPageUrl, { waitUntil: 'networkidle2' });
            
            // Progress update for each page
            if (progressCallback) {
                progressCallback(totalAdded, `Scraping page ${pageCount + 1}...`, false);
            }
            
            // 3. SMART WAITING - Wait for content to load
            await page.waitForSelector('a', { timeout: 50000 });
            
            // Scroll to load lazy content if needed
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            
            // Wait for any dynamic content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get the appropriate selector for the current website
            const siteSelectors = getSiteSelectors(providedLink);
            const linkSelector = siteSelectors.links || WEBSITE_SELECTORS.default.links;
            
            const postLinks = await page.evaluate((selector) => {
                const links = Array.from(document.querySelectorAll(selector));
                return links.map(link => link.href);
            }, linkSelector);

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
                // Update progress with batch information
                if (progressCallback) {
                    progressCallback(totalAdded, `Processing batch: ${Math.min(batchSize, postLinksQueue.length)} items, ${totalAdded} found so far`, false);
                }
                
                // Reduce batch size if we're running low on links to avoid wasting resources
                const currentBatchSize = Math.min(batchSize, postLinksQueue.length);
                const batch = postLinksQueue.splice(0, currentBatchSize);
                
                // Add retry capability to each link processing
                const results = await Promise.allSettled(
                    batch.map(link => {
                        // Check if link already exists for efficiency
                        if (existingLinkSet.has(link)) {
                            return Promise.resolve({ status: 'fulfilled', value: { linksAdded: 0 } });
                        }
                        
                        return processLinkWithRetry(
                            page.browser(), 
                            link, 
                            existingLinkSet, 
                            skipSave ? null : username, // Don't pass username if skipSave is true
                            null, // Don't pass progress callback here 
                            CONFIG.RATE_LIMIT.retries,
                            skipSave, // Pass skipSave flag
                            contentType // Pass contentType
                        );
                    })
                );
                
                // Collect newly added media items
                const newMediaItems = [];
                
                // Update existingLinkSet and totalAdded
                results.forEach(result => {
                    if (result.status === 'fulfilled' && result.value.mediaLink) {
                        existingLinkSet.add(result.value.mediaLink.postLink);
                        existingLinks.push(result.value.mediaLink);
                        totalAdded += result.value.linksAdded;
                        newMediaItems.push(result.value.mediaLink);
                    }
                });
                
                // Call progress callback with batch items and total
                if (progressCallback && newMediaItems.length > 0) {
                    progressCallback(totalAdded, `Processed batch: found ${totalAdded} items total`, false, newMediaItems);
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
                if (progressCallback) {
                    progressCallback(totalAdded, `Moving to next page, ${totalAdded} items found so far`, false);
                }
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
            } else {
                break;
            }
            console.log(`New links added: ${newPostLinks.length}`);
            console.log(`Total links count: ${existingLinks.length}`);
        }
    } finally {
        // Clear interval when done
        if (tabCleanupInterval) {
            clearInterval(tabCleanupInterval);
        }
    }
    
    // Final progress update
    if (progressCallback) {
        progressCallback(totalAdded, `Scraping completed: ${totalAdded} items found`, true);
    }
    
    return totalAdded;  // Return the total
};

// New function with retry capability - updated with skipSave parameter
const processLinkWithRetry = async (browser, link, existingLinkSet, username, progressCallback, retriesLeft = 1, skipSave = false, contentType = 0) => {
    // Check if link already exists for efficiency
    if (existingLinkSet.has(link)) {
        return { linksAdded: 0 };
    }
    
    try {
        const result = await processLink(browser, link, existingLinkSet, username, progressCallback, skipSave, contentType);
        
        // If no media was found and we have retries left, try again with different wait strategy
        if (!result.mediaLink && retriesLeft > 0) {
            console.log(`Retrying link: ${link} (${retriesLeft} retries left)`);
            return processLinkWithRetry(browser, link, existingLinkSet, username, progressCallback, retriesLeft - 1, skipSave, contentType);
        }
        
        // Make sure to always return the linksAdded count
        return {
            mediaLink: result.mediaLink,
            linksAdded: result.mediaLink ? 1 : 0
        };
    } catch (error) {
        // If error and retries left, try again
        if (retriesLeft > 0) {
            console.log(`Error on ${link}, retrying (${retriesLeft} retries left): ${error.message}`);
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return processLinkWithRetry(browser, link, existingLinkSet, username, progressCallback, retriesLeft - 1, skipSave, contentType);
        }
        
        console.error(`Failed to process ${link} after all retries:`, error.message);
        return { linksAdded: 0 };
    }
};

// Fix the syntax error in the extractMediaData function
const extractMediaData = async (page, link) => {
    // Initialize result object with default values
    const result = {
        mediaUrls: [], // Changed from mediaUrl to mediaUrls array
        tags: {
            author: [],
            copyright: [],
            character: [],
            general: []
        }
    };

    if (link.includes('r-34.xyz')) {
        rule34xyzSelector = 'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div > div > div';
        await page.click(rule34xyzSelector);
    }

    if (link.includes('kemono.su')) {
        const pageContent = await page.evaluate(() => document.body.innerText);
        const mediaUrls = pageContent.match(/https:\/\/n\d\.kemono\.su\/data\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32}\.(png|jpg|gif|webm|webp)\?f=\S+/g);
        // Store all found kemono.su URLs that aren't logos
        if (mediaUrls) {
            result.mediaUrls = mediaUrls.filter(url => url.includes('kemono') && !url.includes('/logo.png'));
        }
        
        // Also try to extract tags for Kemono
        try {
            const extractedTags = await page.evaluate(() => {
                const tagElements = document.querySelectorAll('.tag');
                return Array.from(tagElements).map(el => el.textContent.trim());
            });
            
            if (extractedTags.length > 0) {
                // For Kemono, put all tags in general category since they aren't pre-categorized
                result.tags.general = extractedTags;
                console.log(`Extracted ${extractedTags.length} tags from Kemono.su`);
            }
        } catch (e) {
            console.log('No tags found for Kemono link');
        }
    } else {
        try {
            // Get site-specific selectors first, only use default if site-specific don't exist
            const siteSelectors = getSiteSelectors(link);
            const selectorsToUse = (siteSelectors.media && siteSelectors.media.length > 0) 
                ? siteSelectors.media 
                : WEBSITE_SELECTORS.default.media || [];
            
            // Extract all media URLs (changed to collect all matches instead of just the first one)
            result.mediaUrls = await page.evaluate((selectors) => {
                let urls = [];
                
                // Try all specified selectors
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        const src = element.src || element.currentSrc;
                        if (src && /\.(mp4|png|jpg|jpeg|gif|webm|webp)$/i.test(src) && !src.includes('/logo.png')) {
                            // Add to the array instead of returning immediately
                            urls.push(src);
                        }
                    }
                }
                
                // Remove duplicates before returning
                return [...new Set(urls)];
            }, selectorsToUse);
            
            // Extract tags if tag selectors exist for this site
            if (siteSelectors.tag && siteSelectors.tag.length > 0) {
                // Extract tags by category based on selector index
                // [0] = author, [1] = copyright, [2] = character, [3] = general
                const categoryNames = ['author', 'copyright', 'character', 'general'];
                
                for (let i = 0; i < siteSelectors.tag.length; i++) {
                    const category = categoryNames[i] || 'general';
                    const selector = siteSelectors.tag[i];
                    
                    const categoryTags = await page.evaluate((selector) => {
                        const elements = document.querySelectorAll(selector);
                        return Array.from(elements).map(el => el.textContent.trim());
                    }, selector);
                    
                    if (categoryTags.length > 0) {
                        result.tags[category] = categoryTags;
                    }
                }
                
                const totalTags = Object.values(result.tags).flat().length;
                console.log(`Extracted ${totalTags} categorized tags from ${link}`);
            }
        } catch (error) {
            console.error(`Error extracting media data:`, error);
        }
    }
    
    return result;
};

// Updated processPixivLink function
const processPixivLink = async (browser, link, feedPageUrl, username, progressCallback, skipSave = false, contentType = 0) => {
    try {
        // Create a new page for this process
        const page = await browser.newPage();
        
        try {
            const artworkId = link.match(/\/artworks\/(\d+)/)[1];
            const apiUrl = `https://www.phixiv.net/api/info?id=${artworkId}&language=en`;
            await page.goto(apiUrl, { waitUntil: 'networkidle2' });

            // Initialize result object with default values similar to processLink function
            const result = {
                postLink: link,
                videoLinks: [],
                tags: {
                    author: [],
                    general: []
                }
            };

            const mediaData = await page.evaluate(() => document.body.innerText);
            if (mediaData) {
                // Extract image URLs using regex
                result.videoLinks = mediaData.match(/https:\/\/[^"]+master[^"]*\.(jpg|jpeg|png|gif|webp)/g) || [];
                
                try {
                    // Extract author name using regex
                    const authorMatch = mediaData.match(/"author_name"\s*:\s*"([^"]+)"/);
                    if (authorMatch && authorMatch[1]) {
                        result.tags.author = [authorMatch[1]];
                        console.log(`Found author: ${authorMatch[1]}`);
                    }
                    
                    // Extract general tags using the new format
                    const tagsMatch = mediaData.match(/"tags"\s*:\s*\[(.*?)\]/);
                    if (tagsMatch && tagsMatch[1]) {
                        // Extract all quoted strings in the tags array
                        const tagItems = tagsMatch[1].match(/"([^"]+)"/g);
                        if (tagItems && tagItems.length > 0) {
                            // Clean the tags - remove quotes and "#" prefixes for storage
                            result.tags.general = tagItems.map(tagItem => {
                                const cleanTag = tagItem.replace(/"/g, '');
                                // If tag starts with #, remove it but preserve the rest
                                return cleanTag.startsWith('#') ? cleanTag.substring(1) : cleanTag;
                            });
                            console.log(`Found ${result.tags.general.length} general tags`);
                        }
                    }
                    
                    // Remove empty categories and ensure we have unique tags
                    Object.keys(result.tags).forEach(category => {
                        if (result.tags[category]) {
                            result.tags[category] = [...new Set(result.tags[category])]; // Remove duplicates
                            if (result.tags[category].length === 0) {
                                delete result.tags[category]; // Remove empty categories
                            }
                        }
                    });
                    
                    const totalTags = Object.values(result.tags).flat().length;
                    if (totalTags > 0) {
                        console.log(`Extracted ${totalTags} tags from Pixiv artwork ${artworkId}`);
                        
                        // Save tags to domain-specific file
                        if (!skipSave && username) {
                            saveTagsByDomain(result.tags, 'pixiv.net', username);
                        }
                    }
                } catch (e) {
                    console.log('Error extracting Pixiv tags:', e);
                }
                
                if (result.videoLinks.length > 0) {
                    const mediaLink = { 
                        postLink: link, 
                        videoLinks: result.videoLinks,
                        tags: result.tags 
                    };

                    // Only save to disk if we're not in skipSave mode
                    const linksAdded = skipSave ? 1 : (feedPageUrl.includes("bookmark_new_illust_r18") || 
                                     feedPageUrl.includes("illustrations") || 
                                     feedPageUrl.includes("artworks")
                        ? saveMediaLinks([mediaLink], username, contentType)
                        : savePixivLinks([mediaLink], username, feedPageUrl, contentType));
                    
                    // Update progress callback to match collectAndScrapeLinks format
                    if (progressCallback) {
                        progressCallback(linksAdded, `Processed batch: found ${linksAdded} items total`, false, [mediaLink]);
                    }
                    
                    // Return both the mediaLink and linksAdded count
                    return { mediaLink, linksAdded };
                }
            }
            return { linksAdded: 0 }; // Return 0 if no links were added
        } catch (error) {
            console.error(`Failed to load resource at ${link}:`, error);
            return { linksAdded: 0 }; // Return 0 on error
        } finally {
            // Always close the page when done
            if (page && !page.isClosed()) {
                await page.close().catch(e => console.error('Error closing page:', e.message));
            }
        }
    } catch (browserError) {
        console.error(`Browser error processing ${link}:`, browserError);
        return { linksAdded: 0 };
    }
};

const processLink = async (browser, link, existingLinkSet, username, progressCallback, skipSave = false, contentType = 0) => {
    let page = null;
    let tabCleanupInterval;
    
    try {
        page = await browser.newPage();
        
        // Check if the link is from Kemono.su and add the redirect prefix if needed
        const jinaLink = link.includes('kemono.su') ? `https://r.jina.ai/${link}` : link;
        
        // Set a more generous timeout for navigation
        await page.setDefaultNavigationTimeout(60000);
        
        // Better waiting strategy - use networkidle2 for more complete page loading
        const response = await page.goto(jinaLink, { 
            waitUntil: ['domcontentloaded', 'networkidle2'], 
            timeout: 60000 
        });
        
        if (!response || response.status() === 404) {
            console.error(`Resource not found at ${jinaLink} (404)`);
            return { linksAdded: 0 };
        }

        let extractedData;
        if (link.includes('/video')) {
            const videoId = link.match(/\/video\/(\d+)/)?.[1];
            if (videoId) {
                extractedData = {
                    mediaUrls: [`https://rule34video.com/embed/${videoId}`],
                    tags: { general: [] } // Initialize with empty tags for videos
                };
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
            
            extractedData = await extractMediaData(page, link);
        }

        if (extractedData && extractedData.mediaUrls.length > 0) {
            // Make sure we have a properly structured tags object
            const tags = extractedData.tags || { 
                author: [],
                copyright: [], 
                character: [], 
                general: []
            };
            
            const mediaLink = { 
                postLink: link, 
                videoLinks: extractedData.mediaUrls,
                tags: tags
            };
            
            // Only save to disk if we're not in skipSave mode
            const linksAdded = skipSave ? 1 : saveMediaLinks([mediaLink], username, contentType);
            
            // Save tags by domain if available and not skipping saves
            if (extractedData.tags && !skipSave) {
                const domain = getDomainFromUrl(link);
                saveTagsByDomain(extractedData.tags, domain, username);
            }
            
            // Pass the new media item to the progress callback if it exists
            if (progressCallback && linksAdded > 0) {
                progressCallback(null, null, false, [mediaLink]);
            }
            
            return { mediaLink, linksAdded };
        }
        
        return { linksAdded: 0 };
    } catch (error) {
        console.error(`Failed to load resource at ${link}:`, error.message);
        return { linksAdded: 0 };
    } finally {
        if (tabCleanupInterval) {
            clearInterval(tabCleanupInterval);
        }
        
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

// Helper function to ensure tags are in the proper categorized format
const ensureCategorizedTags = (mediaLink, contentType = 0) => {
    if (!mediaLink.tags) {
        mediaLink.tags = {
            author: [],
            copyright: [],
            character: [],
            general: []
        };
    } else {
        // If tags is already an object with categories, make sure all expected categories exist
        if (typeof mediaLink.tags === 'object' && !Array.isArray(mediaLink.tags)) {
            const expectedCategories = ['author', 'copyright', 'character', 'general'];
            expectedCategories.forEach(category => {
                if (!mediaLink.tags[category]) {
                    mediaLink.tags[category] = [];
                }
            });
        } else {
            // If tags is a flat array, convert it to categorized format (all in general)
            if (Array.isArray(mediaLink.tags)) {
                const oldTags = [...mediaLink.tags];
                mediaLink.tags = {
                    author: [],
                    copyright: [],
                    character: [],
                    general: oldTags
                };
            }
        }
    }
    
    // Add NSFW tag if content is scraped in NSFW mode (contentType === 1)
    if (contentType === 1) {
        // Check if nsfw tag already exists in any category
        const hasNsfwTag = Object.values(mediaLink.tags).some(categoryTags => 
            Array.isArray(categoryTags) && categoryTags.some(tag => 
                tag.toLowerCase() === 'nsfw'
            )
        );
        
        // Add nsfw tag to general category if it doesn't exist
        if (!hasNsfwTag) {
            mediaLink.tags.general.push('nsfw');
        }
    }
    
    return mediaLink;
};

const saveMediaLinks = (mediaLinks, username, contentType = 0) => {
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
    let newLinksCount = 0; // Make sure to explicitly track count
    
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            existingLinks = JSON.parse(data);
            
            // Ensure all existing links have categorized tags
            existingLinks = existingLinks.map(link => ensureCategorizedTags(link, contentType));
        }

        // Ensure all new links have categorized tags
        const categorizedMediaLinks = mediaLinks.map(link => ensureCategorizedTags(link, contentType));

        // Merge new links with existing ones, avoiding duplicates
        const newLinks = categorizedMediaLinks.filter(newLink => 
            !existingLinks.some(existingLink => 
                existingLink.postLink === newLink.postLink
            )
        );
        
        newLinksCount = newLinks.length; // Save count explicitly
        
        if (newLinksCount > 0) {
            const updatedLinks = [...existingLinks, ...newLinks];
            fs.writeFileSync(filePath, JSON.stringify(updatedLinks, null, 2));
            console.log(`Saved ${newLinksCount} new media links to ${filePath}`);
        }
        
        return newLinksCount; // Always return count
    } catch (error) {
        console.error(`Error saving media links to ${filePath}:`, error);
        // Try to save to an alternative location
        try {
            // Ensure all new links have categorized tags
            const categorizedMediaLinks = mediaLinks.map(link => ensureCategorizedTags(link, contentType));
            
            const altFilePath = path.resolve(__dirname, '../data/users', username, 'links.json');
            const altDir = path.dirname(altFilePath);
            if (!fs.existsSync(altDir)) {
                fs.mkdirSync(altDir, { recursive: true });
            }
            fs.writeFileSync(altFilePath, JSON.stringify(categorizedMediaLinks, null, 2));
            console.log(`Saved to alternative location: ${altFilePath}`);
            return categorizedMediaLinks.length;
        } catch (altError) {
            console.error(`Failed to save to alternative location:`, altError);
            return 0;
        }
    }
};

const savePixivLinks = (pixivLinks, username, providedLink, contentType = 0) => {
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
        
        // Ensure all existing links have categorized tags
        existingLinks = existingLinks.map(link => ensureCategorizedTags(link, contentType));
    }

    // Ensure all new pixiv links have categorized tags
    const categorizedPixivLinks = pixivLinks.map(link => ensureCategorizedTags(link, contentType));

    // Merge new links with existing ones, avoiding duplicates
    const newLinks = categorizedPixivLinks.filter(newLink => 
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

const scrapeSavedLinks = async (username = null, progressCallback = null, skipSave = false) => {
    // Determine the file path based on whether we have a username or not
    let filePath;
    if (username) {
        filePath = path.join(__dirname, '../../data/users', username, 'scrape-links.json');
    } else {
        // Default path for backward compatibility
        filePath = path.join(__dirname, '../public/scrape-links.json');
    }
    
    if (!fs.existsSync(filePath)) {
        throw new Error('scrape-links.json file not found');
    }

    const data = fs.readFileSync(filePath, 'utf8');
    const links = JSON.parse(data);

    // Launch options setup
    const launchOptions = {
        headless: process.env.NODE_ENV === 'production',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ]
    };
    
    // Only use different options in development environment
    if (process.env.NODE_ENV !== 'production') {
        launchOptions.executablePath = CONFIG.EDGE_PATH;
        
        // Add uBlock Origin extension in development mode if the path exists
        if (fs.existsSync(CONFIG.UBLOCK_PATH)) {
            launchOptions.args.push(`--load-extension=${CONFIG.UBLOCK_PATH}`);
            console.log('Using uBlock Origin ad blocker');
        } else {
            console.log('uBlock Origin path not found:', CONFIG.UBLOCK_PATH);
        }
    }
    
    const browser = await puppeteer.launch(launchOptions);
    
    // Initial progress update
    if (progressCallback) {
        progressCallback(0, 'Starting to scrape saved links...', false);
    }

    // Use progressCallback in each scrape task
    let totalProcessed = 0;
    const scrapePromises = links.map(async (link, index) => {
        if (progressCallback) {
            progressCallback(totalProcessed, `Processing saved link ${index + 1} of ${links.length}`, false);
        }
        
        const page = await browser.newPage();
        try {
            // Pass the skipSave parameter to scrapeVideos
            const result = await scrapeVideos(link, page, username, null, { skipSave });  
            totalProcessed++;
            
            if (progressCallback) {
                progressCallback(totalProcessed, `Processed ${totalProcessed} of ${links.length} saved links`, false);
            }
        } catch (error) {
            console.error(`Error scraping link ${link}:`, error);
            totalProcessed++;  // Still count it as processed even if it failed
        } finally {
            await page.close();
        }
    });

    await Promise.all(scrapePromises);

    if (tabMonitorInterval) {
        clearInterval(tabMonitorInterval);
    }
    
    await browser.close();
    
    // Final progress update
    if (progressCallback) {
        progressCallback(totalProcessed, `Completed processing all ${links.length} saved links`, true);
    }

    return links; // Return the list of post links
};

const collectPixivLinks = async (page, postLinksQueue, providedLink, username, progressCallback, skipSave = false) => {
    let feedPageUrl = providedLink || CONFIG.FEED_URL;
    let pageCount = 0;
    let existingLinks = [];
    let totalAdded = 0;

    if (!feedPageUrl.includes("bookmark_new_illust_r18") && !feedPageUrl.includes("illustrations") || feedPageUrl.includes("artworks")) {
        clearPixivLinks(); // Clear pixivLinks at the beginning
    }

    if (fs.existsSync(PIXIV_LINKS_PATH)) {
        const data = fs.readFileSync(PIXIV_LINKS_PATH, 'utf-8');
        existingLinks = JSON.parse(data);
    }

    // Load existing links from links.json to avoid duplicates - Use our enhanced function
    const { linkSet: existingLinkSet } = skipSave ? { linkSet: new Set() } : readExistingLinks(username, 0); // Default to SFW for Pixiv
    console.log(`Loaded ${existingLinkSet.size} existing links for duplicate checking`);

    // Setup tab cleanup interval
    let tabCleanupInterval;
    
    try {
        const browser = page.browser();
        
        // // Set up tab monitor interval with debouncing
        // tabCleanupInterval = setInterval(() => {
        //     debouncedMonitorAndCloseAdTabs(browser, page);
        // }, 3000);

        while (pageCount < CONFIG.PAGE_TARGET) {
            await page.goto(feedPageUrl, { waitUntil: 'networkidle2' });
            
            // Progress update for each page
            if (progressCallback) {
                progressCallback(totalAdded, `Scraping Pixiv page ${pageCount + 1}...`, false);
            }
            
            // Scroll to ensure all content is loaded
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(resolve => setTimeout(resolve, 1000)); //Wait for 1 second
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(resolve => setTimeout(resolve, 1000)); //Wait for 1 second
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(resolve => setTimeout(resolve, 3000)); //Wait for 3 seconds

            // Use the pixiv-specific link selector
            const pixivLinkSelector = WEBSITE_SELECTORS['pixiv.net'].links;
            
            const postLinks = await page.evaluate((selector) => {
                const links = Array.from(document.querySelectorAll(selector));
                return links.map(link => link.href);
            }, pixivLinkSelector);

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

            // PARALLEL PROCESSING - Process links in batches with improved resource management
            const batchSize = CONFIG.RATE_LIMIT.maxConcurrent;
            while (postLinksQueue.length > 0) {
                // Update progress with batch information
                if (progressCallback) {
                    progressCallback(totalAdded, `Processing Pixiv batch: ${Math.min(batchSize, postLinksQueue.length)} items, ${totalAdded} found so far`, false);
                }
                
                // Reduce batch size if we're running low on links to avoid wasting resources
                const currentBatchSize = Math.min(batchSize, postLinksQueue.length);
                const batch = postLinksQueue.splice(0, currentBatchSize);
                
                // Process the batch in parallel
                const results = await Promise.allSettled(
                    batch.map(link => {
                        // Check if link already exists for efficiency
                        if (pixivExistingSet.has(link) || existingLinkSet.has(link)) {
                            return Promise.resolve({ status: 'fulfilled', value: 0 });
                        }
                        
                        return processPixivLink(
                            page.browser(), 
                            link, 
                            feedPageUrl, 
                            skipSave ? null : username, 
                            null, // Don't pass progress callback here
                            skipSave, // Pass skipSave flag
                            0 // Default to SFW for Pixiv
                        );
                    })
                );
                
                // Collect newly added media items
                const newMediaItems = [];
                let batchAdded = 0;
                
                // Process results
                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value && result.value.mediaLink) {
                        existingLinkSet.add(result.value.mediaLink.postLink);
                        pixivExistingSet.add(result.value.mediaLink.postLink);
                        existingLinks.push(result.value.mediaLink);
                        newMediaItems.push(result.value.mediaLink);
                        batchAdded += result.value.linksAdded;
                    }
                }
                
                totalAdded += batchAdded;
                
                // Call progress callback with batch items and total
                if (progressCallback && newMediaItems.length > 0) {
                    progressCallback(totalAdded, `Processed Pixiv batch: found ${totalAdded} items total`, false, newMediaItems);
                }
                
                // RESOURCE MANAGEMENT - Dynamic rate limiting based on success rate
                const successCount = results.filter(r => r.status === 'fulfilled' && r.value && r.value.linksAdded > 0).length;
                const successRate = successCount / batch.length;
                
                // If success rate is low, wait longer before next batch
                const waitTime = successRate < 0.5 ? 
                    CONFIG.RATE_LIMIT.minTime * 2 : 
                    CONFIG.RATE_LIMIT.minTime;
                    
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            try {
                if (feedPageUrl.includes('bookmark_new_illust')) { 
                    const nextPageUrl = `https://www.pixiv.net/bookmark_new_illust_r18.php?p=${pageCount + 2}`;
                    await page.goto(nextPageUrl, { waitUntil: 'networkidle2' });
                    feedPageUrl = nextPageUrl;
                    pageCount++;
                } else {
                    const nextPageSelector = await findNextPageSelector(page, pageCount, feedPageUrl);
                    if (nextPageSelector) {
                        await page.waitForSelector(nextPageSelector, { timeout: 2000 });
                        await page.click(nextPageSelector);
                        feedPageUrl = page.url();
                        pageCount++;
                    } else {
                        console.log('No next page button found, moving to the next saved link.');
                        break;
                    }
                }
            }
            catch (error) {
                console.log('Error navigating to next page:', error.message);
                console.log('Pixiv link completed, moving to the next saved link.');
                break;
            }

            console.log(`New links added: ${uniqueNewPostLinks.length}`);
            console.log(`Total links count: ${totalAdded}`);
        }
    } finally {
        // Clear interval when done
        if (tabCleanupInterval) {
            clearInterval(tabCleanupInterval);
        }
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

// Helper function to get domain name from URL using WEBSITE_SELECTORS
const getDomainFromUrl = (url) => {
  if (!url) return 'unknown';
  
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // Handle special case for Pixiv
    if (hostname.includes('phixiv.net')) {
      return 'pixiv.net';
    }
    
    // Find matching domain in WEBSITE_SELECTORS
    for (const siteDomain in WEBSITE_SELECTORS) {
      if (siteDomain !== 'default' && hostname.includes(siteDomain)) {
        return siteDomain;
      }
    }
    
    // If no match in WEBSITE_SELECTORS, extract domain conventionally
    const domainParts = hostname.split('.');
    if (domainParts.length >= 2) {
      if (domainParts[0] === 'www') {
        return domainParts.slice(1).join('.');
      }
      return domainParts.slice(Math.max(0, domainParts.length - 2)).join('.');
    }
    
    return hostname;
  } catch (e) {
    return 'unknown';
  }
};

// Save tags organized by domain and category
const saveTagsByDomain = (tags, domain, username) => {
    if (!tags || !username) {
        return; // No tags to save or no username
    }

    // Check if tags object has at least one tag across all categories
    const hasTags = Object.values(tags).some(categoryTags => 
        Array.isArray(categoryTags) && categoryTags.length > 0
    );
    
    if (!hasTags) return; // No tags to save

    // Make path more explicit
    const userDir = path.resolve(__dirname, '../../data/users', username);
    
    // Ensure directory exists
    try {
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
    } catch (err) {
        console.error(`Failed to create directory ${userDir}:`, err);
        return;
    }
    
    const filePath = path.join(userDir, 'tags.json');
    
    let tagsByDomain = [];
    
    // Read existing tags.json if it exists
    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            tagsByDomain = JSON.parse(data);
        } catch (error) {
            console.error(`Error reading tags.json:`, error);
            tagsByDomain = [];
        }
    }
    
    // Find the domain section or create a new one
    let domainSection = tagsByDomain.find(section => Object.keys(section)[0] === domain);
    
    if (!domainSection) {
        // Domain doesn't exist yet, create a new section with categorized tags
        domainSection = { 
            [domain]: {
                author: [],
                copyright: [],
                character: [],
                general: []
            } 
        };
        tagsByDomain.push(domainSection);
    } else if (!domainSection[domain].author) {
        // Convert old format to new format if needed
        const oldTags = Array.isArray(domainSection[domain]) ? domainSection[domain] : [];
        domainSection[domain] = {
            author: [],
            copyright: [],
            character: [],
            general: oldTags // Put old tags in general category
        };
    }
    
    // Add new unique tags to each category
    const categories = ['author', 'copyright', 'character', 'general'];
    categories.forEach(category => {
        if (tags[category] && Array.isArray(tags[category]) && tags[category].length > 0) {
            // Ensure this category exists in the domain section
            if (!domainSection[domain][category]) {
                domainSection[domain][category] = [];
            }
            
            // Add new unique tags
            tags[category].forEach(tag => {
                if (!domainSection[domain][category].includes(tag)) {
                    domainSection[domain][category].push(tag);
                }
            });
            
            // Sort category tags alphabetically
            domainSection[domain][category].sort();
        }
    });
    
    // Save updated tags
    try {
        fs.writeFileSync(filePath, JSON.stringify(tagsByDomain, null, 2));
        const totalTags = Object.values(tags).flat().length;
        console.log(`Saved ${totalTags} categorized tags for domain ${domain}`);
    } catch (error) {
        console.error(`Error saving tags to ${filePath}:`, error);
    }
};

// Export the required functions and configurations
module.exports = {
  scrapeVideos,
  loginToPixiv,
  CONFIG
};

