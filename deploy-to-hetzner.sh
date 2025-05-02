#!/bin/bash
# Script to deploy the Telegram TCDD Bot to Hetzner VPS

# Configuration - EDIT THESE VALUES
VPS_USER="root"  # Change to your VPS username
VPS_HOST=""      # Change to your VPS IP or hostname
VPS_PORT="22"    # SSH port, usually 22
DEPLOY_DIR="/opt/telegram-tcdd-bot"  # Directory on the VPS where the bot will be deployed

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if required commands exist
command -v ssh >/dev/null 2>&1 || { echo -e "${RED}Error: ssh is not installed.${NC}" >&2; exit 1; }
command -v scp >/dev/null 2>&1 || { echo -e "${RED}Error: scp is not installed.${NC}" >&2; exit 1; }

# Check if VPS_HOST is set
if [ -z "$VPS_HOST" ]; then
    echo -e "${RED}Error: VPS_HOST is not set. Please edit this script and set your VPS hostname or IP.${NC}"
    exit 1
fi

echo -e "${YELLOW}=== Deploying Telegram TCDD Bot to Hetzner VPS ===${NC}"

# Create a temporary directory for deployment files
TEMP_DIR=$(mktemp -d)
echo -e "${GREEN}Created temporary directory: $TEMP_DIR${NC}"

# Copy necessary files to the temporary directory
echo -e "${GREEN}Copying project files...${NC}"
cp -r Dockerfile docker-compose.yml package.json pnpm-lock.yaml bot.js check_tcdd.js stations.json setup-webhook.js "$TEMP_DIR"

# Create a logs directory
mkdir -p "$TEMP_DIR/logs"

# Check if .env file exists and copy it
if [ -f .env ]; then
    cp .env "$TEMP_DIR"
    echo -e "${GREEN}Copied .env file${NC}"
else
    echo -e "${YELLOW}Warning: .env file not found. You'll need to create it on the server.${NC}"
fi

# Create a setup script to run on the VPS
cat > "$TEMP_DIR/setup.sh" << 'EOF'
#!/bin/bash

# Create the deployment directory if it doesn't exist
mkdir -p $1

# Move all files to the deployment directory
cp -r * $1/
cd $1

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Creating a template..."
    cat > .env << 'ENVEOF'
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
WEBHOOK_URL=https://your_server_domain_or_ip

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Optional: Auto-setup webhook on startup (true/false)
AUTO_SETUP_WEBHOOK=false
ENVEOF
    echo "Please edit the .env file with your actual values."
fi

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Warning: docker-compose not found. Checking for Docker Compose plugin..."
    if ! docker compose version &> /dev/null; then
        echo "Error: Neither docker-compose nor Docker Compose plugin is installed."
        exit 1
    else
        echo "Using Docker Compose plugin instead of docker-compose."
        # Create an alias for compatibility
        echo 'alias docker-compose="docker compose"' >> ~/.bashrc
        source ~/.bashrc
    fi
fi

# Build and start the Docker container
echo "Building and starting the Docker container..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d

echo "Deployment completed successfully!"
echo "To check the logs, run: docker-compose logs -f"
EOF

# Make the setup script executable
chmod +x "$TEMP_DIR/setup.sh"

# Transfer files to the VPS
echo -e "${GREEN}Transferring files to the VPS...${NC}"
scp -P $VPS_PORT -r "$TEMP_DIR"/* "$VPS_USER@$VPS_HOST:/tmp/"

# Execute the setup script on the VPS
echo -e "${GREEN}Setting up the project on the VPS...${NC}"
ssh -p $VPS_PORT "$VPS_USER@$VPS_HOST" "bash /tmp/setup.sh $DEPLOY_DIR"

# Clean up the temporary directory
echo -e "${GREEN}Cleaning up temporary files...${NC}"
rm -rf "$TEMP_DIR"

echo -e "${GREEN}Deployment completed!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. SSH into your VPS: ${GREEN}ssh -p $VPS_PORT $VPS_USER@$VPS_HOST${NC}"
echo -e "2. Edit the .env file if needed: ${GREEN}nano $DEPLOY_DIR/.env${NC}"
echo -e "3. Set up the webhook: ${GREEN}cd $DEPLOY_DIR && node setup-webhook.js${NC}"
echo -e "4. Check the logs: ${GREEN}cd $DEPLOY_DIR && docker-compose logs -f${NC}"
