const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ========== CONFIGURATION ==========
const CONFIG = {
  EDGE_PATH: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '../../data'),
  COOKIES_PATH: process.env.COOKIES_PATH || path.join(__dirname, './cookies.json'),
  FEED_URL: process.env.FEED_URL || 'https://www.pixiv.net/discovery?mode=r18',
  PIXIV_LOGIN_URL: process.env.PIXIV_LOGIN_URL || 'https://accounts.pixiv.net/login?return_to=https%3A%2F%2Fwww.pixiv.net%2Fen%2F&lang=en&source=pc&view_type=page',
  PIXIV_USERNAME: process.env.PIXIV_USERNAME,
  PIXIV_PASSWORD: process.env.PIXIV_PASSWORD,
  PAGE_TARGET: parseInt(process.env.PAGE_TARGET || '5'),
  RATE_LIMIT: {
    minTime: parseInt(process.env.RATE_LIMIT_MIN_TIME || '500'),
    maxConcurrent: parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT || '2'),
    retries: parseInt(process.env.RATE_LIMIT_RETRIES || '1')
  },
  BROWSER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor'
  ]
};

// ========== SELECTORS CONFIG ==========
const WEBSITE_SELECTORS = {
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
    media: ['body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-post-page > app-page > app-post-page-content > app-post-image > div > img'],
    tag: [],
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
    ],
    tag: [],
    links: 'a[href*="/video"]'
  },
  'kemono.su': {
    nextPage: [
      '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div > section > div.sc-s8zj3z-4.gjeneI > div.sc-ikag3o-1.mFrzi > nav > a:nth-child(9)',
      '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div.sc-12rgki1-0.jMEnyM > nav > a:nth-child(9)'
    ],
    media: ['img[src*=".webp"]'],
    tag: [],
    links: 'a[href*="/post"]:not([href*="/posts"])'
  },
  'r-34.xyz': {
    nextPage: ['#custom_list_videos_common_videos_pagination > div.item.pager.next > a'],
    media: [
      'body > div > main > div.appbar-content > div:nth-child(2) > div.con > img',
      'body > div > main > div.appbar-content > div:nth-child(2) > div.con > video'
    ],
    tag: [
      'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div:nth-child(1) > a.b-link > button > h4',
      'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div:nth-child(2) > a.b-link > button > h4',
      'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div:nth-child(3) > a.b-link > button > h4',
      'body > div > main > div.appbar-content > div:nth-child(2) > div.content.pr-8.pl-8 > div:nth-child(3) > div.flow-root > div.flow-root > div > a.b-link > button > h4',
    ],
    links: 'a[href*="/post/"]:not([href*="/post/random"])'
  },
  'donmai': {
    nextPage: ['#posts > div > div.paginator.numbered-paginator.mt-8.mb-4.space-x-2.flex.justify-center.items-center > a.paginator-next'],
    media: ['#image', '#content > section.image-container.note-container.blacklisted > picture'],
    tag: [
      '#tag-list > div > ul.artist-tag-list > li > span:nth-child(2) > a',
      'body > div#page > div#c-posts > div > div > aside > section#tag-list > div > ul.copyright-tag-list > li > span:nth-child(2) > a',
      'body > div#page > div#c-posts > div > div > aside > section#tag-list > div > ul.character-tag-list > li > span:nth-child(2) > a',
      'body > div#page > div#c-posts > div > div > aside > section#tag-list > div > ul.general-tag-list > li > span:nth-child(2) > a',
    ],
    links: 'a[href*="/posts/"]'
  },
  'kusowanka': {
    nextPage: ['body > div.main_content > div.overview_thumbs > ul > li:last-child > a'],
    media: [
      'body > div.main_content.post_section > div.main_post.related_post > div.outer_post > div.post_video > div > video',
      'body > div.main_content.post_section > div.main_post.related_post > div.outer_post > div.post_image > div > img'
    ],
    tag: [
      'body > div.main_content > div.sidebar > ul.artists_list > li > a',
      'body > div.main_content > div.sidebar > ul.parodies_list > li > a',
      'body > div.main_content > div.sidebar > ul.characters_list > li > a',
      'body > div.main_content > div.sidebar > ul.tags_list > li > a'
    ],
    links: 'a[href*="/post/"]:not([href*="/post/random"])'
  },
  'app.rule34.': {
    nextPage: ['#__next > div.commons_row__cU0o8.undefined > div.withoutMarginMobile > div > div > div > div > div:nth-child(6) > div > div > div:nth-child(5) > a'],
    media: [
      '#modal > div > div > div.commons_column__PLxkh.undefined > div > div > div > div:nth-child(1) > img',
      '#modal > div > div > div.commons_column__PLxkh.undefined > div > div > div > div:nth-child(1) > video'
    ],
    tag: [
      '#modal > div > div > div.tags_hiddenScrollBar__7vf_g.commons_mobileInvisible__yfEDn > div.desktopOnly > div.jsx-502815153.mobileInvisible > div > div > div > a > span > span'
    ],
    links: 'a[href*="?id="]'
  },
  'safebooru': {
    nextPage: ['a[alt="next"]'],
    media: [
      'img#image',
      'img[id="image"]', // Alternative selector
      '#image' // Even simpler fallback
    ],
    'tag': [
      'li.tag-type-artist a:nth-child(2)',
      'li.tag-type-copyright a:nth-child(2)',
      'li.tag-type-character a:nth-child(2)',
      'li.tag-type-general a:nth-child(2)'
    ],
    links: 'a[href*="/index.php?page=post&s=view&id"]'
  },
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
      'img'
    ],
    tag: [],
    links: 'a[href*="/post/"], a[href*="/index.php?page=post&s=view&id"], a[href*="/video"], a[href*="/artworks"], a[href*="/posts/"]:not([href*="/post/random"])'
  }
};

