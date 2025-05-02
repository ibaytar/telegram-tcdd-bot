# bot_deploy/Dockerfile

# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

# Set the working directory in the container
WORKDIR /app

# --- Install OS Dependencies for Playwright with Firefox and Chromium ---
# Based on official Playwright Docker guide
# https://playwright.dev/docs/docker
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Common dependencies
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdbus-glib-1-2 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxt6 \
    libxtst6 \
    # Firefox-specific
    firefox-esr \
    # Chromium-specific (in case Firefox fails)
    chromium \
    # Display server
    xvfb \
    # Utilities
    wget \
    curl \
    procps \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set path to system browsers
ENV PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH=/usr/bin/firefox-esr
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
# --- End OS Dependencies ---

# Copy dependency definition files FROM THE PROJECT ROOT
# Assumes build context is the parent directory of bot_deploy
COPY ./package.json ./pnpm-lock.yaml ./

# Install project dependencies
# Using --no-frozen-lockfile to handle package.json changes
RUN pnpm install --no-frozen-lockfile

# Copy files FROM bot_deploy folder INTO the container's /app directory
COPY bot.js ./
COPY check_tcdd.js ./
COPY stations.json ./

# Install Playwright dependencies without downloading browsers
RUN pnpm exec playwright install-deps

# Set environment variables for memory optimization
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSER_NAME=firefox
ENV DISPLAY=:99
ENV XVFB_DISPLAY=:99

# Set up Xvfb for headless browser support
RUN apt-get update && apt-get install -y xvfb && apt-get clean

# Create a startup script that runs Xvfb before the bot
RUN echo '#!/bin/bash\nXvfb :99 -screen 0 1280x720x24 -ac &\nexec "$@"' > /app/start.sh && \
    chmod +x /app/start.sh

# Set the command to run the bot with memory optimization flags
# Use our start.sh script to ensure Xvfb is running before the bot starts
CMD ["/app/start.sh", "node", "--expose-gc", "--optimize-for-size", "--max-old-space-size=512", "bot.js"]