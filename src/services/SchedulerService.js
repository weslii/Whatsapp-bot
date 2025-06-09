// src/services/SchedulerService.js
const cron = require('node-cron');
const logger = require('../utils/logger');
const config = require('../config/config');
const OrderService = require('./OrderService');
const MessageService = require('./MessageService');

class SchedulerService {
  constructor(whatsappService) {
    this.whatsappService = whatsappService;
    this.jobs = [];
  }

  start() {
    // Daily report at 10 PM
    const dailyReportJob = cron.schedule(
      `0 22 * * *`, // 10:00 PM every day
      async () => {
        try {
          logger.info('Running scheduled daily report');
          const report = await OrderService.getDailyReport();
          const message = MessageService.formatDailyReport(report, new Date());
          await this.whatsappService.sendToDeliveryGroup(message);
        } catch (error) {
          logger.error('Error in scheduled daily report:', error);
        }
      },
      {
        scheduled: false,
        timezone: "Africa/Lagos"
      }
    );

    // Pending orders at 10:30 PM
    const pendingOrdersJob = cron.schedule(
      `30 22 * * *`, // 10:30 PM every day
      async () => {
        try {
          logger.info('Running scheduled pending orders check');
          const orders = await OrderService.getPendingOrders();
          if (orders.length > 0) {
            const message = MessageService.formatPendingOrders(orders);
            await this.whatsappService.sendToDeliveryGroup(message);
          }
        } catch (error) {
          logger.error('Error in scheduled pending orders check:', error);
        }
      },
      {
        scheduled: false,
        timezone: "Africa/Lagos"
      }
    );

    this.jobs.push(dailyReportJob, pendingOrdersJob);
    
    // Start all jobs
    this.jobs.forEach(job => job.start());
    
    logger.info('Scheduler service started with daily jobs');
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    logger.info('Scheduler service stopped');
  }
}

module.exports = SchedulerService;