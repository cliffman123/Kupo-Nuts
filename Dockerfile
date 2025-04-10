FROM ghcr.io/puppeteer/puppeteer:19.7.2

# Switch to root to install packages
USER root

# Fix the GPG key issue for Google Chrome repository using modern approach
RUN apt-get update -y && apt-get install -y wget gnupg && \
    # Clean up any existing Google Chrome repository configurations
    rm -f /etc/apt/sources.list.d/google*.list && \
    # Add GPG key using modern method
    mkdir -p /usr/share/keyrings && \
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-chrome.gpg && \
    # Add repository with signed-by option
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list

# Install build essentials for native modules
RUN apt-get update && apt-get install -y python3 make g++ build-essential

# Remove the skip download flag to allow Puppeteer to use its bundled Chromium
ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .

# Create local data directory with proper permissions
RUN mkdir -p /usr/src/app/data/users && \
    chown -R pptruser:pptruser /usr/src/app/data

# Add a volume configuration for data persistence
VOLUME ["/usr/src/app/data"]

# Debug: Print browser information
RUN echo "Checking for browser executables:" && \
    ls -la /usr/bin/chromium* || echo "No chromium in /usr/bin" && \
    ls -la /usr/bin/google-chrome* || echo "No google-chrome in /usr/bin" && \
    ls -la $(npm list -g puppeteer --depth=0 --parseable 2>/dev/null || echo ".") | grep -i chrom || echo "No bundled Chromium found"

# Switch back to pptruser (the default user in puppeteer image)
USER pptruser

# Run our diagnostic script before starting the server
CMD node my-react-app/server/server.js