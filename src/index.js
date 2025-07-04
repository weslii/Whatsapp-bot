// src/index.js
// Load environment variables first (only works locally with .env file)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// Debug environment variables before loading database config
console.log('🔍 Environment Debug:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('PGHOST exists:', !!process.env.PGHOST);
console.log('POSTGRES_HOST exists:', !!process.env.POSTGRES_HOST);
console.log('Railway env vars:', {
  RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
  RAILWAY_PROJECT_ID: !!process.env.RAILWAY_PROJECT_ID,
  RAILWAY_SERVICE_ID: !!process.env.RAILWAY_SERVICE_ID
});

// Now load database after environment check
const database = require('./config/database');
const WhatsAppService = require('./services/WhatsAppService');
const SchedulerService = require('./services/SchedulerService');

class DeliveryBot {
  constructor() {
    this.whatsappService = new WhatsAppService();
    this.schedulerService = new SchedulerService(this.whatsappService);
    this.isShuttingDown = false;
  }

  async start() {
    try {
      // Create logs directory if it doesn't exist
      const logsDir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      logger.info('Starting Delivery Bot...');

      // Initialize database
      await database.connect();

      // Start WhatsApp service
      await this.whatsappService.start();

      // Start scheduler
      this.schedulerService.start();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('Delivery Bot started successfully!');
      console.log('\n🤖 WhatsApp Delivery Bot is running!');
      console.log('📱 Scan the QR code above to authenticate');
      console.log('⚙️  Configure your group IDs in src/config/config.js');
      console.log('📊 The bot will automatically send daily reports at 10 PM');
      console.log('📋 Pending orders will be shown at 10:30 PM');
      console.log('\nPress Ctrl+C to stop the bot');

    } catch (error) {
      logger.error('Failed to start Delivery Bot:', error);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`Received ${signal}. Shutting down gracefully...`);

      try {
        // Stop scheduler
        this.schedulerService.stop();

        // Stop WhatsApp service
        await this.whatsappService.stop();

        // Close database connection
        await database.close();

        logger.info('Delivery Bot stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Start the bot
const bot = new DeliveryBot();
bot.start();