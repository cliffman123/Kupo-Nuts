require('dotenv').config(); // Ensure this is at the top
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const passwordUtils = require('./passwordUtils');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { scrapeVideos } = require('./scraper');
const axios = require('axios');
// Add FileStore for session persistence
const FileStore = require('session-file-store')(session);

const app = express();
const PORT = process.env.PORT || 5000;

// Constants
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// In-memory storage
const users = {};
const loginAttempts = {};

// Helper functions for file paths and user data
const getDataDir = () => {
    // Use a directory path that pptruser has permission to access
    let renderDataDir;
    
    if (process.env.RENDER_SERVICE_NAME) {
        // When running on Render, use a directory inside the app directory
        // pptruser definitely has permissions to this location
        renderDataDir = path.join(__dirname, '../../data');
    } else {
        // In development or other environments
        renderDataDir = path.join(__dirname, '../../data');
    }
        
    // Create the directory if it doesn't exist
    if (!fs.existsSync(renderDataDir)) {
        fs.mkdirSync(renderDataDir, { recursive: true, mode: 0o755 });
    }
    
    // Set as environment variable for other modules to use
    process.env.DATA_DIR = renderDataDir;
    return renderDataDir;
};

const getUsersDir = () => {
    const usersDir = path.join(getDataDir(), 'users');
    if (!fs.existsSync(usersDir)) {
        fs.mkdirSync(usersDir, { recursive: true, mode: 0o755 });
    }
    return usersDir;
};

const getUserDir = (username) => {
    const dir = path.join(getUsersDir(), username);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    }
    return dir;
};

const getUserFilePath = (username, fileType) => {
    return path.join(getUserDir(username), `${fileType}.json`);
};

const initializeUserFiles = (username) => {
    try {
        const linksPath = getUserFilePath(username, 'links');
        const scrapeLinksPath = getUserFilePath(username, 'scrape-links');
        
        if (!fs.existsSync(linksPath)) {
            fs.writeFileSync(linksPath, '[]', 'utf8');
        }
        if (!fs.existsSync(scrapeLinksPath)) {
            fs.writeFileSync(scrapeLinksPath, '[]', 'utf8');
        }
    } catch (error) {
        console.error(`Error initializing files for user ${username}:`, error);
        throw new Error(`Cannot initialize user files: ${error.message}`);
    }
};

// Initialize allowed origins
const allowedOrigins = [
    'http://localhost:3000', 
    'http://localhost:5000', 
    'https://cliffman123.github.io',
    'https://cliffman123.github.io/Kupo-Nuts', 
    'https://cliffman123.github.io/Kupo-Nuts/', 
    'https://kupo-nuts-frontend.onrender.com',
    'https://kupo-nuts.onrender.com'
];

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`Origin not in allowed list: ${origin}`);
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Cookie and session configuration
const getCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
});

// Create sessions directory in the data folder
const sessionsDir = path.join(getDataDir(), 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true, mode: 0o755 });
}

// Use FileStore instead of the default MemoryStore
app.use(session({
    store: new FileStore({
        path: sessionsDir,
        ttl: 86400, // 1 day in seconds
        reapInterval: 3600, // Clean up expired sessions every hour
        retries: 1
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: getCookieOptions()
}));

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(cookieParser());

// Middleware for authentication and validation
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
            // If user isn't loaded yet but folder exists, add it now
            const userDir = getUserDir(user.username);
            if (fs.existsSync(userDir)) {
                users[user.username] = {
                    password: "$2b$10$defaulthashforlegacyusers",
                    createdAt: new Date()
                };
                console.log(`Added missing user from token: ${user.username}`);
                next();
                return;
            }
            return res.status(401).json({ message: 'User not found' });
        }
        
        next();
    } catch (err) {
        console.error('Token verification error:', err);
        res.clearCookie('token', getCookieOptions());
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

const checkLoginAttempts = (req, res, next) => {
    const ip = req.ip;
    const currentTime = Date.now();

    if (!loginAttempts[ip]) {
        loginAttempts[ip] = { attempts: 0, lastAttempt: currentTime };
    }

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
    next();
};

// API Routes - Authentication
app.post('/api/register', validatePassword, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        if (users[username]) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        const hashedPassword = await passwordUtils.hash(password);
        users[username] = {
            password: hashedPassword,
            createdAt: new Date()
        };

        initializeUserFiles(username);
        
        const passwordPath = path.join(getUserDir(username), 'password.txt');
        fs.writeFileSync(passwordPath, hashedPassword);
        
        // Create backup after adding a new user
        saveUsersBackup();

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
        
        loginAttempts[ip] = loginAttempts[ip] || { attempts: 0, lastAttempt: Date.now() };

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

        const validPassword = await passwordUtils.compare(password, user.password);
        if (!validPassword) {
            loginAttempts[ip].attempts++;
            loginAttempts[ip].lastAttempt = Date.now();
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Reset login attempts on successful login
        loginAttempts[ip].attempts = 0;

        const token = jwt.sign(
            { username },
            process.env.JWT_SECRET || 'your-jwt-secret',
            { expiresIn: '24h' }
        );

        res.cookie('token', token, getCookieOptions());
        res.json({ message: 'Login successful' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token', getCookieOptions());
    
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                console.error('Error destroying session:', err);
            }
        });
    }
    
    res.json({ message: 'Logout successful' });
});

