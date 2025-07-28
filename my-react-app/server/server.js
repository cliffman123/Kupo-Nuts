require('dotenv').config(); // Ensure this is at the top
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { scrapeVideos } = require('./scraper');
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
        allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'x-guest-id']
    }
});

// Socket.IO connection handling with cleanup
io.on('connection', (socket) => {
    console.log(`New WebSocket connection: ${socket.id} (Total: ${io.engine.clientsCount})`);
    
    // Set a timeout to automatically disconnect idle sockets
    const idleTimeout = setTimeout(() => {
        console.log(`Disconnecting idle socket: ${socket.id}`);
        socket.disconnect(true);
    }, 30 * 60 * 1000); // 30 minutes
    
    // Clear timeout on any activity
    socket.onAny(() => {
        clearTimeout(idleTimeout);
    });
    
    socket.on('disconnect', (reason) => {
        clearTimeout(idleTimeout);
        console.log(`WebSocket disconnected: ${socket.id} (Reason: ${reason}, Remaining: ${io.engine.clientsCount - 1})`);
    });
    
    // Handle socket errors
    socket.on('error', (error) => {
        console.error(`Socket error on ${socket.id}:`, error);
        clearTimeout(idleTimeout);
        socket.disconnect(true);
    });
});

// Simple system monitoring function
const logSystemStats = () => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Memory stats in MB
    const memStats = {
        rss: (memUsage.rss / 1024 / 1024).toFixed(2),
        heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
        external: (memUsage.external / 1024 / 1024).toFixed(2)
    };
    
    // CPU stats in milliseconds
    const cpuStats = {
        user: (cpuUsage.user / 1000).toFixed(2),
        system: (cpuUsage.system / 1000).toFixed(2)
    };
    
    console.log(`📊 Hourly Stats - Memory: RSS=${memStats.rss}MB, Heap=${memStats.heapUsed}/${memStats.heapTotal}MB, External=${memStats.external}MB | CPU: User=${cpuStats.user}ms, System=${cpuStats.system}ms | Uptime: ${(process.uptime() / 3600).toFixed(2)}h`);
};

// Log system stats every hour
setInterval(logSystemStats, 60 * 60 * 1000); // Every hour

// Helper function for creating progress callbacks
const createProgressCallback = (socketId, eventName) => {
    return (count, message, isComplete = false, newItems = []) => {
        const limitedNewItems = newItems ? newItems.slice(0, 50) : [];
        const targetSocket = io.sockets.sockets.get(socketId);
        
        if (targetSocket) {
            targetSocket.emit(eventName, {
                count,
                message: message || `Found ${count} items`,
                isComplete,
                newItems: limitedNewItems
            });
            
            // Clear newItems from memory
            if (newItems && newItems.length > 0) {
                newItems.length = 0;
            }
        }
    };
};

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

// API Routes - Media Management
app.post('/api/scrape', async (req, res) => {
    const { url, socketId, contentType } = req.body;

    try {
        console.log(`Starting scrape for socket ${socketId} with URL: ${url}, contentType: ${contentType}`);

        const progressCallback = createProgressCallback(socketId, 'scrape_progress');
        const result = await scrapeVideos(url, null, null, progressCallback, { skipSave: true, contentType });

        progressCallback(result.linksAdded, 'Scraping completed successfully', true);

        res.status(200).json({
            message: 'Scraping successful - results sent via WebSocket',
            linksAdded: result.linksAdded,
        });
    } catch (error) {
        console.error('Error scraping videos:', error);
        res.status(500).json({ message: 'Scraping failed', error: error.message });
    }
});

