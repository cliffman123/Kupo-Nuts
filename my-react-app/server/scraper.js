const puppeteer = require('puppeteer-extra'); // Use puppeteer-extra package
const fs = require('fs');
const path = require('path');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { exec } = require('child_process');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const EDGE_PATH = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const LINKS_PATH = process.env.LINKS_PATH || 'C:\\Users\\cliff\\.vscode\\Website Project\\my-react-app\\build\\links.json';
const LOGIN_URL = process.env.LOGIN_URL || 'https://rule34.xyz/auth/login';
const FEED_URL = process.env.FEED_URL || 'https://www.pixiv.net/discovery?mode=r18';
const COOKIES_PATH = path.resolve(__dirname, 'cookies.json');
const PIXIV_LOGIN_URL = process.env.PIXIV_LOGIN_URL || 'https://accounts.pixiv.net/login?return_to=https%3A%2F%2Fwww.pixiv.net%2Fen%2F&lang=en&source=pc&view_type=page';
const USER_DATA_DIR = 'C:/Users/cliff/AppData/Local/Microsoft/Edge/User Data'; // Update this path to your Edge user data directory
const NEXT_PAGE_SELECTORS = [
    'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-feed-page > div > div > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target',
    'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-home-page > div > div.right-panel > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target', // Selector for the "Next Page For Post" button
    'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-view-page > div > div > app-post-grid > app-loadable-items > div.relative > app-provider-paginator > div:nth-child(4) > div > button:nth-child(3) > span.mat-mdc-button-touch-target', // Selector for the "Next Page For View" button
    '#custom_list_videos_common_videos_pagination > div.item.pager.next > a',
    '#custom_list_videos_common_videos_pagination > div.item.pager.next > a > svg > use',
    '#paginator > a:nth-child(10)',
    'body > div.main_content > div.overview_thumbs > ul > li:nth-child(4) > a',
    '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div > section > div.sc-s8zj3z-4.gjeneI > div.sc-ikag3o-1.mFrzi > nav > a:nth-child(9)',
    '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div > section > div.sc-s8zj3z-4.gjeneI > div.sc-ikag3o-1.mFrzi > nav > a:nth-child(9)',
    '#root > div.charcoal-token > div > div:nth-child(4) > div > div > div.sc-12rgki1-0.jMEnyM > nav > a:nth-child(9)'
];
const PAGE_TARGET = process.env.PAGE_TARGET || 10;
const uBlockPath = path.resolve('C:/Users/cliff/AppData/Local/Microsoft/Edge/User Data/Default/Extensions/odfafepnkmbhccpbejgmiehpchacaeak/1.62.0_0');
const PIXIV_LINKS_PATH = path.resolve(__dirname, '../build/pixivLinks.json');

const PIXIV_USERNAME = process.env.PIXIV_USERNAME;
const PIXIV_PASSWORD = process.env.PIXIV_PASSWORD;

