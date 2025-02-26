const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
const port = 3000;

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
    // Token authentication logic here
    next();
};

// Add CORS middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));

// Add body parser middleware
app.use(express.json());

// Fix the pixiv-links endpoint
app.get('/api/pixiv-links', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        // Get the path to the user's pixivLinks.json file
        const filePath = path.join(__dirname, '../build/users', username, 'pixivLinks.json');
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.log(`pixivLinks.json not found for user ${username} at: ${filePath}`);
            return res.json([]); // Return empty array if file doesn't exist
        }

        // Read and parse file
        const data = await fs.promises.readFile(filePath, 'utf8');
        try {
            const links = JSON.parse(data);
            // Ensure we're sending an array
            const linksArray = Array.isArray(links) ? links : [];
            // Set proper headers
            res.setHeader('Content-Type', 'application/json');
            return res.json(linksArray);
        } catch (parseError) {
            console.error('Error parsing pixivLinks.json:', parseError);
            return res.json([]); // Return empty array on parse error
        }
    } catch (error) {
        console.error('Error reading pixivLinks.json:', error);
        // Set proper headers even for error response
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ message: 'Failed to load Pixiv links' });
    }
});

// Update initializeUserFiles to include pixivLinks.json
const initializeUserFiles = (username) => {
    const userDir = path.join(__dirname, '../build/users', username);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    
    const files = ['links', 'scrape-links', 'pixivLinks'];
    files.forEach(file => {
        const filePath = path.join(userDir, `${file}.json`);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '[]', 'utf8');
        }
    });
};

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});