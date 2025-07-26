require('dotenv').config(); // Ensure this is at the top
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const passwordUtils = require('./passwordUtils');
const jwt = require('jsonwebtoken');
// Removing the session import as we're not using it
const cookieParser = require('cookie-parser');
const { scrapeVideos } = require('./scraper');
const axios = require('axios');
const { sequelize, User, initializeDatabase } = require('./database'); // Import the database
// Add Socket.IO for real-time updates
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server instance
const server = http.createServer(app);

// Initialize Socket.IO with CORS options that match Express
const io = socketIo(server, {
    cors: {
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.log(`Socket.IO: Origin not in allowed list: ${origin}`);
                callback(null, false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-guest-id']
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`New WebSocket connection: ${socket.id}`);
    
    // Set user information when they authenticate
    socket.on('authenticate', (userData) => {
        if (userData.isGuest) {
            // Support for non-logged in users with guest IDs
            socket.guestId = userData.guestId;
            socket.isGuest = true;
            console.log(`Guest authenticated on socket with ID: ${userData.guestId.substring(0, 8)}...`);
        } else {
            // Regular user authentication
            socket.username = userData.username;
            socket.isGuest = false;
            console.log(`User authenticated on socket: ${socket.username}`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`WebSocket disconnected: ${socket.id}`);
    });
});

// Constants
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// In-memory storage
const loginAttempts = {};

// Add a cleanup function for loginAttempts
const cleanupLoginAttempts = () => {
    const currentTime = Date.now();
    const staleTime = LOCKOUT_TIME * 2; // Remove entries older than 2x lockout time
    
    Object.keys(loginAttempts).forEach(ip => {
        if (currentTime - loginAttempts[ip].lastAttempt > staleTime) {
            delete loginAttempts[ip];
        }
    });
};

// Run cleanup every hour
setInterval(cleanupLoginAttempts, 60 * 60 * 1000);

// Memory monitoring functions
const getServerMemoryUsage = () => {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss, // Resident Set Size - total memory allocated
        heapTotal: usage.heapTotal, // Total heap allocated
        heapUsed: usage.heapUsed, // Heap actually used
        external: usage.external, // External memory
        rssMB: (usage.rss / 1024 / 1024).toFixed(2),
        heapTotalMB: (usage.heapTotal / 1024 / 1024).toFixed(2),
        heapUsedMB: (usage.heapUsed / 1024 / 1024).toFixed(2),
        externalMB: (usage.external / 1024 / 1024).toFixed(2),
        heapUsagePercent: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2)
    };
};

const isServerMemoryLow = () => {
    const usage = process.memoryUsage();
    // Consider memory "low" if heap usage is above 80% or RSS is above 500MB
    const heapUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;
    const rssMB = usage.rss / 1024 / 1024;
    
    return heapUsagePercent > 80 || rssMB > 500;
};

const logMemoryUsage = () => {
    const memory = getServerMemoryUsage();
    console.log(`Memory Usage - RSS: ${memory.rssMB}MB, Heap: ${memory.heapUsedMB}/${memory.heapTotalMB}MB (${memory.heapUsagePercent}%)`);
};

// Log memory usage every 5 minutes
setInterval(logMemoryUsage, 5 * 60 * 1000);

// Helper functions for file paths and user data
const getDataDir = () => {
    let renderDataDir;
    
    if (process.env.RENDER_SERVICE_NAME) {
        renderDataDir = path.join(__dirname, '../../data');
    } else {
        renderDataDir = path.join(__dirname, '../../data');
    }
        
    if (!fs.existsSync(renderDataDir)) {
        fs.mkdirSync(renderDataDir, { recursive: true, mode: 0o755 });
    }
    
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
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-guest-id']
};

// Apply CORS middleware
app.use(cors(corsOptions));

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(cookieParser());

