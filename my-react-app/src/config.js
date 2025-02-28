const isProduction = window.location.hostname !== 'localhost';

const config = {
  API_URL: isProduction 
    ? 'https://your-deployed-server.com' // Replace with your actual deployed server URL
    : 'http://localhost:5000'
};

export default config;
