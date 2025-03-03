// This is a forwarding file that points to the actual server implementation
// This helps Render find the server when it looks in the root directory

console.log('Starting server from root forwarding file');
console.log('Current directory:', process.cwd());
console.log('Node modules available:', require('fs').existsSync('./node_modules'));

// Make all dependencies available from the root level
require('cors');
require('express');
require('body-parser');
require('axios');
require('bcrypt');
require('cookie-parser');
require('dotenv').config();
require('express-session');
require('jsonwebtoken');

try {
  // Import and run the actual server implementation
  require('./my-react-app/server/server.js');
} catch (error) {
  console.error('Error loading server implementation:', error);
  process.exit(1);
}
