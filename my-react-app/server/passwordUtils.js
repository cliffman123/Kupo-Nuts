const crypto = require('crypto');

/**
 * A cross-platform password utility that uses Node's built-in crypto module
 * instead of platform-specific libraries like bcrypt
 */
const passwordUtils = {
  /**
   * Generate a secure hash of a password
   * @param {string} password - The password to hash
   * @returns {Promise<string>} - The hashed password with salt
   */
  hash: async (password) => {
    // Generate a random salt
    const salt = crypto.randomBytes(16).toString('hex');
    
    // Hash the password with the salt using PBKDF2
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
        if (err) return reject(err);
        // Format: iterations:salt:hash
        resolve(`10000:${salt}:${derivedKey.toString('hex')}`);
      });
    });
  },
  
  /**
   * Verify a password against a hash
   * @param {string} password - The password to verify
   * @param {string} hashedPassword - The stored hash to verify against
   * @returns {Promise<boolean>} - True if password matches, false otherwise
   */
  compare: async (password, hashedPassword) => {
    // Validate input
    if (!hashedPassword || typeof hashedPassword !== 'string' || !hashedPassword.includes(':')) {
      console.error('Invalid hashed password format:', hashedPassword);
      return Promise.resolve(false);
    }
    
    // Split stored hash into parts
    const parts = hashedPassword.split(':');
    if (parts.length !== 3) {
      console.error('Hashed password does not have the expected format (iterations:salt:hash)');
      return Promise.resolve(false);
    }
    
    const [iterations, salt, storedHash] = parts;
    
    // Verify all parts exist
    if (!iterations || !salt || !storedHash) {
      console.error('Missing parts in hashed password:', { iterations, salt, storedHash });
      return Promise.resolve(false);
    }
    
    return new Promise((resolve, reject) => {
      // Use same parameters to hash the input password
      crypto.pbkdf2(password, salt, parseInt(iterations), 64, 'sha512', (err, derivedKey) => {
        if (err) return reject(err);
        // Compare computed hash with stored hash
        resolve(derivedKey.toString('hex') === storedHash);
      });
    });
  }
};

module.exports = passwordUtils;
