FROM ghcr.io/puppeteer/puppeteer:23.11.1

# The puppeteer Docker image uses chromium-browser, not google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

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
CMD node find-chrome.js && node server.js