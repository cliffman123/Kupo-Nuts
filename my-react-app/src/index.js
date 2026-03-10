import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Add ResizeObserver patch FIRST, before any other imports
if (typeof window !== 'undefined' && window.ResizeObserver) {
    const OriginalResizeObserver = window.ResizeObserver;
    
    window.ResizeObserver = class extends OriginalResizeObserver {
        constructor(callback) {
            const wrappedCallback = (entries) => {
                window.requestAnimationFrame(() => {
                    if (!Array.isArray(entries) || !entries.length) {
                        return;
                    }
                    callback(entries);
                });
            };
            super(wrappedCallback);
        }
    };
}

// This is where your React app gets mounted to the DOM
const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);