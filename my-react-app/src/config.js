const config = {
  apiUrl: process.env.REACT_APP_API_URL || 'https://kupo-nuts-api.onrender.com'
};

console.log('Current API URL:', config.apiUrl);

export default config;
