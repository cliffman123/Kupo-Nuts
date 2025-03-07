FROM ghcr.io/puppeteer/puppeteer:19.7.2

# Set environment variables for Puppeteer 19.7.2
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /usr/src/app

# Install chromium-browser explicitly
USER root
RUN apt-get update && apt-get install -y \
    chromium-browser \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify that chromium-browser was installed correctly
RUN which chromium-browser || echo "chromium-browser not found in PATH"
RUN ls -la /usr/bin/chromium* || echo "No chromium executables found in /usr/bin"

COPY package*.json ./
RUN npm ci
COPY . .

# Create data directory with proper permissions
RUN mkdir -p /usr/src/app/data/users && \
    chown -R pptruser:pptruser /usr/src/app/data

# Switch to pptruser (the default user in puppeteer image)
USER pptruser

# Run our diagnostic script before starting the server
CMD node find-chrome.js && node my-react-app/server/server.js