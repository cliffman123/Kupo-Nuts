require('dotenv').config(); // Ensure this is at the top
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Import the cors middleware
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { scrapeVideos } = require('./scraper');
const axios = require('axios'); // Add this line to import axios

const app = express();
const PORT = process.env.PORT || 5000; // Change port to 5000

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Update CORS configuration for local development
app.use(cors({
    origin: ['http://localhost:3000', 'https://kupo-nuts-svi8.vercel.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
}));

// Add these headers to every response
app.use((req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(cookieParser());

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
        req.user = user;
        
        // Check if user exists in our users object
        if (!users[user.username]) {
            return res.status(401).json({ message: 'User not found' });
        }
        
        next();
    } catch (err) {
        console.error('Token verification error:', err);
        res.clearCookie('token');
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};

const validatePassword = (req, res, next) => {
    const { password } = req.body;
    
    if (password.length < PASSWORD_MIN_LENGTH) {
        return res.status(400).json({ 
            message: 'Password must be at least 12 characters long'
        });
    }
    
    if (!PASSWORD_REGEX.test(password)) {
        return res.status(400).json({ 
            message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        });
    }
    
    next();
};

// User storage (replace with database in production)
const users = {};

// Rate limiting for login attempts
const loginAttempts = {};
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Login rate limiting middleware
const checkLoginAttempts = (req, res, next) => {
    const ip = req.ip;
    const currentTime = Date.now();

    if (loginAttempts[ip]) {
        if (loginAttempts[ip].attempts >= MAX_LOGIN_ATTEMPTS) {
            if (currentTime - loginAttempts[ip].lastAttempt < LOCKOUT_TIME) {
                return res.status(429).json({
                    message: 'Too many login attempts. Please try again later.',
                    waitTime: Math.ceil((LOCKOUT_TIME - (currentTime - loginAttempts[ip].lastAttempt)) / 1000 / 60)
                });
            } else {
                // Reset attempts after lockout period
                loginAttempts[ip].attempts = 0;
            }
        }
    }
    next();
};

// Add these helper functions after the existing constants
const getUserFilePath = (username, fileType) => {
    const userDir = path.join(__dirname, '../build/users', username);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    return path.join(userDir, `${fileType}.json`);
};

const initializeUserFiles = (username) => {
    const linksPath = getUserFilePath(username, 'links');
    const scrapeLinksPath = getUserFilePath(username, 'scrape-links');
    
    if (!fs.existsSync(linksPath)) {
        fs.writeFileSync(linksPath, '[]', 'utf8');
    }
    if (!fs.existsSync(scrapeLinksPath)) {
        fs.writeFileSync(scrapeLinksPath, '[]', 'utf8');
    }
};

// Authentication endpoints
app.post('/api/register', validatePassword, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        if (users[username]) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users[username] = {
            password: hashedPassword,
            createdAt: new Date()
        };

        // Initialize user files
        initializeUserFiles(username);

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/login', checkLoginAttempts, async (req, res) => {
    try {
        const { username, password } = req.body;
        const ip = req.ip;

        if (!loginAttempts[ip]) {
            loginAttempts[ip] = { attempts: 0, lastAttempt: Date.now() };
        }

        if (!username || !password) {
            loginAttempts[ip].attempts++;
            loginAttempts[ip].lastAttempt = Date.now();
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const user = users[username];
        if (!user) {
            loginAttempts[ip].attempts++;
            loginAttempts[ip].lastAttempt = Date.now();
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            loginAttempts[ip].attempts++;
            loginAttempts[ip].lastAttempt = Date.now();
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Reset login attempts on successful login
        loginAttempts[ip].attempts = 0;

        // Create JWT token
        const token = jwt.sign(
            { username },
            process.env.JWT_SECRET || 'your-jwt-secret',
            { expiresIn: '24h' }
        );

        // Set token in cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: false, // Set to false for development
            sameSite: 'lax',
            path: '/',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({ message: 'Login successful' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    req.session.destroy();
    res.json({ message: 'Logout successful' });
});

// Protected route example
app.get('/api/profile', authenticateToken, (req, res) => {
    res.json({ username: req.user.username });
});

let isScraping = false; // Add a flag to indicate if scraping is in progress

app.post('/api/scrape', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const username = req.user.username; // Get username from authenticated token
   
    try {
        console.log(`Starting scrape for user ${username} with URL: ${url}`);
        const postLinks = await scrapeVideos(url, null, username);
        const linksAdded = postLinks.length;
        console.log(`Scraping successful. Links added: ${linksAdded}`);
        res.status(200).json({ message: 'Scraping successful', linksAdded });
    } catch (error) {
        console.error('Error scraping videos:', error);
        res.status(500).json({ message: 'Scraping failed', error: error.message });
    }
});

app.post('/api/remove', authenticateToken, (req, res) => {
    const { postLink, videoLink } = req.body;
    const filePath = getUserFilePath(req.user.username, 'links');

    try {
        // Read the current links
        let data = fs.readFileSync(filePath, 'utf8');
        let links = JSON.parse(data);

        // Filter the links array
        links = links.map(link => {
            if (link.postLink === postLink) {
                // Handle both array and string cases for videoLinks
                if (Array.isArray(link.videoLinks)) {
                    link.videoLinks = link.videoLinks.filter(vl => vl !== videoLink);
                } else if (link.videoLinks === videoLink) {
                    link.videoLinks = [];
                }
            }
            return link;
        }).filter(link => {
            // Remove any entries that have empty videoLinks
            if (Array.isArray(link.videoLinks)) {
                return link.videoLinks.length > 0;
            }
            return link.videoLinks && link.videoLinks.length > 0;
        });

        // Write the updated links back to the file
        fs.writeFileSync(filePath, JSON.stringify(links, null, 2), 'utf8');
        
        res.status(200).json({ message: 'Media removed successfully' });
    } catch (error) {
        console.error('Error removing media:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const fetchUserId = async (username, bearerToken) => {
    const response = await axios.get(`https://api.twitter.com/2/users/by/username/${username}`, {
        headers: {
            'Authorization': `Bearer ${bearerToken}`
        }
    });
    return response.data.data.id;
};

const fetchTweetsFromUser = async (userId, bearerToken) => {
    const response = await axios.get(`https://api.twitter.com/2/users/${userId}/tweets`, {
        headers: {
            'Authorization': `Bearer ${bearerToken}`
        },
        params: {
            max_results: 10
        }
    });
    return response.data;
};

app.post('/api/tweets', authenticateToken, async (req, res) => {
    const { username: twitterUsername } = req.body;
    const bearerToken = "AAAAAAAAAAAAAAAAAAAAAG9%2BxgEAAAAAtjKb7XVERP0DVHozG3IHPO6LzdY%3DLLC1iZj2xdpGLAgrLUAZeOmMIPpI0HLpHN5qeqY7Blvba1YQnI";

    console.log('UserName', twitterUsername); // Log the username to the console

    if (!bearerToken) {
        console.error('TWITTER_BEARER_TOKEN is not set');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const userId = await fetchUserId(twitterUsername, bearerToken);
        const response = await fetchTweetsFromUser(userId, bearerToken);
        const tweetIds = response.data.map(tweet => tweet.id);
        console.log('Fetched tweet IDs:', tweetIds);

        // Read the existing links from links.json
        const filePath = getUserFilePath(req.user.username, 'links');
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading file:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            let links = JSON.parse(data);

            // Add new tweet links to the existing links
            tweetIds.forEach(id => {
                links.push({
                    postLink: `https://twitter.com/i/status/${id}`,
                    videoLinks: `https://d.fixupx.com/i/status/${id}.mp4`
                });
            });

            // Write the updated links back to links.json
            fs.write(filePath, JSON.stringify(links, null, 2), 'utf8', (err) => {
                if (err) {
                    console.error('Error writing file:', err);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }

                res.json(response.data);
            });
        });
    } catch (error) {
        console.error('Error fetching tweets:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        res.status(500).json({ error: 'Failed to fetch tweets' });
    }
});

const scrapeSavedLinks = async (username) => {
    const filePath = getUserFilePath(username, 'scrape-links');
    if (!fs.existsSync(filePath)) {
        throw new Error('scrape-links.json file not found for user');
    }

    const data = fs.readFileSync(filePath, 'utf8');
    const links = JSON.parse(data);

    for (const link of links) {
        try {
            await scrapeVideos(link, null, username);
        } catch (error) {
            console.error(`Error scraping link ${link}:`, error);
        }
    }
};

// // Call scrapeSavedLinks once when the server starts
// scrapeSavedLinks().then(() => {
//     // Set interval to call scrapeSavedLinks every 6 hours
//     setInterval(scrapeSavedLinks, 6 * 60 * 60 * 1000); // 6 hours in milliseconds
// }).catch(error => {
//     console.error('Error during initial scrape:', error);
// });

app.post('/api/scrape-saved-links', authenticateToken, async (req, res) => {
    try {
        await scrapeSavedLinks(req.user.username);
        res.status(200).json({ message: 'Scraping saved links successful' });
    } catch (error) {
        console.error('Error scraping saved links:', error);
        res.status(500).json({ message: 'Scraping saved links failed', error: error.message });
    }
});

app.post('/api/save-scrape-url', authenticateToken, (req, res) => {
    const { url } = req.body;
    const filePath = getUserFilePath(req.user.username, 'scrape-links');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        let links;
        try {
            links = data ? JSON.parse(data) : [];
        } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (links.includes(url)) {
            return res.status(400).json({ message: 'URL already exists' });
        }

        links.push(url);

        fs.writeFile(filePath, JSON.stringify(links, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Error writing file:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            res.status(200).json({ message: 'URL saved successfully' });
        });
    });
});

// Add new endpoint to fetch user's media
app.get('/api/media', authenticateToken, (req, res) => {
    const filePath = getUserFilePath(req.user.username, 'links');
    
    if (!fs.existsSync(filePath)) {
        // Initialize empty links file if it doesn't exist
        fs.writeFileSync(filePath, '[]', 'utf8');
        return res.json([]);
    }
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        try {
            const links = JSON.parse(data);
            // Filter out any invalid entries
            const validLinks = links.filter(link => link && link.postLink && link.videoLinks);
            res.json(validLinks);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
});

// Add new endpoints for import/export
app.get('/api/export-links', authenticateToken, (req, res) => {
    const filePath = getUserFilePath(req.user.username, 'links');
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.json([]); // Return empty array if file doesn't exist
        }
        
        const data = fs.readFileSync(filePath, 'utf8');
        const links = JSON.parse(data);
        res.json(links);
    } catch (error) {
        console.error('Error exporting links:', error);
        res.status(500).json({ error: 'Failed to export links' });
    }
});

app.post('/api/import-links', authenticateToken, (req, res) => {
    const filePath = getUserFilePath(req.user.username, 'links');
    
    try {
        const newLinks = req.body;
        
        if (!Array.isArray(newLinks)) {
            return res.status(400).json({ error: 'Invalid format: expected array' });
        }

        // Normalize links format
        const validLinks = newLinks.map(link => ({
            postLink: link.postLink,
            videoLinks: Array.isArray(link.videoLinks) ? link.videoLinks : [link.videoLinks]
        })).filter(link => 
            link && 
            typeof link === 'object' && 
            typeof link.postLink === 'string' && 
            Array.isArray(link.videoLinks) &&
            link.videoLinks.every(vl => typeof vl === 'string')
        );

        if (validLinks.length === 0) {
            return res.status(400).json({ error: 'No valid links found in import file' });
        }

        // Replace existing links with the imported ones
        fs.writeFileSync(filePath, JSON.stringify(validLinks, null, 2), 'utf8');
        
        res.json({ 
            message: 'Links imported successfully - replaced existing collection', 
            total: validLinks.length
        });
    } catch (error) {
        console.error('Error importing links:', error);
        res.status(500).json({ error: 'Failed to import links' });
    }
});

app.post('/api/similar', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const username = req.user.username;

    try {
        // Extract the ID or relevant info from the URL
        const match = url.match(/\/post\/(\d+)/);
        if (!match) {
            throw new Error('Invalid post URL format');
        }
        const postId = match[1];

        // Construct the search URL for similar posts
        const baseUrl = url.split('/post/')[0];
        const searchUrl = `${baseUrl}/post/${postId}`;
        
        console.log(`Finding similar posts for user ${username} from post: ${searchUrl}`);
        
        // Use the existing scrapeVideos function to scrape similar posts
        const postLinks = await scrapeVideos(searchUrl, null, username);
        
        if (!postLinks || postLinks.length === 0) {
            throw new Error('No similar posts found');
        }

        res.status(200).json({ 
            message: 'Similar posts found successfully', 
            count: postLinks.length 
        });
    } catch (error) {
        console.error('Error finding similar posts:', error);
        res.status(500).json({ 
            message: error.message || 'Failed to find similar posts'
        });
    }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../build')));

// Catch-all route to serve index.html for any other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

// Add this function before app.listen()
const clearUserData = () => {
    const buildDir = path.join(__dirname, '../build');
    const usersDir = path.join(buildDir, 'users');
    
    if (fs.existsSync(usersDir)) {
        console.log('Clearing user data...');
        fs.rmSync(usersDir, { recursive: true, force: true });
        fs.mkdirSync(usersDir);
        console.log('User data cleared successfully');
    }
    
    // Reset users object
    Object.keys(users).forEach(key => delete users[key]);
    console.log('Users object reset');
};

// Clear user data when server starts
clearUserData();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});