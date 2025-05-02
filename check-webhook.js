// check-webhook.js
// Script to check the current webhook status for your Telegram bot

require('dotenv').config();
const https = require('https');

// Get the bot token from environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
  process.exit(1);
}

// Construct the Telegram API URL to get webhook info
const telegramApiUrl = `https://api.telegram.org/bot${token}/getWebhookInfo`;

// Make the request to get webhook info
console.log('Checking current webhook status...');
https.get(telegramApiUrl, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.ok) {
        console.log('Current webhook info:');
        console.log(JSON.stringify(response.result, null, 2));
        
        // Check for common issues
        const webhookInfo = response.result;
        
        if (!webhookInfo.url) {
          console.log('❌ No webhook URL is set. You need to set a webhook URL.');
        } else {
          console.log(`✅ Webhook URL is set to: ${webhookInfo.url}`);
          
          // Check if the URL contains the correct token
          if (!webhookInfo.url.includes(token)) {
            console.log('⚠️ Warning: The webhook URL does not contain your bot token. Make sure the URL format is correct.');
          }
        }
        
        if (webhookInfo.has_custom_certificate) {
          console.log('ℹ️ You are using a custom certificate.');
        }
        
        if (webhookInfo.pending_update_count > 0) {
          console.log(`⚠️ There are ${webhookInfo.pending_update_count} pending updates that haven't been processed.`);
        }
        
        if (webhookInfo.last_error_date) {
          const errorDate = new Date(webhookInfo.last_error_date * 1000);
          console.log(`❌ Last error occurred at: ${errorDate.toISOString()}`);
          console.log(`❌ Last error message: ${webhookInfo.last_error_message}`);
        } else {
          console.log('✅ No errors reported by Telegram.');
        }
        
        if (webhookInfo.max_connections) {
          console.log(`ℹ️ Maximum allowed connections: ${webhookInfo.max_connections}`);
        }
        
        if (webhookInfo.ip_address) {
          console.log(`ℹ️ Telegram is connecting to your webhook from IP: ${webhookInfo.ip_address}`);
        }
      } else {
        console.error('Failed to get webhook info:', response.description);
      }
    } catch (error) {
      console.error('Error parsing response:', error.message);
    }
  });
}).on('error', (error) => {
  console.error('Error getting webhook info:', error.message);
});
