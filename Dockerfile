# bot_deploy/Dockerfile

# Use an official Node.js runtime as a parent image (choose a version)
FROM node:18-slim

# Install pnpm
RUN npm install -g pnpm

# Set the working directory in the container
WORKDIR /app

# --- Install OS Dependencies for Playwright --- 
# Based on official Playwright Docker guide
# https://playwright.dev/docs/docker
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Browsers dependencies
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
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
    lsb-release \
    wget \
    xvfb \
    # Clean up
    && rm -rf /var/lib/apt/lists/*
# --- End OS Dependencies --- 

# Copy dependency definition files FROM THE PROJECT ROOT
# Assumes build context is the parent directory of bot_deploy
COPY ../package.json ../pnpm-lock.yaml ./

# Install project dependencies
# Using --frozen-lockfile is recommended for CI/deployments
RUN pnpm install --frozen-lockfile

# Copy files FROM bot_deploy folder INTO the container's /app directory
COPY bot.js ./
COPY check_tcdd.js ./
COPY stations.json ./

# Install Playwright browsers
# Use pnpm exec to ensure the correct playwright instance is used
RUN pnpm exec playwright install --with-deps chromium

# Set the command to run the bot (now directly in /app)
CMD ["node", "bot.js"] 