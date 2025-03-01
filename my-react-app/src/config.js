// Set default ngrok URL - update this whenever you start a new ngrok session
const DEFAULT_NGROK_URL = ' https://9200-2600-4040-441b-5e00-8534-daac-9f21-baa.ngrok-free.app';

// Use stored URL from localStorage or fall back to the default
const ngrokUrl = localStorage.getItem('ngrokUrl') || DEFAULT_NGROK_URL;

const config = {
  // Always use ngrok URL
  API_URL: ngrokUrl
};

// Log configuration info
console.log('Using API URL:', config.API_URL);

// Helper function to update ngrok URL when it changes
export const updateNgrokUrl = (url) => {
  if (url && url.includes('ngrok')) {
    localStorage.setItem('ngrokUrl', url);
    console.log('Ngrok URL updated to:', url);
    console.log('Please refresh the page to use the new URL.');
    return true;
  }
  return false;
};

// Helper to reset to default ngrok URL
export const resetToDefaultNgrok = () => {
  localStorage.setItem('ngrokUrl', DEFAULT_NGROK_URL);
  console.log('Reset to default ngrok URL. Please refresh the page.');
};

export default config;