// ========== UTILITY FUNCTIONS ==========
const debounce = (func, delay) => {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};

const getSiteSelectors = (url) => {
  if (!url) return WEBSITE_SELECTORS.default;
  const domain = getDomainFromUrl(url);
  return WEBSITE_SELECTORS[domain] || WEBSITE_SELECTORS.default;
};

const getDomainFromUrl = (url) => {
  try {
    return new URL(url).hostname;
  } catch (error) {
    console.error('Error extracting domain:', error.message);
    return 'unknown';
  }
};

// ========== BROWSER & PAGE MANAGEMENT ==========
const monitorAndCloseAdTabs = async (browser, ignoredPage = null) => {
  try {
    const contexts = browser.contexts();
    for (const context of contexts) {
      for (const page of context.pages()) {
        if (!page || page.isClosed() || (ignoredPage && page === ignoredPage)) continue;
        
        try {
          const url = page.url();
          if (url && url !== 'about:blank' && !isAllowedUrl(url) && !page.isClosed()) {
            console.log(`Closing ad tab: ${url}`);
            await page.close().catch(e => console.error('Error closing tab:', e.message));
          }
        } catch (error) {
          console.debug('Skipping tab - unable to get URL');
        }
      }
    }
  } catch (error) {
    console.error('Tab monitor error:', error.message);
  }
};

const createBrowserAndPage = async () => {
  const launchOptions = {
    headless: process.env.NODE_ENV === 'production',
    args: [
      ...CONFIG.BROWSER_ARGS,
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-extensions-except',
      '--disable-plugins-discovery',
      '--no-first-run',
      '--disable-default-apps'
    ],
    devtools: process.env.NODE_ENV !== 'production',
    ignoreDefaultArgs: ['--enable-automation']
  };

  if (process.env.NODE_ENV !== 'production') {
    launchOptions.headless = false;
    launchOptions.executablePath = CONFIG.EDGE_PATH;
  }

  console.log('Launching browser...');
  const browser = await chromium.launch(launchOptions);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: ['geolocation'],
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    },
    javaScriptEnabled: true,
    bypassCSP: true
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    
    if (window.navigator.permissions?.query) {
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => 
        parameters.name === 'notifications' 
          ? Promise.resolve({ state: 'default' })
          : originalQuery(parameters);
    }
  });

  return { browser, context, page };
};

// ========== COOKIE MANAGEMENT ==========
const saveCookies = async (page) => {
  try {
    const cookies = await page.cookies();
    fs.writeFile(CONFIG.COOKIES_PATH, JSON.stringify(cookies), 'utf8', (err) => {
      if (err) console.error('Cookie save error:', err);
    });
    console.log('Cookies saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving cookies:', error);
    return false;
  }
};

