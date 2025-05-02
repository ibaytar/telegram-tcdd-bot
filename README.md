# Telegram TCDD Bot

A Telegram bot for checking TCDD (Turkish State Railways) train ticket availability and notifying users when seats become available.

## Features

- Monitor train ticket availability for specific routes and dates
- Get notified when seats become available
- Support for different seat types (Economy, Business)
- Calendar-based date selection
- Station search with auto-completion
- Automatic periodic checks (every 15 minutes)
- Webhook support for instant message processing

## Deployment to Hetzner VPS

### Prerequisites

- A Hetzner VPS with Docker and Docker Compose installed
- SSH access to your VPS
- A Telegram bot token (get it from [@BotFather](https://t.me/BotFather))
- A Supabase account and project for data storage

### Deployment Steps

1. **Clone this repository**:
   ```bash
   git clone https://github.com/yourusername/telegram-tcdd-bot.git
   cd telegram-tcdd-bot
   ```

2. **Configure deployment script**:
   Edit `deploy-to-hetzner.sh` and update the following variables:
   ```bash
   VPS_USER="root"  # Change to your VPS username
   VPS_HOST=""      # Change to your VPS IP or hostname
   VPS_PORT="22"    # SSH port, usually 22
   DEPLOY_DIR="/opt/telegram-tcdd-bot"  # Deployment directory
   ```

3. **Make the script executable**:
   ```bash
   chmod +x deploy-to-hetzner.sh
   ```

4. **Create a .env file**:
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your actual values:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   WEBHOOK_URL=https://your_server_domain_or_ip
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   ```

5. **Run the deployment script**:
   ```bash
   ./deploy-to-hetzner.sh
   ```

6. **Set up the webhook**:
   After deployment, SSH into your VPS and run:
   ```bash
   cd /opt/telegram-tcdd-bot
   node setup-webhook.js
   ```

7. **Check the logs**:
   ```bash
   cd /opt/telegram-tcdd-bot
   docker-compose logs -f
   ```

### Using a Domain Name (Recommended)

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

1. Make your changes locally
2. Run the deployment script again:
   ```bash
   ./deploy-to-hetzner.sh
   ```

## Troubleshooting

### Webhook Issues

If the bot isn't responding to messages, check the webhook status:

```bash
cd /opt/telegram-tcdd-bot
node setup-webhook.js
```

### Container Issues

If the container isn't starting properly:

```bash
cd /opt/telegram-tcdd-bot
docker-compose logs
docker-compose ps
```

### Network Issues

Make sure your firewall allows incoming connections on port 8080 (or 80/443 if using Nginx):

```bash
# Check if UFW is enabled
ufw status

# If enabled, allow the necessary ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8080/tcp
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
