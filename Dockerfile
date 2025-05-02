# Dockerfile for Telegram TCDD Bot

# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

# Set the working directory in the container
WORKDIR /app

# --- Install OS Dependencies for Playwright with Firefox ---
# Based on official Playwright Docker guide
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Firefox dependencies
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdbus-glib-1-2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
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
    libxss1 \
    libxt6 \
    libxtst6 \
    # Firefox browser
    firefox-esr \
    # Display server
    xvfb \
    # Utilities
    wget \
    procps \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set path to system Firefox
ENV PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH=/usr/bin/firefox-esr

# Fix permissions for Firefox
RUN mkdir -p /root/.mozilla && \
    chmod -R 777 /root/.mozilla && \
    mkdir -p /tmp/.X11-unix && \
    chmod 1777 /tmp/.X11-unix
# --- End OS Dependencies ---

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install project dependencies
RUN pnpm install

# Copy all project files
COPY . .

# Install Playwright dependencies for Firefox
RUN pnpm exec playwright install-deps firefox

# Set environment variables
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSER_NAME=firefox
ENV DISPLAY=:99
ENV XVFB_DISPLAY=:99

# Firefox sandbox disabling for container environment
ENV MOZ_DISABLE_CONTENT_SANDBOX=1
ENV MOZ_DISABLE_GMP_SANDBOX=1
ENV MOZ_DISABLE_NPAPI_SANDBOX=1
ENV MOZ_DISABLE_PREF_SANDBOX=1
ENV MOZ_DISABLE_RDD_SANDBOX=1
ENV MOZ_DISABLE_SOCKET_PROCESS_SANDBOX=1
ENV MOZ_DISABLE_UTILITY_SANDBOX=1

# Create a startup script that runs Xvfb before the bot
RUN echo '#!/bin/bash\n\
echo "Starting Xvfb..."\n\
Xvfb :99 -screen 0 1280x720x24 -ac &\n\
XVFB_PID=$!\n\
sleep 2\n\
echo "Xvfb started with PID: $XVFB_PID"\n\
\n\
# Execute the command\n\
echo "Executing command: $@"\n\
"$@"\n\
EXIT_CODE=$?\n\
\n\
# Clean up\n\
echo "Cleaning up..."\n\
if [ -n "$XVFB_PID" ]; then\n\
  echo "Stopping Xvfb (PID: $XVFB_PID)"\n\
  kill $XVFB_PID || true\n\
fi\n\
\n\
exit $EXIT_CODE' > /app/start.sh && \
    chmod +x /app/start.sh

# Create logs directory
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Set the command to run the bot
CMD ["/app/start.sh", "node", "bot.js"]