const loadCookies = async (page) => {
  try {
    if (!fs.existsSync(CONFIG.COOKIES_PATH)) return false;
    
    const cookies = JSON.parse(fs.readFileSync(CONFIG.COOKIES_PATH, 'utf8'));
    if (cookies.length > 0) {
      for (const cookie of cookies) {
        await page.setCookie(cookie);
      }
      console.log('Cookies loaded successfully');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error loading cookies:', error);
    return false;
  }
};

// ========== AUTHENTICATION ==========
const loginToPixiv = async (page) => {
  await loadCookies(page);
  
  await page.goto(CONFIG.PIXIV_LOGIN_URL, {
    timeout: 180000,
    waitUntil: 'networkidle'
  });

  if (page.url().includes('https://www.pixiv.net/en/')) {
    console.log('Already logged in to Pixiv');
    return;
  }

  console.log('Logging in to Pixiv...');
  await page.waitForSelector('input[type="text"]', { state: 'visible' });
  await page.fill('input[type="text"]', CONFIG.PIXIV_USERNAME);
  
  await page.waitForSelector('input[type="password"]', { state: 'visible' });
  await page.fill('input[type="password"]', CONFIG.PIXIV_PASSWORD);
  
  const loginButton = '#app-mount-point > div > div > div.sc-fvq2qx-4.bntRDI > div.sc-2oz7me-0.iGLGot > form > button.charcoal-button.sc-2o1uwj-10.divuub';
  await page.waitForSelector(loginButton, { state: 'visible' });
  await page.click(loginButton);

  await page.waitForLoadState('networkidle');
  await saveCookies(page);
  console.log('Login completed');
};

// ========== MEDIA EXTRACTION ==========
const createDefaultTags = () => ({
  author: [],
  copyright: [],
  character: [],
  general: []
});

const extractMediaData = async (page, link) => {
  const result = {
    mediaUrls: [],
    tags: createDefaultTags()
  };

  if (link.includes('kemono.su')) {
    return extractKemonoMedia(page, result);
  }

  try {
    const siteSelectors = getSiteSelectors(link);
    const mediaSelectors = siteSelectors.media || WEBSITE_SELECTORS.default.media;

    result.mediaUrls = await page.evaluate((selectors) => {
      const urls = [];
      for (const selector of selectors) {
        try {
          for (const element of document.querySelectorAll(selector)) {
            const src = element.src || element.currentSrc || element.getAttribute('data-src');
            if (src && /\.(mp4|png|jpg|jpeg|gif|webm|webp)$/i.test(src) && !src.includes('/logo.png')) {
              urls.push(src);
            }
          }
        } catch (e) {}
      }
      return [...new Set(urls)];
    }, mediaSelectors);

    if (result.mediaUrls.length > 0) {
      console.log(`✓ Extracted ${result.mediaUrls.length} media URL(s)`);
    } else {
      console.log(`✗ No media URLs found in selectors`);
    }

    // Extract tags if available
    if (siteSelectors.tag?.length > 0) {
      const tagCategories = ['author', 'copyright', 'character', 'general'];
      const tagPromises = siteSelectors.tag.map((selector, i) => 
        extractTagsForCategory(page, selector, tagCategories[i], result)
      );
      await Promise.all(tagPromises);
    }

    const totalTags = Object.values(result.tags).flat().length;
    if (totalTags > 0) console.log(`Extracted ${totalTags} tags`);
  } catch (error) {
    console.error('Error extracting media:', error.message);
  }

  return result;
};

const extractKemonoMedia = async (page, result) => {
  try {
    await page.waitForSelector('body', { timeout: 10000 });
    const pageContent = await page.evaluate(() => document.body.innerText);
    const mediaUrls = pageContent.match(/https:\/\/n\d\.kemono\.su\/data\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32}\.(png|jpg|gif|webm|webp)\?f=\S+/g);
    
    if (mediaUrls) {
      result.mediaUrls = mediaUrls.filter(url => !url.includes('/logo.png'));
    }

    const extractedTags = await page.evaluate(() => 
      Array.from(document.querySelectorAll('.tag')).map(el => el.textContent.trim())
    ).catch(() => []);
    
    if (extractedTags.length > 0) {
      result.tags.general = extractedTags;
      console.log(`Extracted ${extractedTags.length} Kemono tags`);
    }
  } catch (error) {
    console.error('Error extracting Kemono media:', error.message);
  }
  return result;
};

