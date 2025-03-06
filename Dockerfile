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

# Create build directory
RUN mkdir -p ../build

# Copy React static files if they exist (optional)
# We'll use shell script to handle this conditionally
RUN mkdir -p ../build/users

# Start the server
CMD [ "node", "server.js" ]