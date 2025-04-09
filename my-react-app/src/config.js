// Dynamic configuration based on environment

// Detect if we're running in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || 
                      window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

// Set API URL based on environment
const config = {
  API_URL: process.env.NODE_ENV === 'production' 
    ? 'https://kupo-nuts.onrender.com'
    : 'http://localhost:5000'
};

console.log('Running in', isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION', 'mode');
console.log('Using API URL:', config.API_URL);

export default config;
