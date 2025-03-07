FROM ghcr.io/puppeteer/puppeteer:23.11.1

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .

# Create data directory with proper permissions
RUN mkdir -p /usr/src/app/data/users && \
    chown -R pptruser:pptruser /usr/src/app/data

# Switch to pptruser (the default user in puppeteer image)
USER pptruser

CMD [ "node", "server.js" ]