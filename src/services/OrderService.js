// src/services/OrderService.js
const database = require('../config/database');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

class OrderService {
  static async createOrder(orderData) {
    const orderId = Helpers.generateOrderId();
    
    try {
      const query = `
        INSERT INTO orders (order_id, customer_name, phone_number, address, items, delivery_date, added_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const values = [
        orderId,
        orderData.customerName,
        Helpers.formatPhoneNumber(orderData.phoneNumber),
        orderData.address,
        orderData.items,
        orderData.deliveryDate,
        orderData.addedBy
      ];

      const result = await database.query(query, values);
      
      // Add to history
      await this.addOrderHistory(orderId, 'pending', orderData.addedBy, 'Order created');
      
      logger.info('Order created successfully', { orderId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  static async updateOrderStatus(orderId, status, changedBy, deliveryPerson = null) {
    try {
      let query, values;
      
      if (status === 'delivered') {
        query = `
          UPDATE orders 
          SET status = $1, delivery_person = $2, delivered_at = CURRENT_TIMESTAMP
          WHERE order_id = $3
          RETURNING *
        `;
        values = [status, deliveryPerson, orderId];
      } else if (status === 'cancelled') {
        query = `
          UPDATE orders 
          SET status = $1, cancelled_at = CURRENT_TIMESTAMP
          WHERE order_id = $2
          RETURNING *
        `;
        values = [status, orderId];
      } else {
        query = `
          UPDATE orders 
          SET status = $1, delivery_person = $2
          WHERE order_id = $3
          RETURNING *
        `;
        values = [status, deliveryPerson, orderId];
      }

      const result = await database.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Add to history
      await this.addOrderHistory(orderId, status, changedBy, `Status changed to ${status}`);
      
      logger.info('Order status updated', { orderId, status, changedBy });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  static async addOrderHistory(orderId, status, changedBy, notes) {
    try {
      const query = `
        INSERT INTO order_history (order_id, status, changed_by, notes)
        VALUES ($1, $2, $3, $4)
      `;
      
      await database.query(query, [orderId, status, changedBy, notes]);
    } catch (error) {
      logger.error('Error adding order history:', error);
    }
  }

  static async getOrderById(orderId) {
    try {
      const query = 'SELECT * FROM orders WHERE order_id = $1';
      const result = await database.query(query, [orderId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting order by ID:', error);
      throw error;
    }
  }

  static async getPendingOrders() {
    try {
      const query = `
        SELECT * FROM orders 
        WHERE status = 'pending' 
        ORDER BY created_at ASC
      `;
      const result = await database.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pending orders:', error);
      throw error;
    }
  }

  static async getDailyReport(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const query = `
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
        FROM orders 
        WHERE DATE(created_at) = $1
      `;
      
      const result = await database.query(query, [targetDate]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting daily report:', error);
      throw error;
    }
  }

  static async getWeeklyReport() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
        FROM orders 
        WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
      `;
      
      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting weekly report:', error);
      throw error;
    }
  }

  static async getMonthlyReport() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
        FROM orders 
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
      `;
      
      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting monthly report:', error);
      throw error;
    }
  }
}

module.exports = OrderService;