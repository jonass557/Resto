const express = require('express');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/printer/test - Test printer connection
router.post('/test', auth, async (req, res) => {
  try {
    const { type, address, port } = req.body;
    // In a real implementation, this would connect to the printer
    // For now, we simulate the response
    res.json({
      success: true,
      message: 'Test d\'impression envoyé',
      data: { type, address, port, status: 'connected' }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/printer/print-ticket - Print a ticket
router.post('/print-ticket', auth, async (req, res) => {
  try {
    const { ticketData, printerConfig } = req.body;

    // ESC/POS formatted receipt data
    const receiptLines = [];
    receiptLines.push({ type: 'text', value: ticketData.restaurantName || 'Restaurant', align: 'center', bold: true, size: 'large' });
    receiptLines.push({ type: 'text', value: ticketData.address || '', align: 'center' });
    receiptLines.push({ type: 'text', value: ticketData.phone || '', align: 'center' });
    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'text', value: `Ticket: ${ticketData.ticketNumber}`, align: 'left' });
    receiptLines.push({ type: 'text', value: `Table: ${ticketData.tableName}`, align: 'left' });
    receiptLines.push({ type: 'text', value: `Serveur: ${ticketData.agentName}`, align: 'left' });
    receiptLines.push({ type: 'text', value: `Date: ${new Date().toLocaleString('fr-FR')}`, align: 'left' });
    receiptLines.push({ type: 'line' });

    for (const item of ticketData.items || []) {
      receiptLines.push({
        type: 'item',
        name: `${item.quantity}x ${item.name}`,
        price: `${item.totalPrice} ${ticketData.currency || 'FCFA'}`
      });
    }

    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'item', name: 'Sous-total', price: `${ticketData.subtotal} ${ticketData.currency || 'FCFA'}` });
    if (ticketData.taxAmount > 0) {
      receiptLines.push({ type: 'item', name: 'TVA', price: `${ticketData.taxAmount} ${ticketData.currency || 'FCFA'}` });
    }
    if (ticketData.discount > 0) {
      receiptLines.push({ type: 'item', name: 'Remise', price: `-${ticketData.discount} ${ticketData.currency || 'FCFA'}` });
    }
    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'item', name: 'TOTAL', price: `${ticketData.total} ${ticketData.currency || 'FCFA'}`, bold: true });
    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'text', value: ticketData.footer || 'Merci de votre visite!', align: 'center' });

    // In production, this sends to the actual printer via ESC/POS
    // For development, we return the receipt data
    res.json({
      success: true,
      message: 'Ticket imprimé avec succès',
      data: { receiptLines, printed: true }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/printer/status
router.get('/status', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        connected: false,
        type: 'none',
        message: 'Aucune imprimante configurée'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
