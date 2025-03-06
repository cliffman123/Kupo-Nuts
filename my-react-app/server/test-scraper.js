/**
 * Test Scraper - Diagnostic tool for Puppeteer configuration
 * 
 * This simple script attempts to launch a browser and navigate to a URL
 * using Puppeteer. It logs detailed diagnostics at every step.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Import the configuration
const puppeteerConfig = require('./puppeteer-config');

// Function to check if Chrome is installed
const checkChrome = () => {
  console.log('Checking for Chrome installation...');
  
  const possiblePaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  
  // Check if any of these paths exist
  const existingPaths = possiblePaths.filter(chromePath => {
    try {
      return fs.existsSync(chromePath);
    } catch (e) {
      return false;
    }
  });
  
  console.log('Found Chrome at paths:', existingPaths.length > 0 ? existingPaths : 'None');
  
  // Try using which command
  try {
    const whichOutput = execSync('which google-chrome-stable || which google-chrome || which chromium-browser || which chromium', {encoding: 'utf8'});
    console.log('Chrome found using "which" command:', whichOutput.trim());
  } catch (e) {
    console.log('Chrome not found using "which" command');
  }
  
  // Check environment variables
  console.log('PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH || 'Not set');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'Not set');
  
  return existingPaths.length > 0;
};

// Function to run the Puppeteer test
const runTest = async (url = 'https://www.google.com') => {
  console.log('Starting Puppeteer test...');
  console.log('Target URL:', url);
  console.log('Current directory:', process.cwd());
  console.log('Using configuration:', JSON.stringify(puppeteerConfig, null, 2));
  
  let browser;
  
  try {
    console.log('Checking Chrome installation...');
    checkChrome();
    
    // Add timeout to browser launch
    console.log('Attempting to launch browser with 30s timeout...');
    const browserPromise = puppeteer.launch({
      ...puppeteerConfig,
      headless: 'new', // Always use headless for testing
      args: [
        ...(puppeteerConfig.args || []),
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    
    // Add timeout to browser launch
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Browser launch timed out after 30s')), 30000)
    );
    
    browser = await Promise.race([browserPromise, timeout]);
    
    console.log('Browser launched successfully!');
    console.log('Browser version:', await browser.version());
    
    // Create a page
    console.log('Creating a new page...');
    const page = await browser.newPage();
    console.log('Page created successfully');
    
    // Navigate to the URL
    console.log(`Navigating to ${url}...`);
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Check if navigation was successful
    if (response && response.ok()) {
      console.log('Navigation successful!');
      console.log('Page title:', await page.title());
      console.log('HTTP status:', response.status());
      
      // Take a screenshot for verification
      const screenshotPath = path.join(__dirname, 'test-screenshot.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`Screenshot saved to ${screenshotPath}`);
      
      return { success: true, message: 'Test completed successfully' };
    } else {
      console.error('Navigation failed with status:', response ? response.status() : 'unknown');
      return { success: false, message: `Navigation failed with status: ${response ? response.status() : 'unknown'}` };
    }
  } catch (error) {
    console.error('Error during test:', error);
    return { success: false, message: error.message };
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
      console.log('Browser closed');
    }
  }
};

// Execute the test if this file is run directly
if (require.main === module) {
  const testUrl = process.argv[2] || 'https://www.google.com';
  
  console.log('==== Puppeteer Diagnostic Test ====');
  console.log('Testing URL:', testUrl);
  
  runTest(testUrl)
    .then(result => {
      console.log('==== Test Result ====');
      console.log('Success:', result.success);
      console.log('Message:', result.message);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error during test:', error);
      process.exit(1);
    });
} else {
  // Export for use in other files
  module.exports = { runTest, checkChrome };
}
