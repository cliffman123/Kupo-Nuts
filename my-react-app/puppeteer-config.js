/**
 * Puppeteer configuration for different environments
 */
const isProd = process.env.NODE_ENV === 'production';

// Configuration for Puppeteer
const puppeteerConfig = {
  // Use installed Chrome in production
  executablePath: isProd ? '/usr/bin/google-chrome-stable' : undefined,
  
  // Add these options to make it work in containerized environments
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ],
  
  // Increase timeout for slower cloud environments
  timeout: 60000
};

module.exports = puppeteerConfig;
