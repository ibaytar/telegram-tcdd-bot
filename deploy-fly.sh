#!/bin/bash
# Script to deploy the Telegram TCDD Bot to Fly.io

# Ensure the script exits if any command fails
set -e

echo "===== Deploying Telegram TCDD Bot to Fly.io ====="

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "Error: flyctl is not installed. Please install it first."
    echo "Visit https://fly.io/docs/hands-on/install-flyctl/ for installation instructions."
    exit 1
fi

# Check if user is logged in
echo "Checking Fly.io authentication..."
if ! flyctl auth whoami &> /dev/null; then
    echo "You need to log in to Fly.io first."
    flyctl auth login
fi

# Create the app if it doesn't exist
echo "Checking if app exists..."
if ! flyctl apps list | grep -q "telegram-tcdd-bot"; then
    echo "Creating new Fly.io app 'telegram-tcdd-bot'..."
    flyctl apps create telegram-tcdd-bot
else
    echo "App 'telegram-tcdd-bot' already exists."
fi

# Set secrets (environment variables)
echo "Setting up secrets..."

# Check if .env file exists
if [ -f .env ]; then
    echo "Found .env file. Setting secrets from file..."
    
    # Read each line from .env file
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip comments and empty lines
        if [[ $line =~ ^#.*$ ]] || [[ -z $line ]]; then
            continue
        fi
        
        # Extract key and value
        key=$(echo "$line" | cut -d '=' -f 1)
        value=$(echo "$line" | cut -d '=' -f 2-)
        
        # Set secret
        echo "Setting secret: $key"
        flyctl secrets set "$key=$value" --app telegram-tcdd-bot
    done < .env
    
    echo "All secrets from .env file have been set."
else
    echo "No .env file found. Please set secrets manually:"
    echo "flyctl secrets set KEY=VALUE --app telegram-tcdd-bot"
fi

# Deploy the application
echo "Deploying application..."
flyctl deploy

# Set up the webhook URL
echo "Getting the app URL..."
APP_URL=$(flyctl info --app telegram-tcdd-bot | grep -o 'https://[^ ]*' | head -1)

if [ -n "$APP_URL" ]; then
    echo "App URL: $APP_URL"
    echo "To set up the webhook, run:"
    echo "flyctl secrets set WEBHOOK_URL=$APP_URL --app telegram-tcdd-bot"
    
    # Ask if user wants to set the webhook URL now
    read -p "Do you want to set the WEBHOOK_URL now? (y/n): " SET_WEBHOOK
    if [[ $SET_WEBHOOK == "y" || $SET_WEBHOOK == "Y" ]]; then
        flyctl secrets set WEBHOOK_URL=$APP_URL --app telegram-tcdd-bot
        echo "WEBHOOK_URL has been set to $APP_URL"
    fi
else
    echo "Could not determine app URL. Please set WEBHOOK_URL manually."
fi

echo "===== Deployment completed ====="
echo "To view logs: flyctl logs --app telegram-tcdd-bot"
echo "To open the app: flyctl open --app telegram-tcdd-bot"
echo "To set up the webhook: curl -F \"url=$APP_URL/webhook/YOUR_BOT_TOKEN\" https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook"
