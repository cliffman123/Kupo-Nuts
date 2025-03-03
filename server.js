// This is a forwarding file that points to the actual server implementation
// This helps Render find the server when it looks in the root directory

console.log('Starting server from root forwarding file');
console.log('Current directory:', process.cwd());

// Import and run the actual server implementation
require('./my-react-app/server/server.js');
