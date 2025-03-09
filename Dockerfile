FROM ghcr.io/puppeteer/puppeteer:19.7.2

# Remove the skip download flag to allow Puppeteer to use its bundled Chromium
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy package files first
COPY package*.json ./
RUN npm ci

# Create data directory structure - start as root
RUN mkdir -p /usr/src/app/data

# Switch to pptruser for data directory permissions
USER pptruser
RUN mkdir -p /usr/src/app/data/users /usr/src/app/data/sessions

# Switch back to root for copying files
USER root
COPY . .

# Add a volume configuration for data persistence
VOLUME ["/usr/src/app/data"]

# Debug: Print browser information
RUN echo "Checking for browser executables:" && \
    ls -la /usr/bin/chromium* || echo "No chromium in /usr/bin" && \
    ls -la /usr/bin/google-chrome* || echo "No google-chrome in /usr/bin" && \
    ls -la $(npm list -g puppeteer --depth=0 --parseable 2>/dev/null || echo ".") | grep -i chrom || echo "No bundled Chromium found"

# Switch to pptruser (the default user in puppeteer image)
USER pptruser

# Run our server
CMD node my-react-app/server/server.js