// API Routes - User Profile
app.get('/api/profile', authenticateToken, (req, res) => {
    res.json({ username: req.user.username });
});

// API Routes - Media Management
app.post('/api/scrape', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const username = req.user.username;

    try {
        console.log(`Starting scrape for user ${username} with URL: ${url}`);
        const result = await scrapeVideos(url, null, username);
        console.log('Scrape completed with result:', result);

        res.status(200).json({
            message: 'Scraping successful',
            linksAdded: result.linksAdded,
        });
    } catch (error) {
        console.error('Error scraping videos:', error);
        res.status(500).json({ message: 'Scraping failed', error: error.message });
    }
});

app.post('/api/remove', authenticateToken, (req, res) => {
    const { postLink } = req.body;
    const filePath = getUserFilePath(req.user.username, 'links');

    try {
        let data = fs.readFileSync(filePath, 'utf8');
        let links = JSON.parse(data);
        
        // Find the link with matching postLink and remove its videoLinks
        const updatedLinks = links.map(link => {
            if (link.postLink === postLink) {
                // Keep the post link but remove the video links
                return { ...link, videoLinks: [] };
            }
            return link;
        });
        
        fs.writeFileSync(filePath, JSON.stringify(updatedLinks, null, 2), 'utf8');
        
        res.status(200).json({ message: 'Media removed successfully, post link retained' });
    } catch (error) {
        console.error('Error removing media:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes - Twitter Integration
const twitterAPI = {
    fetchUserId: async (username, bearerToken) => {
        const response = await axios.get(`https://api.twitter.com/2/users/by/username/${username}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        return response.data.data.id;
    },

    fetchTweetsFromUser: async (userId, bearerToken) => {
        const response = await axios.get(`https://api.twitter.com/2/users/${userId}/tweets`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` },
            params: { max_results: 10 }
        });
        return response.data;
    }
};

app.post('/api/tweets', authenticateToken, async (req, res) => {
    const { username: twitterUsername } = req.body;
    const bearerToken = "AAAAAAAAAAAAAAAAAAAAAG9%2BxgEAAAAAtjKb7XVERP0DVHozG3IHPO6LzdY%3DLLC1iZj2xdpGLAgrLUAZeOmMIPpI0HLpHN5qeqY7Blvba1YQnI";

    if (!bearerToken) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const userId = await twitterAPI.fetchUserId(twitterUsername, bearerToken);
        const response = await twitterAPI.fetchTweetsFromUser(userId, bearerToken);
        const tweetIds = response.data.map(tweet => tweet.id);
        
        const filePath = getUserFilePath(req.user.username, 'links');
        const data = fs.readFileSync(filePath, 'utf8');
        let links = JSON.parse(data);

        tweetIds.forEach(id => {
            links.push({
                postLink: `https://twitter.com/i/status/${id}`,
                videoLinks: `https://d.fixupx.com/i/status/${id}.mp4`
            });
        });

        fs.writeFileSync(filePath, JSON.stringify(links, null, 2), 'utf8');
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching tweets:', error);
        res.status(500).json({ error: 'Failed to fetch tweets' });
    }
});

// API Routes - Scraping Management
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

    try {
        const data = fs.readFileSync(filePath, 'utf8');
        let links = JSON.parse(data);

        if (links.includes(url)) {
            return res.status(400).json({ message: 'URL already exists' });
        }

        links.push(url);
        fs.writeFileSync(filePath, JSON.stringify(links, null, 2), 'utf8');
        res.status(200).json({ message: 'URL saved successfully' });
    } catch (error) {
        console.error('Error saving scrape URL:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes - Media Access
app.get('/api/media', authenticateToken, (req, res) => {
    const filePath = getUserFilePath(req.user.username, 'links');
    
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf8');
        return res.json([]);
    }
    
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const links = JSON.parse(data);
        const validLinks = links.filter(link => link && link.postLink && link.videoLinks);
        res.json(validLinks);
    } catch (error) {
        console.error('Error reading media:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/media/latest', authenticateToken, (req, res) => {
    const filePath = getUserFilePath(req.user.username, 'links');
    const count = parseInt(req.query.count) || 10;
    
    if (!fs.existsSync(filePath)) {
        return res.json([]);
    }
    
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const links = JSON.parse(data);
        const validLinks = links.filter(link => link && link.postLink && link.videoLinks);
        const latestLinks = validLinks.slice(-count);
        res.json(latestLinks);
    } catch (error) {
        console.error('Error fetching latest media:', error);
        res.status(500).json({ error: 'Failed to fetch latest media' });
    }
});

// API Routes - Import/Export
app.get('/api/export-links', authenticateToken, (req, res) => {
    const filePath = getUserFilePath(req.user.username, 'links');
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.json([]);
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

app.get('/api/export-scrape-list', authenticateToken, (req, res) => {
    const filePath = getUserFilePath(req.user.username, 'scrape-links');
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.json([]);
        }
        
        const data = fs.readFileSync(filePath, 'utf8');
        const links = JSON.parse(data);
        res.json(links);
    } catch (error) {
        console.error('Error exporting scrape list:', error);
        res.status(500).json({ error: 'Failed to export scrape list' });
    }
});

app.post('/api/import-scrape-list', authenticateToken, async (req, res) => {
    const filePath = getUserFilePath(req.user.username, 'scrape-links');
    
    try {
        const newLinks = req.body;
        
        if (!Array.isArray(newLinks)) {
            return res.status(400).json({ error: 'Invalid format: expected array' });
        }

        const validLinks = newLinks.filter(link => 
            typeof link === 'string' && 
            (link.startsWith('http://') || link.startsWith('https://'))
        );

        if (validLinks.length === 0) {
            return res.status(400).json({ error: 'No valid URLs found in import file' });
        }

        fs.writeFileSync(filePath, JSON.stringify(validLinks, null, 2), 'utf8');
        await scrapeSavedLinks(req.user.username);
        
        res.json({ 
            message: 'Scrape list replaced and scraping started', 
            total: validLinks.length
        });
    } catch (error) {
        console.error('Error importing scrape list:', error);
        res.status(500).json({ error: 'Failed to import scrape list' });
    }
});

// API Routes - Similar Content
app.post('/api/similar', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const username = req.user.username;

    try {
        if (!url) {
            return res.status(400).json({ message: 'URL is required' });
        }
        
        // Fix: There seems to be a missing testScraper reference
        // Assuming it's a module like scrapeVideos and should be imported
        // For now, we'll just use the scrapeVideos function
        
        const userLinksPath = getUserFilePath(username, 'links');
        const initialCount = fs.existsSync(userLinksPath) ? 
            JSON.parse(fs.readFileSync(userLinksPath, 'utf8')).length : 0;

        await scrapeVideos(url, null, username);
        
        const finalCount = fs.existsSync(userLinksPath) ? 
            JSON.parse(fs.readFileSync(userLinksPath, 'utf8')).length : 0;
        
        const count = finalCount - initialCount;

        res.status(200).json({ 
            message: count > 0 ? 'Similar posts found successfully' : 'No new similar posts found', 
            count 
        });
    } catch (error) {
        console.error('Error finding similar posts:', error);
        res.status(500).json({ 
            message: error.message || 'Failed to find similar posts'
        });
    }
});

// Health check and API information endpoints
app.get('/api/health', (req, res) => {
    console.log('❤️ Health check request received');
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Kupo-Nuts API server is running',
        endpoints: ['/api/login', '/api/register', '/api/media', '/api/profile']
    });
});

// Static file serving
app.use(express.static(path.join(__dirname, '../build')));

// Client-side routing support
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} | Data dir: ${getDataDir()}`);
});