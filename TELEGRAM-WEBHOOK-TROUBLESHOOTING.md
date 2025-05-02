# Telegram Webhook Troubleshooting Guide

If your Telegram bot isn't responding to messages after setting up the webhook on Fly.io, follow this troubleshooting guide to diagnose and fix the issue.

## 1. Check the Webhook Status

First, check if your webhook is properly set up:

```bash
node check-webhook.js
```

This will show you the current webhook status and any errors reported by Telegram.

## 2. Common Issues and Solutions

### Issue: Incorrect Webhook URL

If the webhook URL is incorrect or doesn't match your Fly.io app URL:

```bash
# Replace YOUR_FLY_APP_URL with your actual Fly.io app URL
node set-webhook.js https://YOUR_FLY_APP_URL
```

### Issue: Webhook Path Format

Make sure your webhook URL follows this format:
- `https://your-app-name.fly.dev/webhook/YOUR_BOT_TOKEN`

The script will automatically append `/webhook/YOUR_BOT_TOKEN` to your URL if needed.

### Issue: Pending Updates

If there are pending updates that might be causing issues:

```bash
# Delete the webhook and drop pending updates
node delete-webhook.js

# Then set it up again
node set-webhook.js https://YOUR_FLY_APP_URL
```

### Issue: Bot Token Problems

Test if your bot token is working correctly:

```bash
# Replace YOUR_CHAT_ID with your Telegram chat ID
node test-send-message.js YOUR_CHAT_ID "Test message"
```

If this fails, your bot token might be invalid or revoked.

## 3. Check Fly.io Logs

Check your Fly.io application logs for errors:

```bash
# On Windows PowerShell
flyctl logs --app telegram-tcdd-bot

# Filter for webhook-related messages
flyctl logs --app telegram-tcdd-bot | Select-String -Pattern "webhook"

# Filter for error messages
flyctl logs --app telegram-tcdd-bot | Select-String -Pattern "error"
```

## 4. Verify Environment Variables

Make sure your environment variables are set correctly on Fly.io:

```bash
flyctl secrets list --app telegram-tcdd-bot
```

You should see `TELEGRAM_BOT_TOKEN` and `WEBHOOK_URL` in the list.

## 5. Check Fly.io App Status

Verify that your application is running:

```bash
flyctl status --app telegram-tcdd-bot
```

## 6. Restart Your Application

Sometimes a simple restart can fix issues:

```bash
flyctl restart --app telegram-tcdd-bot
```

## 7. Check Network Configuration

Make sure your Fly.io app is accessible from the internet:

```bash
# Test if your app is responding
curl https://YOUR_FLY_APP_URL
```

You should see a response like "Telegram Bot is running".

## 8. Verify Webhook in Bot.js

Check if your bot.js file is properly set up to handle webhook requests:

1. Make sure the `WEBHOOK_PATH` is correctly defined
2. Ensure the Express app is listening on the correct port
3. Verify that the webhook endpoint is properly handling Telegram updates

## 9. Try Polling Mode Temporarily

If webhook mode isn't working, you can temporarily switch to polling mode to test if the bot works:

1. Delete the webhook:
   ```bash
   node delete-webhook.js
   ```

2. Modify your bot.js to use polling instead of webhook:
   ```javascript
   // Comment out webhook setup
   // app.post(WEBHOOK_PATH, (req, res) => { ... });
   
   // Add polling
   bot.startPolling();
   ```

3. Restart your application

## 10. Advanced Debugging

If you're still having issues, try these advanced debugging steps:

1. Add more logging to your webhook handler:
   ```javascript
   app.post(WEBHOOK_PATH, (req, res) => {
     console.log("Received update:", JSON.stringify(req.body));
     // Rest of your code
   });
   ```

2. Check if Telegram can reach your webhook:
   ```bash
   flyctl logs --app telegram-tcdd-bot
   ```
   Look for incoming requests to your webhook endpoint.

3. Check for any firewall or network issues on Fly.io:
   ```bash
   flyctl status --app telegram-tcdd-bot
   ```

## 11. Contact Support

If none of these solutions work, you might need to:

1. Check the [Fly.io documentation](https://fly.io/docs/) for any known issues
2. Check the [Telegram Bot API documentation](https://core.telegram.org/bots/api) for webhook requirements
3. Contact Fly.io support if you suspect it's a platform issue

Remember to restart your application after making any changes:

```bash
flyctl restart --app telegram-tcdd-bot
```
