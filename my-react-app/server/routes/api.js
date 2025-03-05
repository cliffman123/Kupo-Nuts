const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const puppeteerConfig = require('../puppeteer-config'); // Import puppeteer config

// ...existing code...

// Update your similar posts endpoint
router.post('/similar', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ message: 'URL is required' });
        }
        
        console.log('Finding similar posts for URL:', url);
        
        // Use the puppeteer configuration
        const browser = await puppeteer.launch(puppeteerConfig);
        
        // Continue with your existing similar posts logic
        const page = await browser.newPage();
        // ...existing code for finding similar posts...
        
        await browser.close();
        
        res.json({ success: true, count: similarPostsFound });
    } catch (error) {
        console.error('Error finding similar posts:', error);
        res.status(500).json({ message: error.message || 'Failed to find similar posts' });
    }
});

// ...existing code...

module.exports = router;
