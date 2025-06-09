// src/utils/helpers.js
const moment = require('moment');

class Helpers {
  static generateOrderId() {
    const date = moment().format('YYYYMMDD');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD${date}${random}`;
  }

  static formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming Nigeria +234)
    if (cleaned.startsWith('0')) {
      return '+234' + cleaned.substring(1);
    } else if (!cleaned.startsWith('234')) {
      return '+234' + cleaned;
    }
    return '+' + cleaned;
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static escapeMarkdown(text) {
    return text.replace(/[*_`]/g, '\\$&');
  }
}

module.exports = Helpers;