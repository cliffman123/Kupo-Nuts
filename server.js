const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;

// Configure CORS for production
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://YOUR_ACTUAL_USERNAME.github.io/Kupo-Nuts' // Update with your actual GitHub Pages URL
    : 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Your API routes

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