const extractTagsForCategory = async (page, selector, category, result) => {
  try {
    await page.waitForSelector(selector, { timeout: 3000 });
    const tags = await page.evaluate((sel) => 
      Array.from(document.querySelectorAll(sel)).map(el => el.textContent.trim())
    , selector);
    
    if (tags.length > 0) result.tags[category] = tags;
  } catch (error) {
    console.debug(`Tag selector not found for ${category}`);
  }
};

/**
 * Extracts file_url and tags from page content using text search
 * Returns array of objects - each with one file_url in videoLinks and its tags
 */
const extractMediaFromJsonResponse = async (page, link) => {
  const mediaObjects = [];

  try {
    const content = await page.content();
    
    // Search for "file_url" text in the content
    const fileUrlMatches = content.match(/"file_url"\s*:\s*"([^"]+)"/g);
    
    if (!fileUrlMatches || fileUrlMatches.length === 0) {
      console.debug('No file_url found in page content');
      return mediaObjects;
    }

    // Extract URLs from matches
    const fileUrls = fileUrlMatches.map(match => {
      const urlMatch = match.match(/"file_url"\s*:\s*"([^"]+)"/);
      console.log('Extracted file_url:', urlMatch ? urlMatch[1] : 'null');
      return urlMatch ? urlMatch[1] : null;
    }).filter(url => url !== null);

    // Remove duplicates
    const uniqueUrls = [...new Set(fileUrls)];

    // Search for all tags arrays
    const tagsMatches = content.match(/"tags"\s*:\s*\[([^\]]+)\]/g);
    const tagsArrays = [];
    
    if (tagsMatches && tagsMatches.length > 0) {
      tagsMatches.forEach(match => {
        try {
          // Extract the array content between [ and ]
          const arrayContent = match.match(/\[([^\]]+)\]/)[1];
          // Parse individual tags (they're quoted strings)
          const tags = arrayContent.match(/"([^"]+)"/g)?.map(t => t.replace(/"/g, '')) || [];
          if (tags.length > 0) {
            tagsArrays.push(tags);
          }
        } catch (e) {
          // Skip malformed tag arrays
        }
      });
    }

    if (uniqueUrls.length > 0) {
      uniqueUrls.forEach((url, index) => {
        // Pair each URL with corresponding tags, or empty array if not enough tags
        const tags = tagsArrays[index] || [];
        mediaObjects.push({
          postLink: link,
          videoLinks: [url],
          tags: {
            author: [],
            copyright: [],
            character: [],
            general: tags
          }
        });
      });
      
      console.log(`✓ Found ${uniqueUrls.length} file_url(s) and ${tagsArrays.length} tag array(s)`);
    }
  } catch (error) {
    console.debug('Error extracting file_url and tags from page:', error.message);
  }

  return mediaObjects;
};

// ========== LINK PROCESSING ==========
const handleInitialPopups = async (page, link) => {
  const popups = {
    'rule34video': 'body > div > div.popup.popup_access > div > div.bottom > input:nth-child(1)',
    'e621.net': '#guest-warning-accept',
    'erome.com': '#home-box > div.enter'
  };

  for (const [site, selector] of Object.entries(popups)) {
    if (link.includes(site)) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        if (site === 'erome.com') await page.goto(link, { waitUntil: 'domcontentloaded' });
      } catch (error) {
        console.debug(`${site} popup not found`);
      }
    }
  }
};

