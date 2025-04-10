FROM ghcr.io/puppeteer/puppeteer:19.7.2

# Switch to root temporarily for setup
USER root

# Configure environment variables - using built-in Chromium
ENV NODE_ENV=production \
    # Path to the pre-installed Chromium in the puppeteer image
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set the working directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy project files
COPY . .

# Create data directory with proper permissions
RUN mkdir -p /usr/src/app/data/users && \
    chown -R pptruser:pptruser /usr/src/app/data

# Switch back to pptruser
USER pptruser

# Use the correct start command
CMD ["node", "my-react-app/server/server.js"]