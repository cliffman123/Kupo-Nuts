FROM ghcr.io/puppeteer/puppeteer:19.7.2

# Remove the skip download flag to allow Puppeteer to use its bundled Chromium
ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .

# Create local data directory with proper permissions
RUN mkdir -p /usr/src/app/data/users && \
    chown -R pptruser:pptruser /usr/src/app/data

# Debug: Print browser information
RUN echo "Checking for browser executables:" && \
    ls -la /usr/bin/chromium* || echo "No chromium in /usr/bin" && \
    ls -la /usr/bin/google-chrome* || echo "No google-chrome in /usr/bin" && \
    ls -la $(npm list -g puppeteer --depth=0 --parseable 2>/dev/null || echo ".") | grep -i chrom || echo "No bundled Chromium found"

# Switch to pptruser (the default user in puppeteer image)
USER pptruser

# Run our diagnostic script before starting the server
CMD node my-react-app/server/server.js