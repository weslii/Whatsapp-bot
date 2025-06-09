// src/services/OrderParser.js
const logger = require('../utils/logger');

class OrderParser {
  static parseOrder(messageBody, senderName) {
    try {
      const lines = messageBody.trim().split('\n').map(line => line.trim()).filter(line => line);
      
      if (lines.length < 3) {
        return null;
      }

      let customerName = null;
      let phoneNumber = null;
      let address = null;
      let items = null;
      let deliveryDate = null;

      // First pass: Look for labeled format
      const labeledData = this.parseLabeledFormat(lines);
      if (labeledData.customerName) customerName = labeledData.customerName;
      if (labeledData.phoneNumber) phoneNumber = labeledData.phoneNumber;
      if (labeledData.address) address = labeledData.address;
      if (labeledData.items) items = labeledData.items;
      if (labeledData.deliveryDate) deliveryDate = labeledData.deliveryDate;

      // Second pass: Fill missing fields using flexible unlabeled parsing
      if (!customerName || !phoneNumber || !address || !items) {
        const unlabeledData = this.parseUnlabeledFormat(lines);
        if (!customerName && unlabeledData.customerName) customerName = unlabeledData.customerName;
        if (!phoneNumber && unlabeledData.phoneNumber) phoneNumber = unlabeledData.phoneNumber;
        if (!address && unlabeledData.address) address = unlabeledData.address;
        if (!items && unlabeledData.items) items = unlabeledData.items;
        if (!deliveryDate && unlabeledData.deliveryDate) deliveryDate = unlabeledData.deliveryDate;
      }

      // Validate required fields
      if (!customerName || !phoneNumber || !address || !items) {
        logger.warn('Incomplete order data parsed', { customerName, phoneNumber, address, items });
        return null;
      }

      return {
        customerName: customerName.trim(),
        phoneNumber: phoneNumber.trim(),
        address: address.trim(),
        items: items.trim(),
        deliveryDate,
        addedBy: senderName
      };
    } catch (error) {
      logger.error('Error parsing order:', error);
      return null;
    }
  }

  static parseLabeledFormat(lines) {
    const result = {};
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      if (lowerLine.startsWith('name:')) {
        result.customerName = line.substring(5).trim();
      } else if (lowerLine.includes('phone') && lowerLine.includes(':')) {
        result.phoneNumber = line.split(':')[1].trim();
      } else if (lowerLine.startsWith('address:')) {
        result.address = line.substring(8).trim();
      } else if (lowerLine.includes('item') && lowerLine.includes(':')) {
        result.items = line.split(':')[1].trim();
      } else if (this.isDateString(line)) {
        result.deliveryDate = this.parseDate(line);
      }
    }