// Middleware for authentication with guest support
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;

    if (token) {
        try {
            const user = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
            req.user = user;
            req.isGuest = false;

            // Retrieve the user from the database
            User.findOne({ where: { username: user.username } })
                .then(existingUser => {
                    if (!existingUser) {
                        return res.status(401).json({ message: 'User not found' });
                    }

                    req.user = existingUser; // Attach the user object from the database to the request

                    return next(); // User is authenticated via token, proceed
                })
                .catch(err => {
                    console.error('Database error:', err);
                    return res.status(500).json({ message: 'Database error' });
                });

        } catch (err) {
            console.error('Token verification error:', err);
            res.clearCookie('token', getCookieOptions());
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
    } else {
        // Check for guest ID in request if no valid token
        const guestId = req.headers['x-guest-id'];
        console.log(`Guest ID from header: ${guestId}`);
        if (guestId) {
            req.isGuest = true;
            req.guestId = guestId;
            // For certain public endpoints, allow guests through
            if (req.path.includes('/api/scrape') || req.path.includes('/api/similar') || req.path.includes('/api/search-tags') || req.path.includes('/api/local-operation')) {
                return next();
            }
        } else {
            return res.status(401).json({ message: 'Authentication required' });
        }
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

        // Check if the user already exists in the database
        const existingUser = await User.findOne({ where: { username: username } });
        if (existingUser) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        const hashedPassword = await passwordUtils.hash(password);

        // Create the user in the database
        await User.create({
            username: username,
            password: hashedPassword
        });

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
        
        loginAttempts[ip] = loginAttempts[ip] || { attempts: 0, lastAttempt: Date.now() };

        if (!username || !password) {
            loginAttempts[ip].attempts++;
            loginAttempts[ip].lastAttempt = Date.now();
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Retrieve the user from the database
        const user = await User.findOne({ where: { username: username } });
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

        loginAttempts[ip].attempts = 0;

        const token = jwt.sign(
            { username: user.username }, // Use the username from the database
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
    
    res.json({ message: 'Logout successful' });
});

// Add the verify-auth endpoint
app.get('/api/verify-auth', (req, res) => {
    const token = req.cookies.token;
    
    // Check for development mode auto-login
    if (process.env.NODE_ENV === 'development' && req.query.dev === 'true') {
        // In development mode, auto-login as admin
        console.log('Development mode auto-login activated');
        
        // Check if user exists in database first
        User.findOne({ where: { username: 'admin' } }).then(existingUser => {
            if (!existingUser) {
                // Create admin user if it doesn't exist
                console.log('Creating admin user for development mode');
                const hashedPassword = require('bcryptjs').hashSync('AdminPassword123!', 10);
                User.create({
                    username: 'admin',
                    password: hashedPassword
                }).then(newUser => {
                    initializeUserFiles('admin');
                    const devToken = jwt.sign(
                        { username: 'admin' },
                        process.env.JWT_SECRET || 'your-jwt-secret',
                        { expiresIn: '24h' }
                    );
                    res.cookie('token', devToken, getCookieOptions());
                    return res.status(200).json({ username: 'admin', devMode: true });
                }).catch(err => {
                    console.error('Error creating admin user:', err);
                    return res.status(500).json({ message: 'Error creating admin user' });
                });
            } else {
                // Admin user exists, create a token
                const devToken = jwt.sign(
                    { username: 'admin' },
                    process.env.JWT_SECRET || 'your-jwt-secret',
                    { expiresIn: '24h' }
                );
                res.cookie('token', devToken, getCookieOptions());
                return res.status(200).json({ username: 'admin', devMode: true });
            }
        }).catch(err => {
            console.error('Database error checking for admin user:', err);
            return res.status(500).json({ message: 'Database error' });
        });
        return;
    }
    
    if (!token) {
        return res.status(401).json({ message: 'No authentication token found' });
    }
    
    try {
        const user = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
        
        // Retrieve the user from the database
        User.findOne({ where: { username: user.username } }).then(existingUser => {
            if (!existingUser) {
                return res.status(401).json({ message: 'User not found' });
            }
            
            // Authentication successful
            console.log(`User ${user.username} verified via token`);
            res.status(200).json({ username: user.username });
        }).catch(err => {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Database error' });
        });
    } catch (err) {
        console.error('Token verification error:', err);
        res.clearCookie('token', getCookieOptions());
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
});

// API Routes - User Profile
app.get('/api/profile', authenticateToken, (req, res) => {
    res.json({ username: req.user.username });
});

// API Routes - Media Management
app.post('/api/scrape', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const username = req.user ? req.user.username : null;
    const isGuest = req.isGuest;
    const guestId = req.guestId;

    try {
        console.log(`Starting scrape for ${isGuest ? `guest ${guestId}` : `user ${username}`} with URL: ${url}`);

        // Check server memory before starting scrape
        if (isServerMemoryLow()) {
            const memoryInfo = getServerMemoryUsage();
            const errorMessage = `Server memory usage is high (${memoryInfo.heapUsedMB}MB/${memoryInfo.heapTotalMB}MB, ${memoryInfo.heapUsagePercent}%). Scraping temporarily disabled.`;
            console.warn(errorMessage);
            
            return res.status(503).json({
                error: 'Server memory limit reached',
                message: 'Server memory usage is too high. Please try again later.',
                memoryUsage: {
                    heapUsedMB: memoryInfo.heapUsedMB,
                    heapTotalMB: memoryInfo.heapTotalMB,
                    heapUsagePercent: memoryInfo.heapUsagePercent
                }
            });
        }

        // Create a progress callback that emits WebSocket events
        const progressCallback = (count, message, isComplete = false, newItems = []) => {
            // Check memory during scraping and warn if getting high
            if (isServerMemoryLow() && !isComplete) {
                const memoryInfo = getServerMemoryUsage();
                console.warn(`High memory usage during scraping: ${memoryInfo.heapUsedMB}MB (${memoryInfo.heapUsagePercent}%)`);
                
                // Send memory warning to client
                const userSockets = Array.from(io.sockets.sockets.values())
                    .filter(s => {
                        if (isGuest) {
                            return s.guestId === guestId;
                        } else {
                            return s.username === username;
                        }
                    });

                if (userSockets.length > 0) {
                    userSockets.forEach(socket => {
                        socket.emit('scrape_memory_warning', {
                            message: `Server memory usage is high (${memoryInfo.heapUsagePercent}%). Scraping may slow down or stop.`,
                            memoryUsage: memoryInfo
                        });
                    });
                }
            }
            
            const userSockets = Array.from(io.sockets.sockets.values())
                .filter(s => {
                    if (isGuest) {
                        return s.guestId === guestId;
                    } else {
                        return s.username === username;
                    }
                });

            if (userSockets.length > 0) {
                userSockets.forEach(socket => {
                    socket.emit('scrape_progress', {
                        count,
                        message: message || `Found ${count} items`,
                        isComplete,
                        newItems
                    });
                });
            }
        };

        // For guests, attempt a real scrape but don't save to server
        if (isGuest) {
            try {
                // Use scrapeVideos with skipSave option for guests
                const result = await scrapeVideos(url, null, null, progressCallback, { skipSave: true });

                return res.status(200).json({
                    message: 'Guest scraping initiated - results will be saved to your browser',
                    guestId: guestId,
                    linksAdded: result.linksAdded
                });
            } catch (error) {
                console.error('Error with guest scraping:', error);
                return res.status(500).json({
                    message: 'Scraping failed',
                    error: error.message
                });
            }
        }

        // Normal scraping for authenticated users - explicitly set skipSave to false
        const result = await scrapeVideos(url, null, username, progressCallback, { skipSave: false });
        console.log('Scrape completed with result:', result);

        // Final update via WebSocket
        progressCallback(result.linksAdded, 'Scraping completed successfully', true);

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
        
        const updatedLinks = links.map(link => {
            if (link.postLink === postLink) {
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

app.post('/api/clear-collection', authenticateToken, async (req, res) => {
    const username = req.user ? req.user.username : null;
    const isGuest = req.isGuest;
    const guestId = req.guestId;

    try {
        if (isGuest) {
            return res.status(403).json({ message: 'Clearing collection is not allowed for guest users.' });
        }

        const filePath = getUserFilePath(username, 'links');
        fs.writeFileSync(filePath, '[]', 'utf8');
        res.status(200).json({ message: 'Collection cleared successfully' });
    } catch (error) {
        console.error('Error clearing collection:', error);
        res.status(500).json({ message: 'Failed to clear collection', error: error.message });
    }
});

// Add new endpoint to simulate server responses for local storage operations
// This allows us to keep the WebSocket architecture for non-logged in users
app.post('/api/local-operation', (req, res) => {
    const { operation, guestId, data } = req.body;
    
    if (!guestId) {
        return res.status(400).json({ message: 'Guest ID is required' });
    }
    
    try {
        // Find all sockets for this guest
        const guestSockets = Array.from(io.sockets.sockets.values())
            .filter(s => s.isGuest && s.guestId === guestId);
        
        let response = { success: true };
        let emitData = { ...data };
        
        // Add simulated server-side processing based on operation type
        switch (operation) {
            case 'scrape':
                emitData = {
                    count: 1,
                    message: 'Added to local collection',
                    isComplete: true,
                    newItems: data.items || []
                };
                break;
                
            case 'tag_search':
                emitData = {
                    count: data.matchingItems?.length || 0,
                    message: `Found ${data.matchingItems?.length || 0} local items with tag: ${data.query}`,
                    isComplete: true,
                    newItems: data.matchingItems || []
                };
                break;
                
            case 'remove':
                emitData = {
                    count: 1,
                    message: 'Removed from local collection',
                    isComplete: true
                };
                break;
                
            default:
                emitData = {
                    message: 'Operation processed',
                    isComplete: true
                };
        }
        
        // Emit to all guest's sockets
        if (guestSockets.length > 0) {
            guestSockets.forEach(socket => {
                socket.emit(`${operation}_progress`, emitData);
            });
            
            console.log(`Emitted ${operation}_progress to ${guestSockets.length} socket(s) for guest ${guestId.substring(0, 8)}...`);
        } else {
            console.log(`No active sockets found for guest ${guestId.substring(0, 8)}...`);
        }
        
        res.status(200).json(response);
    } catch (error) {
        console.error(`Error in local-operation (${operation}):`, error);
        res.status(500).json({ 
            message: `Error processing local ${operation}`,
            error: error.message
        });
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
const scrapeSavedLinks = async (username, progressCallback) => {
    const filePath = getUserFilePath(username, 'scrape-links');
    if (!fs.existsSync(filePath)) {
        throw new Error('scrape-links.json file not found for user');
    }

    const data = fs.readFileSync(filePath, 'utf8');
    const links = JSON.parse(data);

    for (const link of links) {
        try {
            await scrapeVideos(link, null, username, progressCallback);
        } catch (error) {
            console.error(`Error scraping link ${link}:`, error);
        }
    }
};

app.post('/api/scrape-saved-links', authenticateToken, async (req, res) => {
    try {
        const progressCallback = (count, message, isComplete = false, newItems = []) => {
            const userSockets = Array.from(io.sockets.sockets.values())
                .filter(s => s.username === req.user.username);
                
            if (userSockets.length > 0) {
                userSockets.forEach(socket => {
                    socket.emit('scrape_progress', {
                        count,
                        message: message || `Processed ${count} saved links`,
                        isComplete,
                        newItems
                    });
                });
            }
        };
        
        await scrapeSavedLinks(req.user.username, progressCallback);
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

app.post('/api/import-links', authenticateToken, async (req, res) => {
    const { body: links } = req;
    const username = req.user ? req.user.username : null;
    const isGuest = req.isGuest;
    const guestId = req.guestId;

    try {
        if (!links || !Array.isArray(links)) {
            return res.status(400).json({ message: 'Invalid data format. Expected an array of links.' });
        }

        if (isGuest) {
            return res.status(403).json({ message: 'Importing links is not allowed for guest users.' });
        }

        const filePath = getUserFilePath(username, 'links');
        let existingLinks = [];

        if (fs.existsSync(filePath)) {
            existingLinks = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }

        const newLinks = links.filter(link => {
            return !existingLinks.some(existingLink => existingLink.postLink === link.postLink);
        });

        const allLinks = [...existingLinks, ...newLinks];

        fs.writeFileSync(filePath, JSON.stringify(allLinks, null, 2), 'utf8');

        res.status(200).json({ message: `Successfully imported ${newLinks.length} new links.` });
    } catch (error) {
        console.error('Error importing links:', error);
        res.status(500).json({ message: 'Failed to import links', error: error.message });
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
    const username = req.user ? req.user.username : null;
    const isGuest = req.isGuest;
    const guestId = req.guestId;

    try {
        if (!url) {
            return res.status(400).json({ message: 'URL is required' });
        }
        
        // Create progress callback for WebSocket updates
        const progressCallback = (count, message, isComplete = false, newItems = []) => {
            const userSockets = Array.from(io.sockets.sockets.values())
                .filter(s => {
                    if (isGuest) {
                        return s.guestId === guestId;
                    } else {
                        return s.username === username;
                    }
                });
                
            if (userSockets.length > 0) {
                userSockets.forEach(socket => {
                    socket.emit('similar_progress', {
                        count,
                        message: message || `Found ${count} similar items`,
                        isComplete,
                        newItems
                    });
                });
            }
        };

        // For guests, perform actual scraping but skip server-side saving
        if (isGuest) {
            try {
                const result = await scrapeVideos(url, null, null, progressCallback, { skipSave: true });

                return res.status(200).json({
                    message: 'Guest similar search initiated - results will be saved to your browser',
                    count: result.linksAdded
                });
            } catch (error) {
                console.error('Error with guest similar search:', error);
                return res.status(500).json({
                    message: 'Failed to find similar posts',
                    error: error.message
                });
            }
        }

        // Normal processing for authenticated users - explicitly set skipSave to false
        const initialCount = fs.existsSync(getUserFilePath(username, 'links')) ? 
            JSON.parse(fs.readFileSync(getUserFilePath(username, 'links'), 'utf8')).length : 0;

        await scrapeVideos(url, null, username, progressCallback, { skipSave: false });

        const finalCount = fs.existsSync(getUserFilePath(username, 'links')) ? 
            JSON.parse(fs.readFileSync(getUserFilePath(username, 'links'), 'utf8')).length : 0;

        const count = finalCount - initialCount;
        
        // Final update via WebSocket
        progressCallback(count, count > 0 ? 'Similar posts found successfully' : 'No new similar posts found', true);

        res.status(200).json({ 
            message: count > 0 ? 'Similar posts found successfully' : 'No new similar posts found', 
            count 
        });
    } 
    catch (error) {
        console.error('Error finding similar posts:', error);
        res.status(500).json({ 
            message: error.message || 'Failed to find similar posts'
        });
    }
});

app.post('/api/search-tags', authenticateToken, async (req, res) => {
    const { query, contentType } = req.body;
    const username = req.user ? req.user.username : null;
    const isGuest = req.isGuest;
    const guestId = req.guestId;

    try {
        console.log(`Tag search request from ${isGuest ? `guest ${guestId}` : `user ${username}`}: tag="${query}", contentType=${contentType}`);
        
        if (!query || query.trim() === '') {
            return res.status(400).json({
                message: 'Search query is required',
                count: 0,
                media: []
            });
        }
        
        // Create progress callback for WebSocket updates
        const progressCallback = (count, message, isComplete = false, newItems = []) => {
            const userSockets = Array.from(io.sockets.sockets.values())
                .filter(s => {
                    if (isGuest) {
                        return s.guestId === guestId;
                    } else {
                        return s.username === username;
                    }
                });
                
            if (userSockets.length > 0) {
                userSockets.forEach(socket => {
                    socket.emit('tag_search_progress', {
                        count,
                        message: message || `Found ${count} items for tag: ${query}`,
                        isComplete,
                        newItems // Include the new media items in the event
                    });
                });
            }
        };
        
        // For guests, attempt a real search but don't save to server
        if (isGuest) {
            // Encode the query for use in URL
            const encodedQuery = encodeURIComponent(query.trim());
            
            // Create different formatted versions of the tag for different sites
            const hyphenQuery = query.trim().replace(/\s+/g, '-');
            const underscoreQuery = query.trim().replace(/\s+/g, '_');
            
            // Determine the URLs based on contentType
            let urlsToScrape = [];
            if (contentType === 0) {
                // Safe mode - only use safebooru
                urlsToScrape = [`https://safebooru.donmai.us/posts?tags=${encodedQuery}&z=2`];
            } else {
                // NSFW mode - use multiple sites with different tag formats
                urlsToScrape = [
                    // `https://danbooru.donmai.us/posts?tags=${underscoreQuery}&z=2`,
                    // // `https://kusowanka.com/tag/${hyphenQuery}/`,
                    `https://e621.net/posts?tags=${underscoreQuery}`,
                    `https://r-34.xyz/tag/${underscoreQuery}`,
                ];
            }
            
            try {
                for (const url of urlsToScrape) {
                    // Attempt to scrape each URL but skip saving to server
                    await scrapeVideos(url, null, null, progressCallback, { skipSave: true });
                }
                
                return res.status(200).json({
                    message: 'Guest tag search initiated - results will be saved to your browser',
                    guestId: guestId,
                    query
                });
            } catch (error) {
                console.error('Error with guest tag search:', error);
                return res.status(500).json({
                    message: 'Tag search failed',
                    error: error.message
                });
            }
        }
        
        // Normal tag search process for authenticated users
        const encodedQuery = encodeURIComponent(query.trim());
        
        const hyphenQuery = query.trim().replace(/\s+/g, '-');
        const underscoreQuery = query.trim().replace(/\s+/g, '_');
        
        let urlsToScrape = [];
        if (contentType === 0) {
            urlsToScrape = [`https://safebooru.donmai.us/posts?tags=${encodedQuery}&z=2`];
        } else {
            urlsToScrape = [
                `https://kusowanka.com/tag/${hyphenQuery}/`,
                // `https://e621.net/posts?tags=${underscoreQuery}`,
                // `https://r-34.xyz/tag/${underscoreQuery}`,
            ];
        }
        
        console.log(`Using search URLs: ${urlsToScrape.join(', ')}`);
        
        const userLinksPath = getUserFilePath(username, 'links');
        const initialCount = fs.existsSync(userLinksPath) ? 
            JSON.parse(fs.readFileSync(userLinksPath, 'utf8')).length : 0;
        
        progressCallback(0, 'Starting tag search across multiple sites...');
        
        let totalItemsAdded = 0;
        
        for (let i = 0; i < urlsToScrape.length; i++) {
            const url = urlsToScrape[i];
            const siteName = new URL(url).hostname;
            
            try {
                progressCallback(totalItemsAdded, `Searching site ${i+1} of ${urlsToScrape.length}: ${siteName}`);
                
                const result = await scrapeVideos(url, null, username, (count, message, isComplete, newItems = []) => {
                    const siteProgressMessage = `${siteName}: ${message || `Found ${count} items`}`;
                    progressCallback(totalItemsAdded + count, siteProgressMessage, false, newItems);
                }, { skipSave: false }); // Explicitly set skipSave to false for logged-in users
                
                const currentCount = fs.existsSync(userLinksPath) ? 
                    JSON.parse(fs.readFileSync(userLinksPath, 'utf8')).length : 0;
                    
                totalItemsAdded = currentCount - initialCount;
                
                progressCallback(totalItemsAdded, `Completed search on ${siteName}, found ${totalItemsAdded} items so far`);
            } catch (error) {
                console.error(`Error scraping ${siteName}:`, error);
            }
        }
        
        progressCallback(totalItemsAdded, 
            totalItemsAdded > 0 ? 'Tag search completed successfully across all sites' : 'No results found for tag search',
            true);
        
        let latestMedia = [];
        if (totalItemsAdded > 0) {
            const data = fs.readFileSync(userLinksPath, 'utf8');
            const links = JSON.parse(data);
            latestMedia = links.slice(-totalItemsAdded).map(item => [
                item.postLink || '',
                item.videoLinks,
                item.tags || {}
            ]);
        }
        
        res.status(200).json({
            message: totalItemsAdded > 0 ? 'Tag search completed successfully' : 'No results found for tag search',
            count: totalItemsAdded,
            media: latestMedia,
            query,
            contentType,
            searchedSites: urlsToScrape.length
        });
    } catch (error) {
        console.error('Error during tag search:', error);
        res.status(500).json({
            message: 'Failed to search tags',
            error: error.message
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

// Endpoint to check server memory status
app.get('/api/memory-status', (req, res) => {
    try {
        const memoryInfo = getServerMemoryUsage();
        const isLow = isServerMemoryLow();
        
        res.json({
            memory: memoryInfo,
            isMemoryLow: isLow,
            status: isLow ? 'warning' : 'ok',
            message: isLow ? 'Server memory usage is high' : 'Server memory usage is normal'
        });
    } catch (error) {
        console.error('Error getting memory status:', error);
        res.status(500).json({ error: 'Failed to get memory status' });
    }
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
app.use(express.static(path.join(__dirname, '../../build')));

// Client-side routing support with fallbacks for multiple possible build locations
app.get('*', (req, res) => {
    const buildPaths = [
        path.join(__dirname, '../build/index.html'),
        path.join(__dirname, '../../build/index.html')
    ];
    
    // Try each path until one works
    for (const buildPath of buildPaths) {
        if (fs.existsSync(buildPath)) {
            return res.sendFile(buildPath);
        }
    }
    
    // If no build file exists, return a simple HTML response
    return res.send(`
        <html>
            <head><title>Kupo-Nuts API</title></head>
            <body>
                <h1>Kupo-Nuts API Server</h1>
                <p>The API server is running, but the client build files were not found.</p>
                <p>API endpoints are available at: /api/login, /api/register, etc.</p>
            </body>
        </html>
    `);
});

// Start server - use the HTTP server instance with Socket.IO
server.listen(PORT, '0.0.0.0', async () => {
    await initializeDatabase(); // Initialize the database
    
    // Add clear indication of development mode in server logs
    if (process.env.NODE_ENV === 'development') {
        console.log('\x1b[33m%s\x1b[0m', '🔧 DEVELOPMENT MODE ACTIVE - Auto-login is enabled');
        console.log('\x1b[33m%s\x1b[0m', '🔑 You will be automatically logged in as admin when visiting the site');
    }
    
    console.log(`Server running on port ${PORT} with WebSocket support | Data dir: ${getDataDir()}`);
});