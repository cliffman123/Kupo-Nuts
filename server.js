const express = require('express');
const cors = require('cors'); // You'll need to install this: npm install cors
const app = express();
const port = process.env.PORT || 5000;

// Configure CORS
app.use(cors({
  // Allow requests from Render and local development
  origin: [
    'https://your-app-name.onrender.com', // Your Render static site URL
    'http://localhost:3000' // For local development
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Your existing Express routes and middleware
// ...existing code...

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
