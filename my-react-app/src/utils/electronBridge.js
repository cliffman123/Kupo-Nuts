export const electronBridge = {
  isElectron: !!window.electronAPI,
  proxyMedia: async (url) => {
    // Use backend proxy endpoint
    return `http://localhost:5000/api/proxy-media?url=${encodeURIComponent(url)}`;
  },
  proxyStream: (url) => `http://localhost:5000/api/proxy-media?url=${encodeURIComponent(url)}`,
};