# Deploying Telegram TCDD Bot to Fly.io

This guide explains how to deploy the Telegram TCDD Bot to Fly.io.

## Prerequisites

1. Install the Fly.io CLI (flyctl):
   ```
   # On Windows with PowerShell
   iwr https://fly.io/install.ps1 -useb | iex
   
   # On macOS or Linux
   curl -L https://fly.io/install.sh | sh
   ```

2. Sign up and log in:
   ```
   flyctl auth signup
   # or login if you already have an account
   flyctl auth login
   ```

3. Make sure you have a `.env` file with all your environment variables:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   # Add any other environment variables your bot needs
   ```

## Deployment Steps

### Option 1: Using the Deployment Script

1. Make the script executable:
   ```
   chmod +x deploy-fly.sh
   ```

2. Run the deployment script:
   ```
   ./deploy-fly.sh
   ```

3. The script will:
   - Check if flyctl is installed
   - Log you in if needed
   - Create the app if it doesn't exist
   - Set up secrets from your .env file
   - Deploy the application
   - Help you set up the webhook URL

### Option 2: Manual Deployment

1. Create a new app:
   ```
   flyctl apps create telegram-tcdd-bot
   ```

2. Set your secrets (environment variables):
   ```
   flyctl secrets set TELEGRAM_BOT_TOKEN=your_bot_token
   flyctl secrets set SUPABASE_URL=your_supabase_url
   flyctl secrets set SUPABASE_KEY=your_supabase_key
   # Add any other environment variables your bot needs
   ```

3. Deploy the application:
   ```
   flyctl deploy
   ```

4. Get your app's URL:
   ```
   flyctl info
   ```

5. Set the webhook URL environment variable:
   ```
   flyctl secrets set WEBHOOK_URL=https://your-app-url.fly.dev
   ```

6. Restart the application to apply the new environment variable:
   ```
   flyctl restart
   ```

## Monitoring and Management

- View logs:
  ```
  flyctl logs
  ```

- Open the app in your browser:
  ```
  flyctl open
  ```

- SSH into the running container:
  ```
  flyctl ssh console
  ```

- Scale the app:
  ```
  flyctl scale count 2  # Run 2 instances
  ```

- Stop the app:
  ```
  flyctl apps stop
  ```

## Troubleshooting

- If you encounter memory issues, try adjusting the VM size:
  ```
  flyctl scale vm shared-cpu-1x 512MB
  ```

- If the webhook isn't working, check that the WEBHOOK_URL is set correctly:
  ```
  flyctl secrets list
  ```

- To manually set the webhook with Telegram:
  ```
  curl -F "url=https://your-app-url.fly.dev/webhook/YOUR_BOT_TOKEN" https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook
  ```

- To check the current webhook status:
  ```
  curl https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo
  ```
