// Example component that needs to use the correct API URL
import React, { useState } from 'react';
import apiClient from '../api/apiClient';
// ...existing imports...

function Login() {
  // ...existing component code...

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      console.log('Attempting login to:', apiClient.defaults.baseURL);
      const response = await apiClient.post('/api/login', { username, password });
      // ...handle successful login
    } catch (error) {
      console.error('Login error:', error);
      // ...handle error
    }
  };

  // ...rest of component
}

export default Login;
