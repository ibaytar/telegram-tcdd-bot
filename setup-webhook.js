// setup-webhook.js
// A script to set up the Telegram webhook for your bot

require('dotenv').config();
const https = require('https');

// Get the bot token from environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
  process.exit(1);
}

// Get the webhook URL from environment variables
const webhookUrl = process.env.WEBHOOK_URL;
if (!webhookUrl) {
  console.error('Error: WEBHOOK_URL environment variable is not set.');
  process.exit(1);
}

// Construct the full webhook URL
const fullWebhookUrl = `${webhookUrl}/webhook/${token}`;

// Construct the Telegram API URL
const telegramApiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(fullWebhookUrl)}`;

// Make the request to set the webhook
console.log(`Setting webhook to: ${fullWebhookUrl}`);
https.get(telegramApiUrl, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.ok) {
        console.log('Webhook set successfully!');
        console.log('Response:', response);
        
        // Now get webhook info to verify
        getWebhookInfo();
      } else {
        console.error('Failed to set webhook:', response.description);
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
  
  console.log('\nGetting webhook info...');
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
