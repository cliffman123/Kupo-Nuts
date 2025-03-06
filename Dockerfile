FROM ghcr.io/puppeteer/puppeteer:23.11.1

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Set working directory to match server location
WORKDIR /usr/src/app/my-react-app/server

# Copy package files to the working directory
COPY my-react-app/server/package*.json ./

# Install dependencies
RUN npm ci

# Copy server files
COPY my-react-app/server/ ./

# Create build directory if it doesn't exist
RUN mkdir -p ../build

# Copy any existing build files (but don't fail if not found)
COPY my-react-app/build/ ../build/ 2>/dev/null || :

# Start the server
CMD [ "node", "server.js" ]