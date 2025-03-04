import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

const ApiTest = () => {
  const [apiStatus, setApiStatus] = useState('Checking API connection...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkApi = async () => {
      try {
        // Test the root endpoint
        const response = await apiClient.get('/');
        setApiStatus(`API connection successful! Server says: ${response.data.message}`);
      } catch (err) {
        setError(`API connection failed: ${err.message}`);
        if (err.response) {
          console.error('Response data:', err.response.data);
        }
      }
    };

    checkApi();
  }, []);

  return (
    <div style={{ margin: '20px', padding: '20px', border: '1px solid #ccc' }}>
      <h3>API Connection Test</h3>
      <p>Using API URL: {apiClient.defaults.baseURL}</p>
      {apiStatus && <p style={{ color: 'green' }}>{apiStatus}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default ApiTest;
