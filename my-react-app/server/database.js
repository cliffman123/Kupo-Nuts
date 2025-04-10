const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Determine the appropriate data directory
const getDataDir = () => {
    // For Docker environments, use a directory we know is writable
    let dataDir;
    
    if (process.env.RENDER_SERVICE_NAME) {
        dataDir = path.join(__dirname, '../../data');
    } else {
        dataDir = path.join(__dirname, '../data');
    }
        
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    return dataDir;
};

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(getDataDir(), 'database.sqlite'), // Store the database file in a writable directory
    logging: false // Disable logging for cleaner output
});

// Define the User model
const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    }
}, {
    tableName: 'users', // Specify the table name
    timestamps: false // Disable automatic timestamps
});

// Function to initialize the database
const initializeDatabase = async () => {
    try {
        await sequelize.authenticate();
        console.log('Connection to the database has been established successfully.');
        console.log(`Using database at: ${path.join(getDataDir(), 'database.sqlite')}`);
        await sequelize.sync(); // This creates the table if it doesn't exist (and does nothing if it already exists)
        console.log('Database synced successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
};

module.exports = {
    sequelize,
    User,
    initializeDatabase,
    getDataDir
};