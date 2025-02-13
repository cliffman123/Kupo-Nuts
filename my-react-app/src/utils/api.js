import axios from 'axios';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'https://your-public-server-url.com',
    withCredentials: process.env.REACT_APP_ALLOW_CREDENTIALS === 'true',
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add a request interceptor for authentication if needed
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const login = async (username, password) => {
    try {
        const response = await api.post('/api/auth/login', { username, password });
        return response.data;
    } catch (error) {
        throw error.response.data;
    }
};

export const register = async (username, password) => {
    try {
        const response = await api.post('/api/auth/register', { username, password });
        return response.data;
    } catch (error) {
        throw error.response.data;
    }
};

export default api;
