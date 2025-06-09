// src/config/config.js
module.exports = {
  // WhatsApp Group IDs (Replace with your actual group IDs)
  SALES_GROUP_ID: '120363418283053097@g.us',
  DELIVERY_GROUP_ID: '120363419001636636@g.us',
  
  // Database Configuration
  DATABASE: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'wesleydb',
    username: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'wesleygreat'
  },
  
  // Bot Configuration
  BOT: {
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000, // milliseconds
    DAILY_REPORT_TIME: '22:00', // 10 PM
    PENDING_ORDERS_TIME: '22:30' // 10:30 PM
  }
};