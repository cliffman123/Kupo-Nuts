// This is a forwarding file that points to the actual server implementation
// This helps Render find the server when it looks in the root directory

// Automatically set development mode if NODE_ENV is not already set
if (!process.env.NODE_ENV) {
  console.log('NODE_ENV not set, defaulting to development mode');
  process.env.NODE_ENV = 'development';
} else {
  console.log(`Running in ${process.env.NODE_ENV} mode`);
}

console.log('Starting server from root forwarding file');
console.log('Current directory:', process.cwd());
console.log('Node modules available:', require('fs').existsSync('./node_modules'));
console.log('Server implementation exists:', require('fs').existsSync('./my-react-app/server/server.js'));

// Make all dependencies available from the root level
try {
  console.log('Loading dependencies...');
  require('cors');
  require('express');
  require('body-parser');
  require('axios');
  require('cookie-parser');
  require('dotenv').config();
  require('express-session');
  require('jsonwebtoken');
  console.log('Dependencies loaded successfully');
} catch (error) {
  console.error('Error loading dependencies:', error);
  process.exit(1);
}

try {
  // Import and run the actual server implementation
  console.log('Attempting to load server implementation...');
  require('./my-react-app/server/server.js');
  console.log('Server implementation loaded successfully');
} catch (error) {
  console.error('Error loading server implementation:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}
