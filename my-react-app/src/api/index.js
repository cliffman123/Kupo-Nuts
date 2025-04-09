const API_URL = 'http://localhost:5000';  // Hardcode for local development

export const apiClient = async (endpoint, options = {}) => {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, defaultOptions);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// Example usage:
export const loginUser = (credentials) => {
  return apiClient('/api/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
};

// Add other API calls similarly
