// This is a forwarding file that points to the actual server implementation
// This helps Render find the server when it looks in the root directory

console.log('Starting server from root forwarding file');
console.log('Current directory:', process.cwd());
console.log('Node modules available:', require('fs').existsSync('./node_modules'));

// Make all dependencies available from the root level
require('dotenv').config();
require('express');
require('body-parser');
require('cors');
require('axios');
require('bcrypt');
require('cookie-parser');
require('express-session');
require('jsonwebtoken');
require('fs');
require('path');

// Load puppeteer and related dependencies
try {
  console.log('Pre-loading puppeteer dependencies...');
  require('puppeteer');
  require('puppeteer-extra');
  require('puppeteer-extra-plugin-stealth');
  require('puppeteer-extra-plugin-adblocker');
  console.log('Puppeteer dependencies loaded successfully');
} catch (error) {
  console.error('Failed to load puppeteer dependencies:', error.message);
}

try {
  // Import and run the actual server implementation
  require('./my-react-app/server/server.js');
} catch (error) {
  console.error('Error loading server implementation:', error);
  process.exit(1);
}
