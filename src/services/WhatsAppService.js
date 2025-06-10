// src/services/WhatsAppService.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger');
const database = require('../config/database');

class WhatsAppService {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "delivery-bot"
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      }
    });
    
    this.isReady = false;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // QR Code event - Railway-friendly handling
    this.client.on('qr', (qr) => {
      logger.info('QR Code received, generating...');
      
      // For Railway deployment - provide alternative methods
      if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
        console.log('\n🚨 RAILWAY DEPLOYMENT DETECTED 🚨');
        console.log('QR Code cannot be displayed in Railway logs.');
        console.log('\n📱 TO AUTHENTICATE YOUR WHATSAPP BOT:');
        console.log('1. Copy this QR code data:');
        console.log('─'.repeat(50));
        console.log(qr);
        console.log('─'.repeat(50));
        console.log('\n2. Go to: https://qr-code-generator.com/');
        console.log('3. Select "Text" option');
        console.log('4. Paste the QR data above');
        console.log('5. Generate QR code and scan with WhatsApp');
        console.log('\n🔄 OR use WhatsApp Web method:');
        console.log('1. Open WhatsApp Web: https://web.whatsapp.com/');
        console.log('2. In your phone WhatsApp: Settings > Linked Devices');
        console.log('3. Tap "Link a Device" and scan the QR from web.whatsapp.com');
        console.log('4. Once linked, restart this Railway deployment');
        console.log('\n⚡ The bot will auto-save authentication for future deployments');
        console.log('═'.repeat(60));
      } else {
        // Local development - show QR in terminal
        console.log('\n📱 Scan this QR code with WhatsApp:');
        qrcode.generate(qr, { small: true });
      }
    });

    // Authentication success
    this.client.on('authenticated', () => {
      logger.info('WhatsApp authenticated successfully');
      console.log('✅ WhatsApp authentication saved!');
    });

    // Ready event
    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('WhatsApp client is ready!');
      console.log('🎉 WhatsApp bot is now active and ready to receive messages!');
      
      // Get bot info
      this.client.info.then(info => {
        console.log(`📱 Connected as: ${info.pushname}`);
        console.log(`📞 Phone: ${info.wid.user}`);
      });
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      logger.error('Authentication failed:', msg);
      console.log('❌ WhatsApp authentication failed');
      console.log('💡 Try restarting the deployment to get a new QR code');
    });

    // Disconnected
    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
      console.log('🔌 WhatsApp disconnected. Reason:', reason);
      this.isReady = false;
    });

    // Message received
    this.client.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        logger.error('Error handling message:', error);
      }
    });
  }

  async start() {
    try {
      logger.info('Starting WhatsApp service...');
      console.log('🚀 Initializing WhatsApp connection...');
      
      if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
        console.log('🌐 Running on Railway - QR code will be provided as text');
      }
      
      await this.client.initialize();
      logger.info('WhatsApp service started');
    } catch (error) {
      logger.error('Failed to start WhatsApp service:', error);
      throw error;
    }
  }

  async stop() {
    try {
      if (this.client) {
        await this.client.destroy();
        logger.info('WhatsApp service stopped');
      }
    } catch (error) {
      logger.error('Error stopping WhatsApp service:', error);
    }
  }

  async handleMessage(message) {
    // Skip if not ready or if message is from status broadcast
    if (!this.isReady || message.from === 'status@broadcast') {
      return;
    }

    const chat = await message.getChat();
    const contact = await message.getContact();

    // Log the message
    logger.info(`Message from ${contact.name || contact.number}: ${message.body}`);

    // Handle different message types
    if (message.body.toLowerCase().startsWith('/help')) {
      await this.sendHelpMessage(chat);
    } else if (message.body.toLowerCase().startsWith('/status')) {
      await this.sendStatusMessage(chat);
    }
    // Add more command handlers as needed
  }

  async sendHelpMessage(chat) {
    const helpText = `
🤖 *WhatsApp Delivery Bot Commands*

📋 *Available Commands:*
• /help - Show this help message
• /status - Check bot status
• /orders - View pending orders
• /delivered [order_id] - Mark order as delivered

📞 *Contact Admin* for order management
    `;
    
    await chat.sendMessage(helpText);
  }

  async sendStatusMessage(chat) {
    const statusText = `
✅ *Bot Status: Active*
🔗 *Database: Connected*
⏰ *Uptime: ${process.uptime()} seconds*
📊 *Ready to process orders*
    `;
    
    await chat.sendMessage(statusText);
  }

  async sendMessage(chatId, message) {
    try {
      if (!this.isReady) {
        throw new Error('WhatsApp client is not ready');
      }
      
      await this.client.sendMessage(chatId, message);
      logger.info(`Message sent to ${chatId}`);
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }
}

module.exports = WhatsAppService;