const loadCookies = async (page) => {
    if (fs.existsSync(COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
        await page.setCookie(...cookies);
        console.log('Cookies loaded from', COOKIES_PATH);
    }
};

const scrapeVideos = async (providedLink = null, page = null, username = null, progressCallback = null) => {
    let browser;
    let totalLinksAdded = 0;  // Add this line to track total links
    
    try {
        const postLinksQueue = [];
        
        if (!page) {
            // Define launch options for Puppeteer 19.7.2
            const launchOptions = {
                headless: false, // Use boolean instead of 'new' for compatibility
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    `--disable-extensions-except=${uBlockPath}`,
                    `--load-extension=${uBlockPath}`
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
            };
            
            // Only add specific options in development environment
            if (process.env.NODE_ENV !== 'production') {
                launchOptions.executablePath = EDGE_PATH;
            }
            
            browser = await puppeteer.launch(launchOptions);
            const context = browser.defaultBrowserContext();
            page = await context.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
            await loadCookies(page); // Load cookies before doing anything
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

const readExistingLinks = () => {
    if (fs.existsSync(LINKS_PATH)) {
        const data = fs.readFileSync(LINKS_PATH, 'utf-8');
        return JSON.parse(data);
    }
    return [];
};

const loginToPixiv = async (page, providedLink) => {
    await page.goto(PIXIV_LOGIN_URL, {timeout: 180000 }); // Set timeout to 3 minutes (180000 ms)

    if (page.url().includes('https://www.pixiv.net/en/')) {
        console.log('Already logged in to Pixiv.');
        return;
    }

    await page.type('input[type="text"]', "cliffman123@gmail.com");
    await new Promise(resolve => setTimeout(resolve, 1000)); //Wait for 1 second
    await page.type('input[type="password"]', "$piralKnights7");
    await new Promise(resolve => setTimeout(resolve, 1000)); //Wait for 1 second
    await page.click('#app-mount-point > div > div > div.sc-fvq2qx-4.csnYja > div.sc-2oz7me-0.bOKfsa > form > button.charcoal-button.sc-2o1uwj-10.ldVSLT');
    console.log('Logging in to Pixiv...');

    while (true) {
        const currentUrl = page.url();
        if (currentUrl.includes('https://www.pixiv.net/en/')) {
            console.log('Successfully navigating to the Pixiv discovery page.');
            const cookies = await page.cookies();
            fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
            console.log('Cookies saved to', COOKIES_PATH);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
}

const navigateToFeed = async (page, providedLink) => {
    if (providedLink){
        await page.goto(providedLink, { waitUntil: 'networkidle2' });
    }
    else {
        await page.goto(FEED_URL, { waitUntil: 'networkidle2' });
    }
    console.log('Successfully navigated to the Pixiv page.');
};

const handleProvidedLink = async (page, providedLink, postLinksQueue, existingLinks, username, progressCallback) => {
    console.log('Provided link:', providedLink);
    let totalAdded = 0;  // Add counter

    await page.goto(providedLink, { waitUntil: 'networkidle2' });

    if (providedLink.includes('rule34video')) {
        const buttonSelector = 'body > div > div.popup.popup_access > div > div.bottom > input:nth-child(1)';
        await page.waitForSelector(buttonSelector, { timeout: 5000 });
        await page.click(buttonSelector);
    }

    totalAdded = await collectAndScrapeLinks(page, postLinksQueue, existingLinks, providedLink, username, progressCallback);
    return totalAdded;  // Return the total
};

const collectAndScrapeLinks = async (page, postLinksQueue, existingLinks, providedLink = null, username, progressCallback) => {
    let totalAdded = 0;  // Add counter
    let pageCount = 0;
    let feedPageUrl = providedLink || FEED_URL;
    const mediaSelectors = [
        'body > app-root > app-root-layout-page > div > mat-sidenav-container > mat-sidenav-content > app-post-page > app-page > app-post-page-content > app-post-image > div > img',
        'video source[type="video/mp4"]',
        'img#image',
        'main video#gelcomVideoPlayer source',
        'picture img',
        'img[src*=".webp"]',
        'img',
        'body > div.main_content.post_section > div.main_post.related_post > div.outer_post > div.post_image > div > img'
    ];

    while (pageCount < PAGE_TARGET) {
        await page.goto(feedPageUrl, { waitUntil: 'networkidle2' });
        await randomWait();
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await randomWait();

        const postLinks = await page.evaluate((providedLink) => {
            const links = Array.from(document.querySelectorAll('a'));
            const kemonoRegex = /kemono\.su/;
            if (providedLink && kemonoRegex.test(providedLink)) {
                return links.map(link => link.href).filter(href => href.includes('/post') && !href.includes('/posts'));
            } else {
                return links.map(link => link.href).filter(href => href.includes('/post') || href.includes('/index.php?page=post&s=view&id') || href.includes('/video') || href.includes('/artworks'));
            }
        }, providedLink);

        const newPostLinks = postLinks.filter(link => !existingLinks.some(existingLink => existingLink.postLink === link));
        postLinksQueue.push(...newPostLinks);

        if (newPostLinks.length === 0) {
            console.log('Nothing New Found, moving to the next saved link.');
            break;
        }
        while (postLinksQueue.length > 0) {
            const link = postLinksQueue.shift();
            const newLinks = await processLink(page, link, existingLinks, mediaSelectors, username, progressCallback);
            totalAdded += newLinks;  // Add the new links to total
            
            // Call progress callback with current total
            if (progressCallback) {
                progressCallback(totalAdded);
            }
        }

        await page.goto(feedPageUrl, { waitUntil: 'networkidle2' });
        const nextPageSelector = await findNextPageSelector(page, pageCount, feedPageUrl);
        if (nextPageSelector) {
            await page.waitForSelector(nextPageSelector, { timeout: 2000 });
            if (feedPageUrl.includes('rule34video')) {
                await page.click(nextPageSelector);
                await randomWait();
            }
            else {
                await page.click(nextPageSelector), { waitUntil: 'networkidle2' };
            }
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            feedPageUrl = page.url();
            if (feedPageUrl.includes('rule34video')) {
                await page.reload({ waitUntil: 'networkidle2' }); // Refresh the page
                console.log('Reloading page...');
            }
            pageCount++;

        } else {
            console.log('No next page button found, moving to the next saved link.');
            break;
        }
        console.log(`New links added: ${newPostLinks.length}`);
        console.log(`Total links count: ${existingLinks.length}`);
    }
    
    return totalAdded;  // Return the total
};

const processLink = async (page, link, existingLinks, mediaSelectors, username, progressCallback) => {
    try {
        const jinaLink = link.includes('kemono.su') ? `https://r.jina.ai/${link}` : link;
        const response = await page.goto(jinaLink, { waitUntil: 'networkidle2' });
        if (!response || response.status() === 404) { // Add null check for response
            console.error(`Resource not found at ${jinaLink} (404)`);
            return 0;
        }

        let mediaData;
        if (link.includes('/video')) {
            const videoId = link.match(/\/video\/(\d+)/)[1];
            mediaData = `https://rule34video.com/embed/${videoId}`;
        } else {
            mediaData = await extractMediaData(page, link, mediaSelectors);
        }

        if (mediaData) {
            const mediaLink = { postLink: link, videoLinks: [mediaData] }; // Add video link with square brackets
            const linksAdded = saveMediaLinks([mediaLink], username);
            existingLinks.push(mediaLink);
            
            // Log progress
            console.log(`Added ${linksAdded} new links, current total: ${existingLinks.length}`);
            
            // Call progress callback each time we add links
            if (progressCallback) {
                progressCallback(linksAdded);
            }
            
            return linksAdded;
        }
        return 0;
    } catch (error) {
        console.error(`Failed to load resource at ${link}:`, error);
        return 0;
    }
};

const extractMediaData = async (page, link, mediaSelectors) => {
    if (link.includes('kemono.su')) {
        const pageContent = await page.evaluate(() => document.body.innerText);
        const mediaUrls = pageContent.match(/https:\/\/n\d\.kemono\.su\/data\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32}\.(png|jpg|gif|webm|webp)\?f=\S+/g);
        return mediaUrls ? mediaUrls.find(url => url.includes('kemono') && !url.includes('/logo.png')) : null;
    } else {
        return await page.evaluate((selectors) => {
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const src = element.src || element.currentSrc;
                    if (src && /\.(mp4|png|jpg|jpeg|gif|webm|webp)$/.test(src) && !src.includes('/logo.png')) {
                        return src;
                    }
                }
            }
            return null;
        }, mediaSelectors);
    }
};

const findNextPageSelector = async (page, pageCount, feedPageUrl) => {
    if (feedPageUrl.includes('gelbooru')) {
        const exists = await page.$(`#paginator > a:nth-child(${pageCount + 2})`) !== null;
            if (exists) {
                return `#paginator > a:nth-child(${pageCount + 2})`;
            }
            else {
                return null;
            }
        return selector;
    } else {
        for (const selector of NEXT_PAGE_SELECTORS) {
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
    
    const userDir = path.join(__dirname, '../build/users', username);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    
    const filePath = path.join(userDir, 'links.json');
    let existingLinks = [];
    
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
    
    const updatedLinks = [...existingLinks, ...newLinks];
    fs.writeFileSync(filePath, JSON.stringify(updatedLinks, null, 2));
    console.log(`Saved ${newLinks.length} new media links to ${filePath}`);
    return newLinks.length; // Return number of new links added
};

const savePixivLinks = (pixivLinks, username, providedLink) => {
    if (!username) {
        console.error('No username provided for saving Pixiv links');
        return 0;
    }
    
    const userDir = path.join(__dirname, '../build/users', username);
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

    // Define launch options for Puppeteer 19.7.2
    const launchOptions = {
        headless: true, // Use boolean instead of 'new'
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            `--disable-extensions-except=${uBlockPath}`,
            `--load-extension=${uBlockPath}`
        ]
    };
    
    // Only add specific options in development environment
    if (!process.env.NODE_ENV !== 'production') {
        launchOptions.executablePath = EDGE_PATH;
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
    let feedPageUrl = providedLink || FEED_URL;
    let pageCount = 0;
    let existingLinks = [];

    if (!feedPageUrl.includes("bookmark_new_illust_r18") && !feedPageUrl.includes("illustrations") || feedPageUrl.includes("artworks")) {
        clearPixivLinks(); // Clear pixivLinks at the beginning
    }

    if (fs.existsSync(PIXIV_LINKS_PATH)) {
        const data = fs.readFileSync(PIXIV_LINKS_PATH, 'utf-8');
        existingLinks = JSON.parse(data);
    }

    // Load existing links from links.json to avoid duplicates
    let allExistingLinks = [];
    if (fs.existsSync(LINKS_PATH)) {
        const data = fs.readFileSync(LINKS_PATH, 'utf-8');
        allExistingLinks = JSON.parse(data);
    }

    let totalAdded = 0;

    while (pageCount < PAGE_TARGET) {
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

        const newPostLinks = postLinks.filter(link => !existingLinks.some(existingLink => existingLink.postLink === link));
        const uniqueNewPostLinks = newPostLinks.filter((link, index, self) =>
            index === self.findIndex((t) => (
                t === link
            ))
        );
        postLinksQueue.push(...uniqueNewPostLinks);

        if (uniqueNewPostLinks.length === 0) {
            console.log('Nothing New Found, moving to the next saved link.');
            break;
        }
        while (postLinksQueue.length > 0) {
            const link = postLinksQueue.shift();
            // Check if the link already exists in links.json
            if (!allExistingLinks.some(existingLink => existingLink.postLink === link)) {
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

module.exports = { scrapeVideos, scrapeSavedLinks};

