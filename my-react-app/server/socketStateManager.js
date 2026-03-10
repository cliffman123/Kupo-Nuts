// File: my-react-app/server/socketStateManager.js

const SOCKET_STATES = {
    CONNECTED: 'connected',
    SCRAPING: 'scraping',
    DISCONNECTING: 'disconnecting'
};

class SocketStateManager {
    constructor() {
        this.socketStates = new Map(); // socketId -> { state, scrapeAbortController, startTime }
    }

    /**
     * Initialize a socket when it connects
     */
    initializeSocket(socketId) {
        this.socketStates.set(socketId, {
            state: SOCKET_STATES.CONNECTED,
            scrapeAbortController: null,
            startTime: Date.now(),
            url: null
        });
        console.log(`🔌 Socket initialized: ${socketId} -> ${SOCKET_STATES.CONNECTED}`);
    }

    /**
     * Transition socket to SCRAPING state
     */
    setScraping(socketId, abortController, url) {
        const socketData = this.socketStates.get(socketId);
        if (!socketData) {
            console.warn(`⚠️  Socket ${socketId} not found when setting to SCRAPING`);
            return false;
        }
        
        socketData.state = SOCKET_STATES.SCRAPING;
        socketData.scrapeAbortController = abortController;
        socketData.url = url;
        console.log(`🔄 Socket ${socketId} -> ${SOCKET_STATES.SCRAPING} (URL: ${url})`);
        return true;
    }

    /**
     * Transition socket to DISCONNECTING state
     */
    setDisconnecting(socketId) {
        const socketData = this.socketStates.get(socketId);
        if (!socketData) {
            console.warn(`⚠️  Socket ${socketId} not found when setting to DISCONNECTING`);
            return false;
        }
        
        socketData.state = SOCKET_STATES.DISCONNECTING;
        console.log(`❌ Socket ${socketId} -> ${SOCKET_STATES.DISCONNECTING}`);
        return true;
    }

    /**
     * Get current state of a socket
     */
    getState(socketId) {
        const socketData = this.socketStates.get(socketId);
        return socketData ? socketData.state : null;
    }

    /**
     * Get all socket data for a given socketId
     */
    getSocketData(socketId) {
        return this.socketStates.get(socketId);
    }

    /**
     * Check if socket is currently scraping
     */
    isScraping(socketId) {
        return this.getState(socketId) === SOCKET_STATES.SCRAPING;
    }

    /**
     * Check if socket exists
     */
    socketExists(socketId) {
        return this.socketStates.has(socketId);
    }

    /**
     * Remove socket from state manager
     */
    removeSocket(socketId) {
        const socketData = this.socketStates.get(socketId);
        
        // If socket was scraping, abort the scrape operation
        if (socketData && socketData.state === SOCKET_STATES.SCRAPING) {
            if (socketData.scrapeAbortController) {
                console.log(`⏹️  Aborting scrape for socket ${socketId}`);
                socketData.scrapeAbortController.abort();
            }
        }
        
        // Get duration for logging
        const duration = socketData ? ((Date.now() - socketData.startTime) / 1000).toFixed(2) : 'unknown';
        
        this.socketStates.delete(socketId);
        console.log(`🗑️  Socket removed: ${socketId} (Connected for ${duration}s)`);
    }

    /**
     * Get all active sockets
     */
    getAllActiveSockets() {
        return Array.from(this.socketStates.entries()).map(([socketId, data]) => ({
            socketId,
            ...data
        }));
    }

    /**
     * Get count of sockets in each state
     */
    getStateStats() {
        const stats = {
            [SOCKET_STATES.CONNECTED]: 0,
            [SOCKET_STATES.SCRAPING]: 0,
            [SOCKET_STATES.DISCONNECTING]: 0,
            total: this.socketStates.size
        };
        
        this.socketStates.forEach(data => {
            stats[data.state]++;
        });
        
        return stats;
    }
}

module.exports = {
    SocketStateManager,
    SOCKET_STATES
};