// delete-webhook.js
// Script to delete the webhook for your Telegram bot

require('dotenv').config();
const https = require('https');

// Get the bot token from environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
  process.exit(1);
}

// Construct the Telegram API URL to delete the webhook
const telegramApiUrl = `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`;

// Make the request to delete the webhook
console.log('Deleting webhook...');
https.get(telegramApiUrl, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.ok) {
        console.log('✅ Webhook deleted successfully!');
        console.log('Response:', response);
        
        // Now get webhook info to verify
        getWebhookInfo();
      } else {
        console.error('❌ Failed to delete webhook:', response.description);
      }
    } catch (error) {
      console.error('Error parsing response:', error.message);
    }
  });
}).on('error', (error) => {
  console.error('Error deleting webhook:', error.message);
});

// Function to get webhook info
function getWebhookInfo() {
  const infoUrl = `https://api.telegram.org/bot${token}/getWebhookInfo`;
  
  console.log('\nGetting webhook info to verify...');
  https.get(infoUrl, (res) => {
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
}