const processLink = async (page, context, link, existingLinkSet, progressCallback, contentType = 0) => {
  try {
    const targetUrl = link.includes('kemono.su') ? `https://r.jina.ai/${link}` : link;
    
    const newPage = await context.newPage();
    try {
      const response = await newPage.goto(targetUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
      
      if (!response || response.status() === 404) {
        console.error(`Resource not found: ${targetUrl} (404)`);
        return { mediaLinks: [], linksAdded: 0 };
      }

      await handleInitialPopups(newPage, link);

      // Extract using DOM selectors
      const extracted = await extractMediaData(newPage, link);
      
      if (extracted.mediaUrls.length > 0) {
        // Create separate object for each media URL
        const mediaObjects = extracted.mediaUrls.map(url => ({
          postLink: link,
          videoLinks: [url],
          tags: {
            author: [...extracted.tags.author],
            copyright: [...extracted.tags.copyright],
            character: [...extracted.tags.character],
            general: [...extracted.tags.general]
          }
        }));

        mediaObjects.forEach(mediaObj => {
          ensureCategorizedTags(mediaObj, contentType);
        });

        return { mediaLinks: mediaObjects, linksAdded: mediaObjects.length };
      }

      return { mediaLinks: [], linksAdded: 0 };

    } finally {
      await newPage.close().catch(() => {});
    }
    
  } catch (error) {
    console.error(`Failed to process ${link}:`, error.message);
    return { mediaLinks: [], linksAdded: 0 };
  }
};

const processLinkWithRetry = async (page, context, link, existingLinkSet, progressCallback, retriesLeft = 1, contentType = 0) => {
  if (existingLinkSet.has(link)) {
    return { mediaLinks: [], linksAdded: 0 };
  }

  try {
    const result = await processLink(page, context, link, existingLinkSet, progressCallback, contentType);
    
    if (result.linksAdded === 0 && retriesLeft > 0) {
      console.log(`Retrying ${link}... (${retriesLeft} left)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return processLinkWithRetry(page, context, link, existingLinkSet, progressCallback, retriesLeft - 1, contentType);
    }
    
    return result;
  } catch (error) {
    if (retriesLeft > 0) {
      console.log(`Error on ${link}, retrying... (${retriesLeft} left)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return processLinkWithRetry(page, context, link, existingLinkSet, progressCallback, retriesLeft - 1, contentType);
    }
    
    console.error(`Failed to process ${link} after retries`);
    return { mediaLinks: [], linksAdded: 0 };
  }
};


// ========== MAIN SCRAPING LOGIC ==========
const findNextPageSelector = async (page, pageCount, feedPageUrl) => {
  if (feedPageUrl.includes('gelbooru')) {
    const selector = `#paginator > a:nth-child(${pageCount + 2})`;
    return await page.$(selector) ? selector : null;
  }

  const siteSelectors = getSiteSelectors(feedPageUrl).nextPage;
  
  for (const selector of siteSelectors) {
    if (await page.$(selector)) {
      return selector;
    }
    else {
      console.debug(`Next page selector not found: ${selector}`);
    }
  }
  return null;
};

const collectAndScrapeLinks = async (page, postLinksQueue, existingLinks, providedLink, progressCallback, existingLinkSet, contentType = 0) => {
  let totalAdded = 0;
  let pageCount = 0;
  let feedPageUrl = providedLink || CONFIG.FEED_URL;

  existingLinkSet = existingLinkSet || new Set();
  const context = page.context();
  const debouncedMonitor = debounce((browser) => monitorAndCloseAdTabs(browser, page), 2000);

  try {
    await page.goto(feedPageUrl, { waitUntil: 'networkidle' });

    while (pageCount < CONFIG.PAGE_TARGET) {
      progressCallback?.({
        progress: Math.round(((pageCount) / CONFIG.PAGE_TARGET) * 100),
        message: `Scraping page ${pageCount + 1}...`,
        isComplete: false,
        newItems: []
      });

      const siteSelectors = getSiteSelectors(providedLink);
      await page.waitForSelector(siteSelectors.links, { timeout: 5000 }).catch(() => {});

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 500));

      const linkSelector = siteSelectors.links || WEBSITE_SELECTORS.default.links;
      
      const postLinks = await page.evaluate((selector) => 
        Array.from(document.querySelectorAll(selector)).map(link => link.href)
      , linkSelector);

      const newPostLinks = postLinks.filter(link => !existingLinkSet.has(link));
      console.log(`Found ${postLinks.length} links, ${newPostLinks.length} new`);
      
      postLinksQueue.push(...newPostLinks);

      if (newPostLinks.length === 0) {
        console.log('No new links found');
        break;
      }

      // Process batch - extract JSON from each link
      const batchSize = CONFIG.RATE_LIMIT.maxConcurrent;
      while (postLinksQueue.length > 0) {
        const currentBatchSize = Math.min(batchSize, postLinksQueue.length);
        const batch = postLinksQueue.splice(0, currentBatchSize);

        progressCallback?.({
          progress: Math.round(((pageCount) / CONFIG.PAGE_TARGET) * 100),
          message: `Processing ${currentBatchSize} items...`,
          isComplete: false,
          newItems: []
        });

        const results = await Promise.allSettled(
          batch.map(link => {
            if (existingLinkSet.has(link)) {
              return Promise.resolve({ mediaLinks: [], linksAdded: 0 });
            }
            return processLinkWithRetry(page, context, link, existingLinkSet, progressCallback, CONFIG.RATE_LIMIT.retries, contentType);
          })
        );

        const newMediaItems = [];
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value.mediaLinks && result.value.mediaLinks.length > 0) {
            result.value.mediaLinks.forEach(mediaLink => {
              existingLinkSet.add(mediaLink.postLink);
              existingLinks.push(mediaLink);
              totalAdded += 1;
              newMediaItems.push(mediaLink);
            });
          }
        });

        if (newMediaItems.length > 0) {
          progressCallback?.({
            progress: Math.round(((pageCount + 1) / CONFIG.PAGE_TARGET) * 100),
            message: `Found ${totalAdded} items total`,
            isComplete: false,
            newItems: newMediaItems
          });
        }

        const successRate = newMediaItems.length / batch.length;
        const waitTime = successRate < 0.5 ? CONFIG.RATE_LIMIT.minTime * 2 : CONFIG.RATE_LIMIT.minTime;
        await new Promise(resolve => setTimeout(resolve, waitTime));

        debouncedMonitor(context.browser());
      }

      console.log(`Completed page ${pageCount + 1}, total items added: ${totalAdded}`);

      if (feedPageUrl.includes('app.rule34')) {
        const match = feedPageUrl.match(/\/(\d+)\//);
        const currentPage = match ? parseInt(match[1]) : 0;
        const nextPage = currentPage + 1;
        
        const nextPageUrl = feedPageUrl.replace(/\/\d+\//, `/${nextPage}/`);
        
        await page.goto(nextPageUrl, { waitUntil: 'networkidle' });
        feedPageUrl = nextPageUrl;
        pageCount++;
        
        console.log(`Navigated to next page: ${feedPageUrl}`);
      }
      else {
        const nextPageSelector = await findNextPageSelector(page, pageCount, feedPageUrl);
        if (!nextPageSelector) break;

        await page.waitForSelector(nextPageSelector, { timeout: 2000 });
        await page.click(nextPageSelector);
        
        if (feedPageUrl !== page.url()) {
            feedPageUrl = page.url();
            await page.reload({ waitUntil: 'networkidle' });
            console.log(`Navigated to next page: ${feedPageUrl}`);
            pageCount++;
        }
      }
    }
  } finally {
    progressCallback?.({
      progress: 100,
      message: `Completed: ${totalAdded} items found`,
      isComplete: true,
      newItems: existingLinks,
      total: totalAdded
    });
  }

  return totalAdded;
};

