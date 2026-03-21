const express = require('express');
const { auth } = require('../middleware/auth');
const Settings = require('../models/Settings');
const net = require('net');

const router = express.Router();

// Helper: get a network printer connection (ESC/POS over TCP)
function connectNetworkPrinter(address, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Connexion timeout'));
    }, timeout);

    socket.connect(port, address, () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Helper: build ESC/POS binary buffer for a receipt
function buildEscPosReceipt(ticketData, paperWidth = 80) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const cmds = [];
  const cols = paperWidth === 58 ? 32 : 48;

  // Init printer
  cmds.push(`${ESC}@`);

  // Center + bold + double height: Restaurant name
  cmds.push(`${ESC}a\x01`); // center
  cmds.push(`${ESC}E\x01`); // bold on
  cmds.push(`${GS}!\x11`); // double width+height
  cmds.push(`${ticketData.restaurantName || 'Restaurant'}\n`);
  cmds.push(`${GS}!\x00`); // normal size
  cmds.push(`${ESC}E\x00`); // bold off

  // Address & phone
  if (ticketData.address) cmds.push(`${ticketData.address}\n`);
  if (ticketData.phone) cmds.push(`Tel: ${ticketData.phone}\n`);

  // Separator
  cmds.push('-'.repeat(cols) + '\n');

  // Left align
  cmds.push(`${ESC}a\x00`);

  // Ticket info
  cmds.push(`Ticket: ${ticketData.ticketNumber}\n`);
  if (ticketData.orderType === 'dine_in' && ticketData.tableName) {
    cmds.push(`Table: ${ticketData.tableName}\n`);
  } else if (ticketData.orderType === 'delivery') {
    cmds.push(`Livraison: ${ticketData.deliveryClient || ''}\n`);
    if (ticketData.deliveryAddress) cmds.push(`Adresse: ${ticketData.deliveryAddress}\n`);
  } else if (ticketData.orderType === 'takeaway') {
    cmds.push(`A emporter\n`);
  }
  cmds.push(`Serveur: ${ticketData.agentName}\n`);
  cmds.push(`Date: ${new Date().toLocaleString('fr-FR')}\n`);
  cmds.push('-'.repeat(cols) + '\n');

  // Items
  for (const item of ticketData.items || []) {
    const qty = `${item.quantity}x ${item.name}`;
    const price = `${item.totalPrice} ${ticketData.currency || 'FCFA'}`;
    const spaces = cols - qty.length - price.length;
    if (spaces > 0) {
      cmds.push(qty + ' '.repeat(spaces) + price + '\n');
    } else {
      cmds.push(qty + '\n');
      cmds.push(' '.repeat(cols - price.length) + price + '\n');
    }
    // Item options
    if (item.options && item.options.length > 0) {
      for (const opt of item.options) {
        cmds.push(`  + ${opt.name} ${opt.price > 0 ? opt.price + ' ' + (ticketData.currency || 'FCFA') : ''}\n`);
      }
    }
  }

  cmds.push('-'.repeat(cols) + '\n');

  // Totals
  const addTotalLine = (label, value) => {
    const v = `${value} ${ticketData.currency || 'FCFA'}`;
    const s = cols - label.length - v.length;
    cmds.push(label + (s > 0 ? ' '.repeat(s) : ' ') + v + '\n');
  };

  addTotalLine('Sous-total', ticketData.subtotal);
  if (ticketData.taxAmount > 0) addTotalLine('TVA', ticketData.taxAmount);
  if (ticketData.discount > 0) addTotalLine('Remise', `-${ticketData.discount}`);

  cmds.push('='.repeat(cols) + '\n');
  cmds.push(`${ESC}E\x01`); // bold on
  addTotalLine('TOTAL', ticketData.total);
  cmds.push(`${ESC}E\x00`); // bold off
  cmds.push('='.repeat(cols) + '\n');

  // Payment info
  if (ticketData.paymentMethod) {
    cmds.push(`Paiement: ${ticketData.paymentMethod}\n`);
  }

  // Footer
  cmds.push('\n');
  cmds.push(`${ESC}a\x01`); // center
  cmds.push(`${ticketData.footer || 'Merci de votre visite!'}\n`);
  cmds.push('\n\n\n');

  // Cut paper
  cmds.push(`${GS}V\x00`); // full cut

  return Buffer.from(cmds.join(''), 'binary');
}