// Add new endpoint to simulate server responses for local storage operations
// This allows us to keep the WebSocket architecture for non-logged in users
app.post('/api/local-operation', (req, res) => {
    const { operation, socketId, data } = req.body;
    
    if (!socketId) {
        return res.status(400).json({ message: 'Socket ID is required' });
    }
    
    try {
        // Find the specific socket
        const targetSocket = io.sockets.sockets.get(socketId);
        
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
        
        // Emit to the specific socket
        if (targetSocket) {
            targetSocket.emit(`${operation}_progress`, emitData);
            console.log(`Emitted ${operation}_progress to socket ${socketId}`);
        } else {
            console.log(`No active socket found for ID ${socketId}`);
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

// API Routes - Similar Content
app.post('/api/similar', async (req, res) => {
    const { url, socketId, contentType } = req.body;

    try {
        if (!url) {
            return res.status(400).json({ message: 'URL is required' });
        }
        
        console.log(`Similar search request for socket ${socketId}: URL=${url}, contentType=${contentType}`);
        
        const progressCallback = createProgressCallback(socketId, 'similar_progress');
        const result = await scrapeVideos(url, null, null, progressCallback, { skipSave: true, contentType });

        progressCallback(result.linksAdded, result.linksAdded > 0 ? 'Similar posts found successfully' : 'No similar posts found', true);

        res.status(200).json({ 
            message: result.linksAdded > 0 ? 'Similar posts found successfully - results sent via WebSocket' : 'No similar posts found', 
            count: result.linksAdded 
        });
    } catch (error) {
        console.error('Error finding similar posts:', error);
        res.status(500).json({ 
            message: error.message || 'Failed to find similar posts'
        });
    }
});

app.post('/api/search-tags', async (req, res) => {
    const { query, contentType, socketId } = req.body;

    try {
        console.log(`Tag search request for socket ${socketId}: tag="${query}", contentType=${contentType}`);
        
        if (!query || query.trim() === '') {
            return res.status(400).json({
                message: 'Search query is required',
                count: 0,
                media: []
            });
        }
        
        // Create progress callback for WebSocket updates
        const progressCallback = createProgressCallback(socketId, 'tag_search_progress');
        
        // Generate search URLs based on content type
        const getSearchUrls = (query, contentType) => {
            const encodedQuery = encodeURIComponent(query.trim());
            const hyphenQuery = query.trim().replace(/\s+/g, '-');
            
            return contentType === 0 
                ? [`https://safebooru.donmai.us/posts?tags=${encodedQuery}&z=2`]
                : [`https://kusowanka.com/tag/${hyphenQuery}/`];
        };
        
        const urlsToScrape = getSearchUrls(query, contentType);
        
        console.log(`Using search URLs: ${urlsToScrape.join(', ')}`);
        progressCallback(0, 'Starting tag search across multiple sites...');
        
        let totalItemsAdded = 0;
        
        for (const [index, url] of urlsToScrape.entries()) {
            const siteName = new URL(url).hostname;
            
            try {
                progressCallback(totalItemsAdded, `Searching site ${index + 1} of ${urlsToScrape.length}: ${siteName}`);
                
                const result = await scrapeVideos(url, null, null, (count, message, isComplete, newItems = []) => {
                    const siteProgressMessage = `${siteName}: ${message || `Found ${count} items`}`;
                    progressCallback(totalItemsAdded + count, siteProgressMessage, false, newItems);
                }, { skipSave: true, contentType });
                
                totalItemsAdded += result.linksAdded || 0;
                progressCallback(totalItemsAdded, `Completed search on ${siteName}, found ${totalItemsAdded} items so far`);
            } catch (error) {
                console.error(`Error scraping ${siteName}:`, error);
            }
        }
        
        progressCallback(totalItemsAdded, 
            totalItemsAdded > 0 ? 'Tag search completed successfully across all sites' : 'No results found for tag search',
            true);
        
        res.status(200).json({
            message: totalItemsAdded > 0 ? 'Tag search completed successfully - results sent via WebSocket' : 'No results found for tag search',
            count: totalItemsAdded,
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

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Kupo-Nuts API server is running',
        endpoints: ['/api/scrape', '/api/similar', '/api/search-tags', '/api/local-operation', '/api/health'],
        websocket: 'Socket.IO enabled for real-time communication'
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
                <p>API endpoints are available for scraping and WebSocket communication.</p>
            </body>
        </html>
    `);
});

// Start server - use the HTTP server instance with Socket.IO
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} with WebSocket support | Data dir: ${getDataDir()}`);
    console.log(`🚀 Server started successfully`);
    
    // Log initial system stats
    logSystemStats();
});

// Add graceful shutdown handling to prevent lingering processes
const gracefulShutdown = () => {
    console.log('\n🔄 Received shutdown signal, cleaning up...');
    
    // Close WebSocket connections
    io.close(() => {
        console.log('✅ WebSocket connections closed');
    });
    
    // Close HTTP server
    server.close(() => {
        console.log('✅ HTTP server closed');
        
        // Force process exit after 5 seconds if still hanging
        setTimeout(() => {
            console.log('⚠️  Force exiting process...');
            process.exit(0);
        }, 5000);
    });
};

// Handle different shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);  // Ctrl+C
process.on('SIGHUP', gracefulShutdown);  // Terminal close

// Handle uncaught exceptions to prevent zombie processes
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown();
});