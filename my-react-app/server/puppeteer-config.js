/**
 * Puppeteer configuration for different environments
 */
const isProd = process.env.NODE_ENV === 'production';

// Configuration for Puppeteer
const puppeteerConfig = {
  // Use installed Chrome in production with fallback paths
  executablePath: isProd 
    ? process.env.PUPPETEER_EXECUTABLE_PATH || 
      '/usr/bin/google-chrome-stable' || 
      '/usr/bin/chromium-browser' || 
      '/usr/bin/chromium'
    : undefined,
  
  // Add these options to make it work in containerized environments
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions'
  ],
  
  // Increase timeout for slower cloud environments
  timeout: 60000,
  
  // Let Puppeteer download Chrome if it can't find the executable
  ignoreDefaultArgs: ['--disable-extensions'],
  
  // Important for containerized environments
  headless: 'new'
};

module.exports = puppeteerConfig;