    return result;
  }

  static parseUnlabeledFormat(lines) {
    const result = {};
    const usedLines = new Set();

    // Find phone numbers first (most distinctive)
    const phoneNumbers = [];
    lines.forEach((line, index) => {
      if (this.isPhoneNumber(line)) {
        phoneNumbers.push({ line: line.trim(), index });
      }
    });

    // Use the first valid phone number found
    if (phoneNumbers.length > 0) {
      result.phoneNumber = phoneNumbers[0].line;
      usedLines.add(phoneNumbers[0].index);
    }

    // Find dates
    lines.forEach((line, index) => {
      if (this.isDateString(line) && !usedLines.has(index)) {
        result.deliveryDate = this.parseDate(line);
        usedLines.add(index);
      }
    });

    // Get remaining lines for name, address, items
    const remainingLines = lines.filter((line, index) => !usedLines.has(index));
    
    if (remainingLines.length >= 3) {
      // Smart assignment based on content patterns
      const assignments = this.assignRemainingFields(remainingLines);
      if (assignments.customerName) result.customerName = assignments.customerName;
      if (assignments.address) result.address = assignments.address;
      if (assignments.items) result.items = assignments.items;
    } else if (remainingLines.length >= 2) {
      // Handle cases with 2 or 3 remaining lines
      if (remainingLines.length === 3) {
        result.customerName = remainingLines[0];
        result.address = remainingLines[1];
        result.items = remainingLines[2];
      } else if (remainingLines.length === 2) {
        // Try to determine which field is missing
        const assignments = this.assignRemainingFields(remainingLines);
        if (assignments.customerName) result.customerName = assignments.customerName;
        if (assignments.address) result.address = assignments.address;
        if (assignments.items) result.items = assignments.items;
      }
    }

    return result;
  }

  static assignRemainingFields(lines) {
    const result = {};
    
    // Patterns to identify field types
    const namePatterns = [
      /^[A-Za-z\s]{2,50}$/, // Letters and spaces only, reasonable length
      /^[A-Za-z]+\s+[A-Za-z]+/ // At least two words
    ];
    
    const addressPatterns = [
      /\d+.*(?:street|road|avenue|lane|close|way|estate|island|mainland)/i,
      /(?:no\.|number)\s*\d+/i,
      /\d+[,\s]/, // Starts with number and comma/space
      /.{20,}/, // Longer text likely to be address
    ];
    
    const itemPatterns = [
      /(?:cake|food|pizza|burger|rice|chicken|beef|fish|drink|water|juice)/i,
      /\d+\s*(?:pack|piece|bottle|plate|portion)/i,
      /(?:\d+\s*x\s*|\d+\s+)/, // Quantity indicators
    ];

    const scores = lines.map(line => ({
      line,
      nameScore: this.calculatePatternScore(line, namePatterns),
      addressScore: this.calculatePatternScore(line, addressPatterns),
      itemScore: this.calculatePatternScore(line, itemPatterns)
    }));

    // Assign based on highest scores, ensuring each field gets one value
    const assigned = { name: false, address: false, items: false };
    
    // Sort by confidence and assign
    const sortedByConfidence = scores.map((score, index) => ({
      ...score,
      index,
      maxScore: Math.max(score.nameScore, score.addressScore, score.itemScore),
      bestType: score.nameScore >= score.addressScore && score.nameScore >= score.itemScore ? 'name' :
                score.addressScore >= score.itemScore ? 'address' : 'items'
    })).sort((a, b) => b.maxScore - a.maxScore);

    // Assign fields based on best matches
    for (const item of sortedByConfidence) {
      if (item.bestType === 'name' && !assigned.name) {
        result.customerName = item.line;
        assigned.name = true;
      } else if (item.bestType === 'address' && !assigned.address) {
        result.address = item.line;
        assigned.address = true;
      } else if (item.bestType === 'items' && !assigned.items) {
        result.items = item.line;
        assigned.items = true;
      }
    }

    // Fill any remaining unassigned fields in order
    const unassignedLines = lines.filter(line => 
      line !== result.customerName && 
      line !== result.address && 
      line !== result.items
    );

    let unassignedIndex = 0;
    if (!assigned.name && unassignedIndex < unassignedLines.length) {
      result.customerName = unassignedLines[unassignedIndex++];
    }
    if (!assigned.address && unassignedIndex < unassignedLines.length) {
      result.address = unassignedLines[unassignedIndex++];
    }
    if (!assigned.items && unassignedIndex < unassignedLines.length) {
      result.items = unassignedLines[unassignedIndex++];
    }

    return result;
  }

  static calculatePatternScore(text, patterns) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        score += 1;
      }
    }
    return score;
  }

  static isPhoneNumber(str) {
    // Remove all non-digit characters
    const cleaned = str.replace(/\D/g, '');
    
    // Check if it's a valid phone number length (10-15 digits)
    if (cleaned.length < 10 || cleaned.length > 15) {
      return false;
    }
    
    // Check if it starts with common patterns
    return (
      cleaned.startsWith('0') || // Local format (0801...)
      cleaned.startsWith('234') || // Country code (234801...)
      cleaned.startsWith('1') || // US format
      cleaned.length >= 10 // International format
    );
  }

  static isDateString(str) {
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{4}/,
      /\d{1,2}-\d{1,2}-\d{4}/,
      /\d{4}-\d{1,2}-\d{1,2}/,
      /(tomorrow|today)/i,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i
    ];
    
    return datePatterns.some(pattern => pattern.test(str));
  }

  static parseDate(dateStr) {
    try {
      const moment = require('moment');
      
      if (/tomorrow/i.test(dateStr)) {
        return moment().add(1, 'day').format('YYYY-MM-DD');
      } else if (/today/i.test(dateStr)) {
        return moment().format('YYYY-MM-DD');
      }
      
      // Try to parse various date formats
      const formats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'];
      for (const format of formats) {
        const parsed = moment(dateStr, format, true);
        if (parsed.isValid()) {
          return parsed.format('YYYY-MM-DD');
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error parsing date:', error);
      return null;
    }
  }
}

module.exports = OrderParser;