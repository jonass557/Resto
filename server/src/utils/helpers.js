const { v4: uuidv4 } = require('uuid');

function generateOrderNumber() {
  const date = new Date();
  const prefix = 'CMD';
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${dateStr}-${random}`;
}

function generateTicketNumber(type = 'order') {
  const date = new Date();
  const prefixes = { order: 'TKT', invoice: 'FAC', refund: 'AVR' };
  const prefix = prefixes[type] || 'TKT';
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${dateStr}-${random}`;
}

function generatePaymentNumber() {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PAY-${dateStr}-${random}`;
}

function generateSessionNumber() {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CSS-${dateStr}-${random}`;
}

function generateGiftCardCode() {
  return `GC-${uuidv4().substring(0, 8).toUpperCase()}`;
}

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.totalPrice, 0);
}

function getDateRange(period) {
  const now = new Date();
  let start, end;
  
  switch (period) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
    case 'week':
      const day = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - day));
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }
  
  return { start, end };
}

module.exports = {
  generateOrderNumber,
  generateTicketNumber,
  generatePaymentNumber,
  generateSessionNumber,
  generateGiftCardCode,
  calculateTotal,
  getDateRange
};
