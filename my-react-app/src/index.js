import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// This is where your React app gets mounted to the DOM
const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);