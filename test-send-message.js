// test-send-message.js
// Script to test sending a message with your Telegram bot

require('dotenv').config();
const https = require('https');

// Get the bot token from environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
  process.exit(1);
}

// Get the chat ID from command line or environment
let chatId = process.env.TEST_CHAT_ID;
if (process.argv.length > 2) {
  chatId = process.argv[2];
}

if (!chatId) {
  console.error('Error: No chat ID provided.');
  console.error('Usage: node test-send-message.js <chat_id> [message]');
  process.exit(1);
}

// Get the message from command line or use default
let message = 'This is a test message from your Telegram bot!';
if (process.argv.length > 3) {
  message = process.argv[3];
}

// Construct the Telegram API URL to send a message
const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

// Prepare the request data
const postData = JSON.stringify({
  chat_id: chatId,
  text: message,
  parse_mode: 'Markdown'
});

// Prepare the request options
const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

// Make the request to send the message
console.log(`Sending message to chat ID ${chatId}...`);
const req = https.request(telegramApiUrl, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.ok) {
        console.log('✅ Message sent successfully!');
        console.log('Response:', response);
      } else {
        console.error('❌ Failed to send message:', response.description);
      }
    } catch (error) {
      console.error('Error parsing response:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.error('Error sending message:', error.message);
});

// Write the post data and end the request
req.write(postData);
req.end();