const handleProvidedLink = async (page, providedLink, postLinksQueue, existingLinks, progressCallback, options = {}) => {
  console.log('Starting scrape for:', providedLink);
  progressCallback?.({
    progress: 0,
    message: 'Starting...',
    isComplete: false,
    newItems: []
  });

  try {
    await page.goto(providedLink, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (error) {
    console.error(`Failed to navigate: ${error.message}`);
    throw error;
  }

  await handleInitialPopups(page, providedLink);

  // ✅ JSON EXTRACTION FLOW for app.rule34
  if (providedLink.includes('app.rule34')) {
    return await jsonExtractionFlow(page, providedLink, existingLinks, progressCallback, options);
  }
  else{
    // ✅ DOM SELECTOR FLOW for other sites
    const existingLinkSet = new Set();
    return collectAndScrapeLinks(page, postLinksQueue, existingLinks, providedLink, progressCallback, existingLinkSet, options.contentType || 0);
  }
};

/**
 * JSON Extraction Flow for app.rule34
 * Directly extracts media from __NEXT_DATA__ on providedLink
 */
const jsonExtractionFlow = async (page, providedLink, existingLinks, progressCallback, options = {}) => {
  let totalAdded = 0;
  let pageCount = 0;
  const PAGE_TARGET = CONFIG.PAGE_TARGET;
  let currentUrl = providedLink;

  try {
    while (pageCount < PAGE_TARGET) {
      progressCallback?.({
        progress: Math.round((pageCount / CONFIG.PAGE_TARGET) * 100),
        message: `Scraping JSON page ${pageCount + 1}/${PAGE_TARGET}...`,
        isComplete: false,
        newItems: []
      });

      // Extract JSON from current page
      const mediaObjects = await extractMediaFromJsonResponse(page, currentUrl);

      if (mediaObjects.length > 0) {
        mediaObjects.forEach(mediaObj => {
          ensureCategorizedTags(mediaObj, options.contentType || 0);
          existingLinks.push(mediaObj);
          totalAdded += 1;
        });
        
        // Send progress with new items
        progressCallback?.({
          progress: Math.round(((pageCount + 1) / PAGE_TARGET) * 100),
          message: `Found ${totalAdded} items total`,
          isComplete: false,
          newItems: mediaObjects
        });
        
        console.log(`Page ${pageCount + 1}: Extracted ${mediaObjects.length} items`);
      } else {
        console.log('No more items found');
        break;
      }

      // Navigate to next page
      const nextPageUrl = getNextPageUrl(currentUrl, pageCount);
      if (!nextPageUrl || nextPageUrl === currentUrl) {
        console.log('Reached last page');
        break;
      }

      await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      currentUrl = nextPageUrl;
      pageCount++;
    }
  } catch (error) {
    console.error('JSON extraction error:', error);
    progressCallback?.({
      progress: 100,
      message: `Error: ${error.message}`,
      isComplete: true,
      newItems: [],
      error: error.message
    });
    throw error;
  }

  // ✅ CRITICAL: Send final completion callback
  progressCallback?.({
    progress: 100,
    message: `Completed: ${totalAdded} items found`,
    isComplete: true,
    newItems: existingLinks,
    total: totalAdded
  });

  return totalAdded;
};

/**
 * Generate next page URL for app.rule34
 */
const getNextPageUrl = (url, pageCount) => {
  const match = url.match(/\/(\d+)\//);
  if (!match) return null;
  
  const currentPage = parseInt(match[1]);
  const nextPage = currentPage + 1;
  return url.replace(/\/\d+\//, `/${nextPage}/`);
};


// ========== PUBLIC API ==========
const scrapeVideos = async (providedLink = null, progressCallback = null, options = {}) => {
  let browser, context, page, tabMonitorInterval;

  try {
    const { browser: b, context: c, page: p } = await createBrowserAndPage();
    browser = b;
    context = c;
    page = p;

    const debouncedMonitor = debounce((browser) => monitorAndCloseAdTabs(browser, page), 2000);
    tabMonitorInterval = setInterval(() => debouncedMonitor(browser), 3000);

    let totalLinksAdded = 0;
    const postLinksQueue = [];
    const existingLinks = [];

    if (!providedLink || providedLink.includes('pixiv')) {
      await loginToPixiv(page);
      totalLinksAdded = 0; // Pixiv implementation pending
    } else {
      totalLinksAdded = await handleProvidedLink(page, providedLink, postLinksQueue, existingLinks, progressCallback, options);
    }

    progressCallback?.({
      progress: 100,
      message: `Found ${totalLinksAdded} items`,
      isComplete: true,
      newItems: existingLinks,
      total: totalLinksAdded
    });
    return { postLinksQueue, linksAdded: totalLinksAdded, mediaItems: existingLinks };
  } catch (error) {
    console.error('Scraping error:', error);
    throw error;
  } finally {
    if (tabMonitorInterval) clearInterval(tabMonitorInterval);
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

const ensureCategorizedTags = (mediaLink, contentType = 0) => {
  if (!mediaLink.tags || typeof mediaLink.tags !== 'object' || Array.isArray(mediaLink.tags)) {
    mediaLink.tags = createDefaultTags();
  }

  const expectedCategories = ['author', 'copyright', 'character', 'general'];
  expectedCategories.forEach(category => {
    if (!mediaLink.tags[category]) {
      mediaLink.tags[category] = [];
    }
  });

  if (contentType === 1 && !Object.values(mediaLink.tags).some(tags => 
    Array.isArray(tags) && tags.some(tag => tag.toLowerCase() === 'nsfw')
  )) {
    mediaLink.tags.general.push('nsfw');
  }

  return mediaLink;
};

module.exports = {
  scrapeVideos,
  loginToPixiv,
  CONFIG
};