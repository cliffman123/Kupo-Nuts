import axios from 'axios';

// Use environment variable or fallback URL
const API_URL = process.env.REACT_APP_API_URL || 'https://kupo-nuts-api.onrender.com';

// Create a configured axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add request interceptor for logging
apiClient.interceptors.request.use(
  config => {
    console.log(`API Request to: ${config.url}`);
    return config;
  },
  error => Promise.reject(error)
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  response => response,
  error => {
    // Handle specific error status codes
    if (error.response && error.response.status === 401) {
      console.error('Authentication error - please log in again');
      // You could redirect to login page here
    }
    return Promise.reject(error);
  }
);

export default apiClient;
