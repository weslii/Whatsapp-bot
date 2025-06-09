// src/config/database.js
const { Pool } = require('pg');
const config = require('./config');
const logger = require('../utils/logger');
console.log('Connecting with:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});


class Database {
  constructor() {
    this.pool = new Pool(config.DATABASE);
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  async connect() {
    try {
      await this.pool.connect();
      logger.info('Database connected successfully');
      await this.initializeTables();
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  async initializeTables() {
    const createOrdersTable = `
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        address TEXT NOT NULL,
        items TEXT NOT NULL,
        delivery_date DATE,
        status VARCHAR(20) DEFAULT 'pending',
        added_by VARCHAR(255),
        delivery_person VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP,
        cancelled_at TIMESTAMP
      )
    `;

    const createOrderHistoryTable = `
      CREATE TABLE IF NOT EXISTS order_history (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        changed_by VARCHAR(255),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      )
    `;

    try {
      await this.pool.query(createOrdersTable);
      await this.pool.query(createOrderHistoryTable);
      logger.info('Database tables initialized');
    } catch (error) {
      logger.error('Error initializing tables:', error);
      throw error;
    }
  }

  async query(text, params) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } catch (error) {
      logger.error('Database query error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
    logger.info('Database connection closed');
  }
}

module.exports = new Database();