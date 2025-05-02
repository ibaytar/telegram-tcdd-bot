# Deploying Telegram TCDD Bot to Hetzner VPS

This guide provides detailed instructions for deploying your Telegram TCDD Bot to a Hetzner VPS using Docker.

## Prerequisites

1. A Hetzner VPS with:
   - Docker installed
   - SSH access
   - A public IP address or domain name
   - Ports 80/443 open for webhook (or at least port 8080)

2. Your local development environment with:
   - The complete Telegram TCDD Bot codebase
   - SSH client installed

## Deployment Options

### Option 1: Using the Automated Deployment Script

1. Edit the `deploy-to-hetzner.sh` script and update the configuration variables:
   ```bash
   VPS_USER="root"  # Change to your VPS username
   VPS_HOST=""      # Change to your VPS IP or hostname
   VPS_PORT="22"    # SSH port, usually 22
   DEPLOY_DIR="/opt/telegram-tcdd-bot"  # Directory on the VPS where the bot will be deployed
   ```

2. Make the script executable:
   ```bash
   chmod +x deploy-to-hetzner.sh
   ```

3. Run the deployment script:
   ```bash
   ./deploy-to-hetzner.sh
   ```

4. Follow the on-screen instructions to complete the setup.

### Option 2: Manual Deployment

If you prefer to deploy manually, follow these steps:

1. **Prepare your project files**:
   - Ensure you have all necessary files: Dockerfile, docker-compose.yml, bot.js, check_tcdd.js, stations.json, package.json, pnpm-lock.yaml, and .env

2. **Transfer files to your VPS**:
   ```bash
   # Create a directory on your VPS
   ssh user@your-vps-ip "mkdir -p /opt/telegram-tcdd-bot"
   
   # Copy files to the VPS
   scp -r Dockerfile docker-compose.yml package.json pnpm-lock.yaml bot.js check_tcdd.js stations.json .env user@your-vps-ip:/opt/telegram-tcdd-bot/
   ```

3. **SSH into your VPS**:
   ```bash
   ssh user@your-vps-ip
   ```

4. **Navigate to the project directory**:
   ```bash
   cd /opt/telegram-tcdd-bot
   ```

5. **Build and start the Docker container**:
   ```bash
   docker-compose build --no-cache
   docker-compose up -d
   ```

6. **Set up the webhook**:
   ```bash
   # Create the setup-webhook.js file (copy from the repository)
   # Then run:
   node setup-webhook.js
   ```

## Environment Variables

Make sure your `.env` file contains the following variables:

```
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
WEBHOOK_URL=https://your_server_domain_or_ip

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## Setting Up a Domain and HTTPS (Recommended)

For production use, it's recommended to set up a domain name and HTTPS:

1. **Register a domain** and point it to your Hetzner VPS IP address.

2. **Install Nginx** as a reverse proxy:
   ```bash
   apt update
   apt install -y nginx
   ```

3. **Set up Nginx configuration**:
   ```bash
   nano /etc/nginx/sites-available/telegram-bot
   ```

   Add the following configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

4. **Enable the site**:
   ```bash
   ln -s /etc/nginx/sites-available/telegram-bot /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   ```

5. **Install Certbot** for HTTPS:
   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d your-domain.com
   ```

6. **Update your .env file** with the new domain:
   ```
   WEBHOOK_URL=https://your-domain.com
   ```

7. **Restart the bot**:
   ```bash
   cd /opt/telegram-tcdd-bot
   docker-compose down
   docker-compose up -d
   ```

8. **Set up the webhook with the new domain**:
   ```bash
   node setup-webhook.js
   ```

## Monitoring and Maintenance

### Viewing Logs

```bash
cd /opt/telegram-tcdd-bot
docker-compose logs -f
```

### Restarting the Bot

```bash
cd /opt/telegram-tcdd-bot
docker-compose restart
```

### Updating the Bot

1. Transfer the updated files to your VPS
2. Rebuild and restart the container:
   ```bash
   cd /opt/telegram-tcdd-bot
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

## Troubleshooting

### Webhook Issues

If the bot isn't responding to messages, check the webhook status:

```bash
cd /opt/telegram-tcdd-bot
node -e "const https = require('https'); const token = process.env.TELEGRAM_BOT_TOKEN; https.get(\`https://api.telegram.org/bot\${token}/getWebhookInfo\`, res => { let data = ''; res.on('data', chunk => { data += chunk; }); res.on('end', () => { console.log(JSON.parse(data)); }); }).on('error', e => { console.error(e); });"
```

### Container Issues

If the container isn't starting properly:

```bash
cd /opt/telegram-tcdd-bot
docker-compose logs
docker-compose ps
```

### Network Issues

Make sure your firewall allows incoming connections on the required ports:

```bash
# Check if UFW is enabled
ufw status

# If enabled, allow the necessary ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8080/tcp
```

## Backup

Regularly backup your configuration:

```bash
# Create a backup directory
mkdir -p /backup/telegram-bot

# Backup the .env file and other important files
cp /opt/telegram-tcdd-bot/.env /backup/telegram-bot/
cp /opt/telegram-tcdd-bot/docker-compose.yml /backup/telegram-bot/
```

## Security Considerations

1. **Use a non-root user** for SSH access
2. **Keep your server updated**:
   ```bash
   apt update && apt upgrade -y
   ```
3. **Configure a firewall** to only allow necessary ports
4. **Set up fail2ban** to prevent brute force attacks
5. **Regularly check logs** for suspicious activity
