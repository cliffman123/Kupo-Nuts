// Dynamic configuration based on environment

// Detect if we're running in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || 
                      window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

// Set API URL based on environment
const config = {
  // Use localhost:5000 in development, your Render URL in production
  API_URL: isDevelopment 
    ? 'http://localhost:5000'
    : 'https://kupo-nuts.onrender.com', // Replace with your actual Render URL
  
  // Add other configuration values as needed
  VERSION: '1.0.0',
};

console.log('Running in', isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION', 'mode');
console.log('Using API URL:', config.API_URL);

export default config;