// POST /api/printer/test - Test printer connection
router.post('/test', auth, async (req, res) => {
  try {
    const { type, address, port } = req.body;

    if (type === 'network') {
      if (!address) {
        return res.status(400).json({ success: false, message: 'Adresse IP requise' });
      }
      try {
        const socket = await connectNetworkPrinter(address, port || 9100);
        socket.destroy();
        return res.json({
          success: true,
          message: 'Imprimante réseau connectée',
          data: { type, address, port: port || 9100, connected: true, message: `Connectée à ${address}:${port || 9100}` }
        });
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: `Impossible de se connecter à ${address}:${port || 9100} — ${err.message}`,
          data: { connected: false, type, message: err.message }
        });
      }
    }

    if (type === 'usb') {
      // USB printers: detected at OS level. The server can check if escpos-usb finds a device.
      try {
        const escposUsb = require('escpos-usb');
        const device = new escposUsb();
        // If no error, device exists
        return res.json({
          success: true,
          message: 'Imprimante USB détectée',
          data: { type: 'usb', connected: true, message: 'Imprimante USB connectée' }
        });
      } catch (err) {
        return res.json({
          success: true,
          message: 'Aucune imprimante USB détectée. Vérifiez la connexion.',
          data: { type: 'usb', connected: false, message: 'Aucune imprimante USB détectée' }
        });
      }
    }

    if (type === 'bluetooth') {
      return res.json({
        success: true,
        message: 'Bluetooth: vérifiez l\'appairage depuis les paramètres système',
        data: { type: 'bluetooth', connected: false, message: 'Appairage Bluetooth requis via le système' }
      });
    }

    res.json({
      success: true,
      data: { type: 'none', connected: false, message: 'Aucune imprimante configurée' }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/printer/print-ticket - Print a ticket
router.post('/print-ticket', auth, async (req, res) => {
  try {
    const { ticketData, printerConfig } = req.body;
    const config = printerConfig || {};
    const receiptBuffer = buildEscPosReceipt(ticketData, config.paperWidth || 80);

    if (config.type === 'network' && config.address) {
      try {
        const socket = await connectNetworkPrinter(config.address, config.port || 9100);
        socket.write(receiptBuffer);
        socket.end();
        return res.json({ success: true, message: 'Ticket imprimé avec succès', data: { printed: true } });
      } catch (err) {
        return res.status(500).json({ success: false, message: `Erreur impression réseau: ${err.message}`, data: { printed: false } });
      }
    }

    if (config.type === 'usb') {
      try {
        const escpos = require('escpos');
        const escposUsb = require('escpos-usb');
        const device = new escposUsb();
        const printer = new escpos.Printer(device);

        await new Promise((resolve, reject) => {
          device.open((err) => {
            if (err) return reject(err);
            printer.raw(receiptBuffer);
            printer.close(resolve);
          });
        });

        return res.json({ success: true, message: 'Ticket imprimé via USB', data: { printed: true } });
      } catch (err) {
        return res.status(500).json({ success: false, message: `Erreur impression USB: ${err.message}`, data: { printed: false } });
      }
    }

    // Fallback: return the receipt data for browser-based printing
    const receiptLines = [];
    receiptLines.push({ type: 'text', value: ticketData.restaurantName || 'Restaurant', align: 'center', bold: true, size: 'large' });
    receiptLines.push({ type: 'text', value: ticketData.address || '', align: 'center' });
    receiptLines.push({ type: 'text', value: ticketData.phone || '', align: 'center' });
    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'text', value: `Ticket: ${ticketData.ticketNumber}`, align: 'left' });
    if (ticketData.tableName) receiptLines.push({ type: 'text', value: `Table: ${ticketData.tableName}`, align: 'left' });
    receiptLines.push({ type: 'text', value: `Serveur: ${ticketData.agentName}`, align: 'left' });
    receiptLines.push({ type: 'text', value: `Date: ${new Date().toLocaleString('fr-FR')}`, align: 'left' });
    receiptLines.push({ type: 'line' });

    for (const item of ticketData.items || []) {
      receiptLines.push({ type: 'item', name: `${item.quantity}x ${item.name}`, price: `${item.totalPrice} ${ticketData.currency || 'FCFA'}` });
    }

    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'item', name: 'Sous-total', price: `${ticketData.subtotal} ${ticketData.currency || 'FCFA'}` });
    if (ticketData.taxAmount > 0) receiptLines.push({ type: 'item', name: 'TVA', price: `${ticketData.taxAmount} ${ticketData.currency || 'FCFA'}` });
    if (ticketData.discount > 0) receiptLines.push({ type: 'item', name: 'Remise', price: `-${ticketData.discount} ${ticketData.currency || 'FCFA'}` });
    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'item', name: 'TOTAL', price: `${ticketData.total} ${ticketData.currency || 'FCFA'}`, bold: true });
    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'text', value: ticketData.footer || 'Merci de votre visite!', align: 'center' });

    res.json({
      success: true,
      message: 'Données ticket générées (aucune imprimante physique configurée)',
      data: { receiptLines, printed: false, fallback: true }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/printer/status
router.get('/status', auth, async (req, res) => {
  try {
    const settings = await Settings.findOne();
    const config = settings?.printerConfig || { type: 'none' };

    if (config.type === 'network' && config.address) {
      try {
        const socket = await connectNetworkPrinter(config.address, config.port || 9100, 3000);
        socket.destroy();
        return res.json({
          success: true,
          data: { connected: true, type: 'network', message: `Connectée à ${config.address}:${config.port || 9100}` }
        });
      } catch {
        return res.json({
          success: true,
          data: { connected: false, type: 'network', message: `Impossible de joindre ${config.address}:${config.port || 9100}` }
        });
      }
    }

    if (config.type === 'usb') {
      try {
        const escposUsb = require('escpos-usb');
        new escposUsb();
        return res.json({ success: true, data: { connected: true, type: 'usb', message: 'Imprimante USB connectée' } });
      } catch {
        return res.json({ success: true, data: { connected: false, type: 'usb', message: 'Aucune imprimante USB détectée' } });
      }
    }

    res.json({
      success: true,
      data: { connected: false, type: config.type || 'none', message: 'Aucune imprimante configurée' }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
