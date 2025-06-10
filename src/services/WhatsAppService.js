// src/services/WhatsAppService.js
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger');
const config = require('../config/config');
const OrderParser = require('./OrderParser');
const OrderService = require('./OrderService');
const MessageService = require('./MessageService');
const Helpers = require('../utils/helpers');

class WhatsAppService {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--max-old-space-size=512',
          '--memory-pressure-off'
        ]
      }
    });

    this.retryCount = 0;
    this.maxRetries = config.BOT.MAX_RETRY_ATTEMPTS;
    this.isRailway = process.env.RAILWAY_ENVIRONMENT === 'true' || process.env.RAILWAY_PROJECT_ID;

    this.handleMessage = this.handleMessage.bind(this);
    this.handleDeliveryGroupMessage = this.handleDeliveryGroupMessage.bind(this);
    this.sendDailyReport = this.sendDailyReport.bind(this);
    this.sendPendingOrders = this.sendPendingOrders.bind(this);
    this.sendWeeklyReport = this.sendWeeklyReport.bind(this);
    this.sendMonthlyReport = this.sendMonthlyReport.bind(this);
    
    this.initializeEventHandlers();
  }

  initializeEventHandlers() {
    this.client.on('qr', (qr) => {
      if (this.isRailway) {
        // Railway deployment - provide alternative authentication methods
        console.log('\n===========================================');
        console.log('🚂 RAILWAY DEPLOYMENT DETECTED');
        console.log('===========================================');
        console.log('Since you cannot scan QR codes directly on Railway,');
        console.log('use one of these alternative methods:\n');
        
        console.log('METHOD 1 - Online QR Generator:');
        console.log('1. Copy this QR data:');
        console.log('---START QR DATA---');
        console.log(qr);
        console.log('---END QR DATA---');
        console.log('2. Go to: https://www.qr-code-generator.com/');
        console.log('3. Select "Text" and paste the QR data');
        console.log('4. Generate and scan with WhatsApp\n');
        
        console.log('METHOD 2 - WhatsApp Web Alternative:');
        console.log('1. Open WhatsApp Web: https://web.whatsapp.com/');
        console.log('2. Use the QR data above in an online QR generator');
        console.log('3. Scan the generated QR code with your phone\n');
        
        console.log('METHOD 3 - Local Development:');
        console.log('1. Run this bot locally first to authenticate');
        console.log('2. Authentication will be saved and persist on Railway');
        console.log('3. Redeploy to Railway after local authentication\n');
        
        console.log('NOTE: Once authenticated, this QR step will be skipped');
        console.log('in future deployments due to LocalAuth persistence.');
        console.log('===========================================\n');
        
        // Also log to application logger for Railway logs
        logger.info('Railway deployment detected - QR authentication required');
        logger.info('QR Data for manual generation: ' + qr);
      } else {
        // Local development - show QR in terminal as usual
        console.log('Scan the QR code below:');
        qrcode.generate(qr, { small: true });
      }
    });

    this.client.on('ready', () => {
      logger.info('WhatsApp client is ready!');
      this.retryCount = 0;
      
      if (this.isRailway) {
        console.log('\n✅ RAILWAY AUTHENTICATION SUCCESSFUL!');
        console.log('WhatsApp bot is now running on Railway.');
        console.log('Authentication has been saved for future deployments.\n');
        
        // Start memory monitoring for Railway
        this.startMemoryMonitoring();
      }
    });

    this.client.on('authenticated', () => {
      logger.info('WhatsApp client authenticated');
      
      if (this.isRailway) {
        console.log('\n🔐 Railway Authentication Status: SUCCESS');
        console.log('LocalAuth session saved - no QR needed for future deployments.\n');
      }
    });

    this.client.on('message', async (message) => {
      await this.handleMessage(message);
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
      this.handleReconnection();
    });

    this.client.on('auth_failure', () => {
      logger.error('WhatsApp authentication failed');
      
      if (this.isRailway) {
        console.log('\n❌ RAILWAY AUTHENTICATION FAILED!');
        console.log('Please try the authentication methods above again.');
        console.log('If issues persist, try authenticating locally first.\n');
      }
    });
  }

  startMemoryMonitoring() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      };
      
      logger.info('Memory usage (MB):', memUsageMB);
      
      // Warning if memory usage is high
      if (memUsageMB.heapUsed > 400) {
        logger.warn('High memory usage detected! Consider restarting soon.');
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          logger.info('Forced garbage collection executed');
        }
      }
      
      // Critical memory usage - initiate graceful restart
      if (memUsageMB.heapUsed > 450) {
        logger.error('Critical memory usage! Initiating graceful restart...');
        this.gracefulRestart();
      }
    }, 60000); // Check every minute
  }

  async gracefulRestart() {
    try {
      logger.info('Starting graceful restart due to memory pressure...');
      
      // Send notification to delivery group
      await this.sendToDeliveryGroup('🔄 Bot restarting due to memory optimization. Will be back online shortly.');
      
      // Clean up and exit - Railway will automatically restart
      await this.stop();
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful restart:', error);
      process.exit(1);
    }
  }

  async start() {
    try {
      if (this.isRailway) {
        console.log('\n🚂 Starting WhatsApp service on Railway...');
        console.log('Environment: Production (Railway)');
        console.log('Auth Strategy: LocalAuth (persistent)\n');
      }
      
      await this.client.initialize();
      logger.info('WhatsApp service started');
    } catch (error) {
      logger.error('Failed to start WhatsApp service:', error);
      throw error;
    }
  }

  async handleMessage(message) {
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      // Handle sales group messages (new orders)
      if (chat.id._serialized === config.SALES_GROUP_ID) {
        await this.handleSalesGroupMessage(message, contact);
      }
      
      // Handle delivery group messages (commands and replies)
      else if (chat.id._serialized === config.DELIVERY_GROUP_ID) {
        await this.handleDeliveryGroupMessage(message, contact);
      }
      
      // Force garbage collection periodically
      if (global.gc && Math.random() < 0.1) {
        global.gc();
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }

  async handleSalesGroupMessage(message, contact) {
    try {
      // Skip if message is from bot itself
      if (contact.isMe) return;

      const orderData = OrderParser.parseOrder(message.body, contact.name || contact.number);
      
      if (orderData) {
        const order = await OrderService.createOrder(orderData);
        const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
        const salesConfirmation = MessageService.formatSalesConfirmation(order);
        
        // Send detailed confirmation to delivery group
        await this.sendToDeliveryGroup(deliveryConfirmation);
        
        // Send simplified confirmation to sales group
        await this.sendToSalesGroup(salesConfirmation);
        
        logger.info('Order processed and confirmations sent', { orderId: order.order_id });
      }
    } catch (error) {
      logger.error('Error handling sales group message:', error);
      // Send error message to sales group if order parsing failed
      if (message.body.length > 20) { // Only if it looks like an order attempt
        await this.sendToSalesGroup('❌ Could not process order. Please check the format and try again.');
      }
    }
  }

  async handleDeliveryGroupMessage(message, contact) {
    try {
      // Skip if message is from bot itself
      if (contact.isMe) return;

      const messageBody = message.body.toLowerCase().trim();
      const senderName = contact.name || contact.number;

      // Handle reply-based completion
      if (message.hasQuotedMsg && messageBody === 'done') {
        await this.handleReplyCompletion(message, senderName);
      }
      // Handle reply-based cancellation
      else if (message.hasQuotedMsg && messageBody === 'cancel') {
        await this.handleReplyCancellation(message, senderName);
      }
      // Handle command-based operations
      else if (messageBody.startsWith('done #')) {
        const orderId = messageBody.replace('done #', '').trim();
        await this.markOrderAsDelivered(orderId, senderName);
      }
      else if (messageBody.startsWith('cancel #')) {
        const orderId = messageBody.replace('cancel #', '').trim();
        await this.cancelOrder(orderId, senderName);
      }
      // Handle report commands
      else if (messageBody === '/daily') {
        await this.sendDailyReport();
      }
      else if (messageBody === '/pending') {
        await this.sendPendingOrders();
      }
      else if (messageBody === '/weekly') {
        await this.sendWeeklyReport();
      }
      else if (messageBody === '/monthly') {
        await this.sendMonthlyReport();
      }
      else if (messageBody === '/help') {
        await this.sendHelpMessage();
      }
    } catch (error) {
      logger.error('Error handling delivery group message:', error);
    }
  }

  async handleReplyCompletion(message, senderName) {
    try {
      const quotedMessage = await message.getQuotedMessage();
      const orderId = this.extractOrderIdFromMessage(quotedMessage.body);
      
      if (orderId) {
        await this.markOrderAsDelivered(orderId, senderName);
      }
    } catch (error) {
      logger.error('Error handling reply completion:', error);
    }
  }

  async handleReplyCancellation(message, senderName) {
    try {
      const quotedMessage = await message.getQuotedMessage();
      const orderId = this.extractOrderIdFromMessage(quotedMessage.body);
      
      if (orderId) {
        await this.cancelOrder(orderId, senderName);
      }
    } catch (error) {
      logger.error('Error handling reply cancellation:', error);
    }
  }

  extractOrderIdFromMessage(messageBody) {
    const match = messageBody.match(/Order #(\w+)/);
    return match ? match[1] : null;
  }

  async markOrderAsDelivered(orderId, deliveryPerson) {
    try {
      const order = await OrderService.getOrderById(orderId);
      
      if (!order) {
        await this.sendToDeliveryGroup(`❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.sendToDeliveryGroup(`ℹ️ Order #${orderId} is already marked as delivered.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.sendToDeliveryGroup(`❌ Cannot mark cancelled order #${orderId} as delivered.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'delivered', deliveryPerson, deliveryPerson);
      await this.sendToDeliveryGroup(`✅ Order #${orderId} marked as delivered by ${deliveryPerson}.`);
      
      logger.info('Order marked as delivered', { orderId, deliveryPerson });
    } catch (error) {
      logger.error('Error marking order as delivered:', error);
      await this.sendToDeliveryGroup(`❌ Error updating order #${orderId}. Please try again.`);
    }
  }

  async cancelOrder(orderId, cancelledBy) {
    try {
      const order = await OrderService.getOrderById(orderId);
      
      if (!order) {
        await this.sendToDeliveryGroup(`❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.sendToDeliveryGroup(`ℹ️ Order #${orderId} is already cancelled.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.sendToDeliveryGroup(`❌ Cannot cancel delivered order #${orderId}.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'cancelled', cancelledBy);
      await this.sendToDeliveryGroup(`❌ Order #${orderId} cancelled by ${cancelledBy}.`);
      
      logger.info('Order cancelled', { orderId, cancelledBy });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      await this.sendToDeliveryGroup(`❌ Error cancelling order #${orderId}. Please try again.`);
    }
  }

  async sendHelpMessage() {
    try {
      const message = MessageService.formatHelpMessage();
      await this.sendToDeliveryGroup(message);
    } catch (error) {
      logger.error('Error sending help message:', error);
    }
  }

  async sendDailyReport() {
    try {
      const report = await OrderService.getDailyReport();
      const message = MessageService.formatDailyReport(report, new Date());
      await this.sendToDeliveryGroup(message);
    } catch (error) {
      logger.error('Error sending daily report:', error);
      await this.sendToDeliveryGroup('❌ Error generating daily report.');
    }
  }

  async sendPendingOrders() {
    try {
      const orders = await OrderService.getPendingOrders();
      const message = MessageService.formatPendingOrders(orders);
      await this.sendToDeliveryGroup(message);
    } catch (error) {
      logger.error('Error sending pending orders:', error);
      await this.sendToDeliveryGroup('❌ Error retrieving pending orders.');
    }
  }

  async sendWeeklyReport() {
    try {
      const report = await OrderService.getWeeklyReport();
      const message = MessageService.formatWeeklyReport(report);
      await this.sendToDeliveryGroup(message);
    } catch (error) {
      logger.error('Error sending weekly report:', error);
      await this.sendToDeliveryGroup('❌ Error generating weekly report.');
    }
  }

  async sendMonthlyReport() {
    try {
      const report = await OrderService.getMonthlyReport();
      const message = MessageService.formatMonthlyReport(report);
      await this.sendToDeliveryGroup(message);
    } catch (error) {
      logger.error('Error sending monthly report:', error);
      await this.sendToDeliveryGroup('❌ Error generating monthly report.');
    }
  }

  async sendToSalesGroup(message) {
    try {
      await this.client.sendMessage(config.SALES_GROUP_ID, message);
    } catch (error) {
      logger.error('Error sending message to sales group:', error);
      // Retry logic
      await this.retryOperation(() => this.client.sendMessage(config.SALES_GROUP_ID, message));
    }
  }

  async sendToDeliveryGroup(message) {
    try {
      await this.client.sendMessage(config.DELIVERY_GROUP_ID, message);
    } catch (error) {
      logger.error('Error sending message to delivery group:', error);
      // Retry logic
      await this.retryOperation(() => this.client.sendMessage(config.DELIVERY_GROUP_ID, message));
    }
  }

  async retryOperation(operation, retries = config.BOT.MAX_RETRY_ATTEMPTS) {
    for (let i = 0; i < retries; i++) {
      try {
        await operation();
        return;
      } catch (error) {
        logger.warn(`Retry ${i + 1}/${retries} failed:`, error);
        if (i === retries - 1) throw error;
        await Helpers.sleep(config.BOT.RETRY_DELAY * (i + 1));
      }
    }
  }

  async handleReconnection() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      logger.info(`Attempting to reconnect... (${this.retryCount}/${this.maxRetries})`);
      
      setTimeout(async () => {
        try {
          await this.client.initialize();
        } catch (error) {
          logger.error('Reconnection failed:', error);
          await this.handleReconnection();
        }
      }, config.BOT.RETRY_DELAY * this.retryCount);
    } else {
      logger.error('Max reconnection attempts reached. Manual intervention required.');
    }
  }

  async stop() {
    try {
      await this.client.destroy();
      logger.info('WhatsApp service stopped');
    } catch (error) {
      logger.error('Error stopping WhatsApp service:', error);
    }
  }
}

module.exports = WhatsAppService;