// set-webhook.js
// Script to set the webhook for your Telegram bot

require('dotenv').config();
const https = require('https');

// Get the bot token from environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
  process.exit(1);
}

// Get the webhook URL from environment variables or command line
let webhookUrl = process.env.WEBHOOK_URL;
if (process.argv.length > 2) {
  webhookUrl = process.argv[2];
}

if (!webhookUrl) {
  console.error('Error: WEBHOOK_URL environment variable is not set and no URL was provided as an argument.');
  console.error('Usage: node set-webhook.js [webhook_url]');
  process.exit(1);
}

// Ensure the webhook URL doesn't already contain the token path
if (webhookUrl.includes(`/webhook/${token}`)) {
  console.log('Warning: The provided webhook URL already contains the token path.');
  console.log('Using the URL as-is, but this might cause issues if the path is duplicated.');
} else {
  // Ensure the webhook URL ends with a slash if it doesn't already
  if (!webhookUrl.endsWith('/')) {
    webhookUrl += '/';
  }
  
  // Append the webhook path with token
  webhookUrl += `webhook/${token}`;
}

// Construct the Telegram API URL to set the webhook
const telegramApiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`;

// Make the request to set the webhook
console.log(`Setting webhook to: ${webhookUrl}`);
https.get(telegramApiUrl, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.ok) {
        console.log('✅ Webhook set successfully!');
        console.log('Response:', response);
        
        // Now get webhook info to verify
        getWebhookInfo();
      } else {
        console.error('❌ Failed to set webhook:', response.description);
      }
    } catch (error) {
      console.error('Error parsing response:', error.message);
    }
  });
}).on('error', (error) => {
  console.error('Error setting webhook:', error.message);
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
