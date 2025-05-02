#!/bin/bash
# Script to check Fly.io logs for your Telegram bot

# Set the app name
APP_NAME="telegram-tcdd-bot"

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

# Get the logs
echo "Getting logs for $APP_NAME..."
flyctl logs --app $APP_NAME

# Optionally, you can filter the logs for specific errors
echo ""
echo "Filtering logs for webhook-related messages..."
flyctl logs --app $APP_NAME | grep -i "webhook"

echo ""
echo "Filtering logs for error messages..."
flyctl logs --app $APP_NAME | grep -i "error"

echo ""
echo "Checking app status..."
flyctl status --app $APP_NAME
