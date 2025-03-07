FROM ghcr.io/puppeteer/puppeteer:19.7.2

# Set environment variables for Puppeteer 19.7.2
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .

# Create data directory with proper permissions
RUN mkdir -p /usr/src/app/data/users && \
    chown -R pptruser:pptruser /usr/src/app/data

# Debug: Print Chromium information 
RUN echo "Checking for browser executables:" && \
    ls -la /usr/bin/chromium* || echo "No chromium in /usr/bin" && \
    ls -la /usr/bin/google-chrome* || echo "No google-chrome in /usr/bin"

# Switch to pptruser (the default user in puppeteer image)
USER pptruser

# Run our diagnostic script before starting the server
CMD node my-react-app/server/server.js