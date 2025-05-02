# bot_deploy/Dockerfile

# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

# Set the working directory in the container
WORKDIR /app

# --- Install OS Dependencies for Playwright with Firefox ---
# Based on official Playwright Docker guide for Firefox
# https://playwright.dev/docs/docker
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Firefox dependencies - minimal set
    ca-certificates \
    fonts-liberation \
    libdbus-glib-1-2 \
    libgtk-3-0 \
    libxt6 \
    libasound2 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libglib2.0-0 \
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
    libxss1 \
    libxtst6 \
    # Other dependencies
    xvfb \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
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

# Install Playwright with Firefox (lightweight configuration)
# Use pnpm exec to ensure the correct playwright instance is used
RUN pnpm exec playwright install firefox && \
    pnpm exec playwright install-deps firefox

# Set environment variables for memory optimization
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
ENV PLAYWRIGHT_BROWSER_NAME=firefox

# Set the command to run the bot with memory optimization flags
CMD ["node", "--expose-gc", "--optimize-for-size", "--max-old-space-size=512", "bot.js"]