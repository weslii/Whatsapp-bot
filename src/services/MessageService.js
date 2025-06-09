// src/services/MessageService.js
const moment = require('moment');
const Helpers = require('../utils/helpers');

class MessageService {
  static formatSalesConfirmation(order) {
    const deliveryDateText = order.delivery_date 
      ? `\n📅 *Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}`
      : '';

    return `✅ *ORDER CONFIRMED*
📋 *Order #${order.order_id}*

👤 *Customer:* ${order.customer_name}
📱 *Phone:* ${order.phone_number}
📍 *Address:* ${order.address}
🛍️ *Items:* ${order.items}${deliveryDateText}
🕐 *Time:* ${moment(order.created_at).format('DD/MM/YYYY HH:mm')}

Your order has been forwarded to the delivery team. 📦`;
  }

  static formatOrderConfirmation(order) {
    const deliveryDateText = order.delivery_date 
      ? `\n📅 *Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}`
      : '';

    return `✅ *ORDER RECORDED*
📋 *Order #${order.order_id}*
👤 *Customer:* ${order.customer_name}
📱 *Phone:* ${order.phone_number}
📍 *Address:* ${order.address}
🛍️ *Items:* ${order.items}${deliveryDateText}
🕐 *Time:* ${moment(order.created_at).format('DD/MM/YYYY HH:mm')}
➕ *Added by:* ${order.added_by}

💡 *To mark as delivered:*
• Reply "done" to this message, OR
• Type "done #${order.order_id}"
💡 *To cancel this order:*
• Type "cancel #${order.order_id}"
🔧 *Other commands:* /help`;
  }

  static formatDailyReport(report, date) {
    return `📊 *DAILY REPORT - ${moment(date).format('DD/MM/YYYY')}*

📦 *Total Orders:* ${report.total_orders}
⏳ *Pending:* ${report.pending_orders}
✅ *Delivered:* ${report.delivered_orders}
❌ *Cancelled:* ${report.cancelled_orders}

📈 *Completion Rate:* ${report.total_orders > 0 ? Math.round((report.delivered_orders / report.total_orders) * 100) : 0}%`;
  }

  static formatPendingOrders(orders) {
    if (orders.length === 0) {
      return '✅ *No pending orders!*\nAll orders have been completed or cancelled.';
    }

    let message = `⏳ *PENDING ORDERS (${orders.length})*\n\n`;
    
    orders.forEach((order, index) => {
      const timeAgo = moment(order.created_at).fromNow();
      message += `${index + 1}. *Order #${order.order_id}*
👤 ${order.customer_name}
📱 ${order.phone_number}
📍 ${order.address}
🛍️ ${order.items}
🕐 ${timeAgo}
${order.delivery_date ? `📅 Due: ${moment(order.delivery_date).format('DD/MM/YYYY')}` : ''}

`;
    });

    return message.trim();
  }

  static formatWeeklyReport(report) {
    return `📊 *WEEKLY REPORT*

📦 *Total Orders:* ${report.total_orders}
⏳ *Pending:* ${report.pending_orders}
✅ *Delivered:* ${report.delivered_orders}
❌ *Cancelled:* ${report.cancelled_orders}

📈 *Completion Rate:* ${report.total_orders > 0 ? Math.round((report.delivered_orders / report.total_orders) * 100) : 0}%`;
  }

  static formatMonthlyReport(report) {
    return `📊 *MONTHLY REPORT*

📦 *Total Orders:* ${report.total_orders}
⏳ *Pending:* ${report.pending_orders}
✅ *Delivered:* ${report.delivered_orders}
❌ *Cancelled:* ${report.cancelled_orders}

📈 *Completion Rate:* ${report.total_orders > 0 ? Math.round((report.delivered_orders / report.total_orders) * 100) : 0}%`;
  }

  static formatHelpMessage() {
    return `🤖 *DELIVERY BOT COMMANDS*

*Order Management:*
• Reply "done" to order message to mark as delivered
• Type "done #ORDER_ID" to mark order as delivered
• Type "cancel #ORDER_ID" to cancel an order

*Reports:*
• /daily - Get today's report
• /pending - Get pending orders
• /weekly - Get weekly report
• /monthly - Get monthly report
• /help - Show this help message

*Note:* Orders are automatically detected in the sales group and forwarded here.`;
  }
}

module.exports = MessageService;