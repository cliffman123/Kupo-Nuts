import axios from 'axios';

// Use environment variable or fallback URL
const API_URL = process.env.REACT_APP_API_URL || 'https://kupo-nuts-api.onrender.com';

console.log('API URL:', API_URL); // Debug log to see what URL is being used

// Create a configured axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Add request interceptor for logging
apiClient.interceptors.request.use(
  config => {
    console.log(`API Request to: ${config.url} with method: ${config.method}`);
    return config;
  },
  error => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling with better logging
apiClient.interceptors.response.use(
  response => {
    console.log(`API response from ${response.config.url}:`, response.status);
    return response;
  },
  error => {
    console.error('API response error:', error);
    if (error.response) {
      console.error('Error data:', error.response.data);
      console.error('Error status:', error.response.status);
    } else if (error.request) {
      console.error('No response received', error.request);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
