const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const puppeteerConfig = require('../puppeteer-config');

// Route to find similar posts based on a provided URL
router.post('/', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ message: 'URL is required' });
        }
        
        console.log('Finding similar posts for URL:', url);
        
        // Use the puppeteer configuration from puppeteer-config.js
        const browser = await puppeteer.launch(puppeteerConfig);
        
        try {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            
            // Find image or video elements
            const mediaUrls = await page.evaluate(() => {
                const images = Array.from(document.querySelectorAll('img[src]')).map(img => img.src);
                const videos = Array.from(document.querySelectorAll('video source[src]')).map(video => video.src);
                return [...images, ...videos];
            });
            
            if (mediaUrls.length === 0) {
                throw new Error('No media found on this page');
            }
            
            // Use first media item to search for similar content
            const targetUrl = mediaUrls[0];
            console.log('Using media URL for similarity search:', targetUrl);
            
            // Implement your similar posts search logic here
            // This is just a placeholder - you'll need to implement actual similarity logic
            const similarPostsFound = 3; // Example count
            
            res.json({ 
                success: true, 
                count: similarPostsFound,
                message: 'Similar posts found successfully' 
            });
            
        } finally {
            await browser.close();
        }
    } catch (error) {
        console.error('Error finding similar posts:', error);
        res.status(500).json({ message: error.message || 'Failed to find similar posts' });
    }
});

module.exports = router;
