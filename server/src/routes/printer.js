const express = require('express');
const { auth } = require('../middleware/auth');
const Settings = require('../models/Settings');
const Ticket = require('../models/Ticket');
const CashRegister = require('../models/CashRegister');
const net = require('net');

const router = express.Router();

// Helper: sanitize IP address (replace dashes/spaces with dots)
function sanitizeIP(ip) {
  return (ip || '').trim().replace(/[-\s]+/g, '.');
}

// Helper: detect private/local IP addresses (unreachable from cloud)
function isPrivateIP(ip) {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost)/i.test(ip);
}

// Helper: detect if server is running on cloud (Render, Heroku, etc.)
function isCloudHosted() {
  return !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.HEROKU || process.env.DYNO || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME);
}

// Helper: get a network printer connection (ESC/POS over TCP)
function connectNetworkPrinter(address, port, timeout = 3000) {
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

  // Deleted invoice banner — bold + double size + underline (supported by all thermal printers)
  if (ticketData.deleted) {
    cmds.push('*'.repeat(cols) + '\n');
    cmds.push(`${ESC}a\x01`); // center
    cmds.push(`${ESC}E\x01`); // bold
    cmds.push(`${GS}!\x11`); // double width+height
    cmds.push(`${ESC}-\x02`); // underline thick
    cmds.push('FACTURE SUPPRIMEE\n');
    cmds.push(`${ESC}-\x00`); // underline off
    cmds.push(`${GS}!\x00`); // normal size
    cmds.push(`${ESC}E\x00`); // bold off
    cmds.push(`${ESC}a\x00`); // left
    cmds.push('*'.repeat(cols) + '\n');
  } else {
    cmds.push('-'.repeat(cols) + '\n');
  }

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
  if (ticketData.deleted) {
    cmds.push(`${ESC}E\x01Supprimee par: ${ticketData.adminName || ''}${ESC}E\x00\n`);
    if (ticketData.deletedAt) cmds.push(`Date suppression: ${new Date(ticketData.deletedAt).toLocaleString('fr-FR')}\n`);
    cmds.push('-'.repeat(cols) + '\n');
  } else {
    cmds.push('-'.repeat(cols) + '\n');
  }

  // Items — grouped by category when available
  const isDeleted = !!ticketData.deleted;
  const printItem = (item) => {
    const qtyPrefix = isDeleted ? '-' : '';
    const qty = `${qtyPrefix}${item.quantity}x ${item.name}`;
    const price = `${item.totalPrice} ${ticketData.currency || 'FCFA'}`;
    const spaces = cols - qty.length - price.length;
    let line;
    if (spaces > 0) {
      line = qty + ' '.repeat(spaces) + price + '\n';
    } else {
      line = qty + '\n' + ' '.repeat(Math.max(0, cols - price.length)) + price + '\n';
    }
    if (isDeleted) {
      cmds.push(`${ESC}E\x01`); // bold on
      cmds.push(`${ESC}-\x01`); // underline on
      cmds.push(line);
      cmds.push(`${ESC}-\x00`); // underline off
      cmds.push(`${ESC}E\x00`); // bold off
    } else {
      cmds.push(line);
    }
    if (item.options && item.options.length > 0) {
      for (const opt of item.options) {
        cmds.push(`  + ${opt.name} ${opt.price > 0 ? opt.price + ' ' + (ticketData.currency || 'FCFA') : ''}\n`);
      }
    }
  };

  const allItems = ticketData.items || [];
  const hasCategories = allItems.some(i => i.category);

  if (hasCategories) {
    const groups = {};
    const ungrouped = [];
    for (const item of allItems) {
      if (item.category) {
        if (!groups[item.category]) groups[item.category] = [];
        groups[item.category].push(item);
      } else {
        ungrouped.push(item);
      }
    }
    for (const item of ungrouped) printItem(item);
    for (const [cat, catItems] of Object.entries(groups)) {
      const catLabel = `-- ${cat.toUpperCase()} --`;
      const pad = Math.floor((cols - catLabel.length) / 2);
      cmds.push(`${ESC}E\x01`);
      cmds.push((pad > 0 ? ' '.repeat(pad) : '') + catLabel + '\n');
      cmds.push(`${ESC}E\x00`);
      for (const item of catItems) printItem(item);
    }
  } else {
    for (const item of allItems) printItem(item);
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
    const methodLabel = {
      cash: 'Espèces',
      card: 'Carte bancaire',
      mobile_money: 'Mobile Money',
      mixed: 'Paiement mixte',
      gift_card: 'Carte cadeau'
    }[ticketData.paymentMethod] || ticketData.paymentMethod;

    if (ticketData.paymentMethod === 'mixed' && ticketData.mixedPayments?.length > 0) {
      cmds.push(`Paiement: ${methodLabel}\n`);
      for (const mp of ticketData.mixedPayments) {
        if (!mp.amount || mp.amount <= 0) continue;
        const mpLabel = {
          cash: 'Espèces',
          card: 'Carte bancaire',
          mobile_money: 'Mobile Money',
          gift_card: 'Carte cadeau'
        }[mp.method] || mp.method;
        const mpVal = `${mp.amount} ${ticketData.currency || 'FCFA'}`;
        const mpPad = cols - mpLabel.length - mpVal.length;
        cmds.push(mpLabel + (mpPad > 0 ? ' '.repeat(mpPad) : ' ') + mpVal + '\n');
      }
      if (ticketData.amountReceived > 0) {
        const recVal = `${ticketData.amountReceived} ${ticketData.currency || 'FCFA'}`;
        const recLabel = 'Total reçu';
        const recPad = cols - recLabel.length - recVal.length;
        cmds.push(recLabel + (recPad > 0 ? ' '.repeat(recPad) : ' ') + recVal + '\n');
      }
    } else {
      cmds.push(`Paiement: ${methodLabel}\n`);
      if (ticketData.amountReceived > 0) {
        const recVal = `${ticketData.amountReceived} ${ticketData.currency || 'FCFA'}`;
        const recLabel = 'Montant reçu';
        const recPad = cols - recLabel.length - recVal.length;
        cmds.push(recLabel + (recPad > 0 ? ' '.repeat(recPad) : ' ') + recVal + '\n');
      }
    }
  }

  // Mobile Money payment codes
  if (ticketData.orangeMoneyCode || ticketData.mtnMomoCode) {
    cmds.push('\n');
    cmds.push(`${ESC}a\x01`); // center
    cmds.push(`${ESC}E\x01`); // bold
    cmds.push('--- PAIEMENT MOBILE ---\n');
    cmds.push(`${ESC}E\x00`); // bold off
    if (ticketData.orangeMoneyCode) {
      cmds.push(`Orange Money: ${ticketData.orangeMoneyCode}\n`);
      if (ticketData.orangeMoneyName) cmds.push(`Nom: ${ticketData.orangeMoneyName}\n`);
    }
    if (ticketData.mtnMomoCode) {
      cmds.push(`MTN MoMo: ${ticketData.mtnMomoCode}\n`);
      if (ticketData.mtnMomoName) cmds.push(`Nom: ${ticketData.mtnMomoName}\n`);
    }
    cmds.push(`${ESC}a\x00`); // left align
  }

  // Footer
  cmds.push('\n');
  cmds.push(`${ESC}a\x01`); // center
  if (!ticketData.deleted) {
    cmds.push(`${ticketData.footer || 'Merci de votre visite!'}\n`);
  }

  // Closing banner for deleted invoices
  if (ticketData.deleted) {
    cmds.push('*'.repeat(cols) + '\n');
    cmds.push(`${ESC}a\x01`); // center
    cmds.push(`${ESC}E\x01`); // bold
    cmds.push(`${GS}!\x11`); // double width+height
    cmds.push(`${ESC}-\x02`); // underline thick
    cmds.push('FACTURE SUPPRIMEE\n');
    cmds.push(`${ESC}-\x00`); // underline off
    cmds.push(`${GS}!\x00`); // normal size
    cmds.push(`${ESC}E\x00`); // bold off
    cmds.push(`${ESC}a\x00`); // left
    cmds.push('*'.repeat(cols) + '\n');
  }
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
      const cleanAddress = sanitizeIP(address);
      if (!cleanAddress) {
        return res.status(400).json({ success: false, message: 'Adresse IP requise' });
      }
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(cleanAddress)) {
        return res.status(400).json({ success: false, message: `Adresse IP invalide: "${cleanAddress}". Format attendu: 192.168.1.100` });
      }
      if (isCloudHosted() && isPrivateIP(cleanAddress)) {
        return res.status(400).json({
          success: false,
          message: `Impossible: l'adresse ${cleanAddress} est une IP locale (réseau privé). Le serveur est hébergé dans le cloud et ne peut pas atteindre votre réseau local. Utilisez le Bluetooth ou installez le serveur sur votre réseau local.`,
          data: { connected: false, type, message: 'IP locale inaccessible depuis le cloud', cloudError: true }
        });
      }
      try {
        const socket = await connectNetworkPrinter(cleanAddress, port || 9100);
        socket.destroy();
        return res.json({
          success: true,
          message: 'Imprimante réseau connectée',
          data: { type, address: cleanAddress, port: port || 9100, connected: true, message: `Connectée à ${cleanAddress}:${port || 9100}` }
        });
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: `Impossible de se connecter à ${cleanAddress}:${port || 9100} — ${err.message}`,
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

// POST /api/printer/print-ticket - Print a ticket (accepts ticketId or ticketData)
router.post('/print-ticket', auth, async (req, res) => {
  try {
    let { ticketData, printerConfig, ticketId } = req.body;

    // If ticketId is provided, fetch ticket data from DB
    if (ticketId && !ticketData) {
      const ticket = await Ticket.findById(ticketId)
        .populate('table', 'number name zone')
        .populate('agent', 'firstName lastName')
        .populate('client', 'firstName lastName')
        .populate('payment');
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket non trouvé' });

      const settings = await Settings.findOne();
      const mmc = settings?.mobileMoneyConfig || {};

      ticketData = {
        ticketNumber: ticket.ticketNumber,
        type: ticket.type,
        orderType: ticket.orderType,
        tableName: ticket.table ? `${ticket.table.number}${ticket.table.name ? ' - ' + ticket.table.name : ''}` : null,
        tableNumber: ticket.table?.number || null,
        agentName: ticket.agent ? `${ticket.agent.firstName} ${ticket.agent.lastName}` : '',
        clientName: ticket.client ? `${ticket.client.firstName} ${ticket.client.lastName}` : null,
        items: ticket.items || [],
        subtotal: ticket.subtotal,
        taxAmount: ticket.taxAmount,
        discount: ticket.discount,
        total: ticket.total,
        isPaid: ticket.isPaid,
        paymentMethod: ticket.payment?.method || null,
        amountReceived: ticket.payment?.amountReceived || 0,
        mixedPayments: ticket.payment?.mixedPayments || [],
        restaurantName: settings?.restaurantName || 'Restaurant',
        address: settings?.address || '',
        phone: settings?.phone || '',
        currency: settings?.currencySymbol || 'FCFA',
        footer: settings?.receiptFooter || 'Merci de votre visite!',
        orangeMoneyCode: mmc.orangeMoneyEnabled ? mmc.orangeMoneyCode : null,
        orangeMoneyName: mmc.orangeMoneyEnabled ? mmc.orangeMoneyName : null,
        mtnMomoCode: mmc.mtnMomoEnabled ? mmc.mtnMomoCode : null,
        mtnMomoName: mmc.mtnMomoEnabled ? mmc.mtnMomoName : null,
      };

      if (!printerConfig) {
        printerConfig = settings?.printerConfig || {};
      }
    }

    // Always fall back to DB printer config if not provided in request
    if (!printerConfig || !printerConfig.type) {
      const settings = await Settings.findOne();
      printerConfig = settings?.printerConfig || {};
    }

    const config = printerConfig || {};
    const receiptBuffer = buildEscPosReceipt(ticketData, config.paperWidth || 80);

    if (config.type === 'network' && config.address) {
      const cleanAddr = sanitizeIP(config.address);
      if (isCloudHosted() && isPrivateIP(cleanAddr)) {
        // Cloud + IP privée → émettre via Socket.IO pour agent local
        const io = req.app.get('io');
        const printJob = {
          id: `print-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          type: 'network',
          address: cleanAddr,
          port: config.port || 9100,
          ticketData,
          receiptBuffer: receiptBuffer.toString('base64'),
        };

        // N'envoyer qu'au 1er agent enregistré pour éviter les impressions multiples
        const agentSockets = await io.in('print-agents').fetchSockets();
        if (agentSockets.length > 0) {
          agentSockets[0].emit('print-job', printJob);
          console.log(`📤 Job ${printJob.id} envoyé à l'agent: ${agentSockets[0].id}`);
        } else {
          // Aucun agent enregistré — diffuser en fallback
          io.emit('print-job', printJob);
          console.log(`📤 Job ${printJob.id} diffusé (aucun agent enregistré)`);
        }

        return res.json({ 
          success: true, 
          message: 'Job envoyé à l\'agent d\'impression local.', 
          data: { printed: false, queued: true, jobId: printJob.id } 
        });
      }
      try {
        const socket = await connectNetworkPrinter(cleanAddr, config.port || 9100);
        await new Promise((resolve, reject) => {
          socket.on('error', reject); // prevent unhandled error event crash
          socket.write(receiptBuffer, (err) => {
            if (err) return reject(err);
            socket.end(resolve);
          });
        });
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
    receiptLines.push({ type: 'text', value: `${ticketData.type === 'invoice' ? 'Facture' : 'Ticket'}: ${ticketData.ticketNumber}`, align: 'left' });
    if (ticketData.tableName) receiptLines.push({ type: 'text', value: `Table: ${ticketData.tableName}`, align: 'left' });
    receiptLines.push({ type: 'text', value: `Serveur: ${ticketData.agentName}`, align: 'left' });
    receiptLines.push({ type: 'text', value: `Date: ${new Date().toLocaleString('fr-FR')}`, align: 'left' });
    receiptLines.push({ type: 'line' });

    const fallbackItems = ticketData.items || [];
    const fallbackHasCategories = fallbackItems.some(i => i.category);
    if (fallbackHasCategories) {
      const fbGroups = {};
      const fbUngrouped = [];
      for (const item of fallbackItems) {
        if (item.category) {
          if (!fbGroups[item.category]) fbGroups[item.category] = [];
          fbGroups[item.category].push(item);
        } else {
          fbUngrouped.push(item);
        }
      }
      for (const item of fbUngrouped) {
        receiptLines.push({ type: 'item', name: `${item.quantity}x ${item.name}`, price: `${item.totalPrice} ${ticketData.currency || 'FCFA'}` });
      }
      for (const [cat, catItems] of Object.entries(fbGroups)) {
        receiptLines.push({ type: 'text', value: `-- ${cat.toUpperCase()} --`, align: 'center', bold: true });
        for (const item of catItems) {
          receiptLines.push({ type: 'item', name: `${item.quantity}x ${item.name}`, price: `${item.totalPrice} ${ticketData.currency || 'FCFA'}` });
        }
      }
    } else {
      for (const item of fallbackItems) {
        receiptLines.push({ type: 'item', name: `${item.quantity}x ${item.name}`, price: `${item.totalPrice} ${ticketData.currency || 'FCFA'}` });
      }
    }

    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'item', name: 'Sous-total', price: `${ticketData.subtotal} ${ticketData.currency || 'FCFA'}` });
    if (ticketData.taxAmount > 0) receiptLines.push({ type: 'item', name: 'TVA', price: `${ticketData.taxAmount} ${ticketData.currency || 'FCFA'}` });
    if (ticketData.discount > 0) receiptLines.push({ type: 'item', name: 'Remise', price: `-${ticketData.discount} ${ticketData.currency || 'FCFA'}` });
    receiptLines.push({ type: 'line' });
    receiptLines.push({ type: 'item', name: 'TOTAL', price: `${ticketData.total} ${ticketData.currency || 'FCFA'}`, bold: true });
    receiptLines.push({ type: 'line' });

    // Add mobile money codes to fallback receipt
    if (ticketData.orangeMoneyCode || ticketData.mtnMomoCode) {
      receiptLines.push({ type: 'text', value: '--- PAIEMENT MOBILE ---', align: 'center', bold: true });
      if (ticketData.orangeMoneyCode) {
        receiptLines.push({ type: 'text', value: `Orange Money: ${ticketData.orangeMoneyCode}`, align: 'center' });
        if (ticketData.orangeMoneyName) receiptLines.push({ type: 'text', value: `Nom: ${ticketData.orangeMoneyName}`, align: 'center' });
      }
      if (ticketData.mtnMomoCode) {
        receiptLines.push({ type: 'text', value: `MTN MoMo: ${ticketData.mtnMomoCode}`, align: 'center' });
        if (ticketData.mtnMomoName) receiptLines.push({ type: 'text', value: `Nom: ${ticketData.mtnMomoName}`, align: 'center' });
      }
      receiptLines.push({ type: 'line' });
    }

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

// POST /api/printer/print-global-report — Impression du rapport journalier
router.post('/print-global-report', auth, async (req, res) => {
  try {
    const { date, service } = req.body;

    // --- Fetch daily data directly from DB ---
    const targetDate = date ? new Date(date) : new Date();
    const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

    const sessionQuery = { openedAt: { $gte: dayStart, $lte: dayEnd }, status: 'closed' };
    if (service && service !== 'all') sessionQuery.service = Number(service);

    const sessions = await CashRegister.find(sessionQuery)
      .populate('agent', 'firstName lastName')
      .sort({ openedAt: 1 });

    let grandTotal = 0, grandCash = 0, grandCard = 0, grandMobile = 0;
    let totalInvoices = 0;
    const detail = [];

    for (const sess of sessions) {
      if (!sess.agent) continue;
      const dateFilter = { $gte: sess.openedAt };
      if (sess.closedAt) dateFilter.$lte = sess.closedAt;
      const invoices = await Ticket.find({ agent: sess.agent._id, type: 'invoice', isPaid: true, createdAt: dateFilter })
        .populate('payment').sort({ createdAt: 1 });
      const sessionTotal = invoices.reduce((s, i) => s + i.total, 0);
      grandTotal   += sessionTotal;
      grandCash    += sess.totalCash    || 0;
      grandCard    += sess.totalCard    || 0;
      grandMobile  += sess.totalMobileMoney || 0;
      totalInvoices += invoices.length;
      detail.push({ session: sess, invoices, totalAmount: sessionTotal });
    }

    // --- Build ESC/POS ---
    const settings = await Settings.findOne();
    const config = settings?.printerConfig || {};
    const cols = (config.paperWidth || 80) === 58 ? 32 : 48;
    const ESC = '\x1B';
    const GS  = '\x1D';
    const cur = settings?.currencySymbol || 'FCFA';
    const fmt = (n) => `${(n || 0).toLocaleString('fr-FR')} ${cur}`;
    const padLine = (l, v) => {
      const s = cols - l.length - v.length;
      return l + (s > 0 ? ' '.repeat(s) : ' ') + v + '\n';
    };
    const truncate = (str, max) => str && str.length > max ? str.slice(0, max - 1) + '.' : (str || '');
    const PAYMENT_FR = { cash: 'Especes', card: 'Carte', mobile_money: 'Mobile', mixed: 'Mixte', gift_card: 'Cadeau' };
    const sep  = '-'.repeat(cols) + '\n';
    const dsep = '='.repeat(cols) + '\n';

    const cmds = [];
    cmds.push(`${ESC}@`);
    cmds.push(`${ESC}a\x01${ESC}E\x01${GS}!\x11`);
    cmds.push(`${settings?.restaurantName || 'Restaurant'}\n`);
    cmds.push(`${GS}!\x00${ESC}E\x00`);
    cmds.push(`${ESC}a\x01RAPPORT JOURNALIER\n${ESC}a\x00`);
    const dateStr = dayStart.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    cmds.push(`${dateStr}\n`);
    cmds.push(`Imprime le: ${new Date().toLocaleString('fr-FR')}\n`);
    cmds.push(sep);

    for (const row of detail) {
      const s = row.session;
      const agentName = `${s.agent.firstName} ${s.agent.lastName}`;
      // Session header
      cmds.push(`${ESC}E\x01${agentName} - Serv.${s.service}${ESC}E\x00\n`);
      cmds.push(`Statut: ${s.status === 'open' ? 'En cours' : 'Cloture'}\n`);
      if (s.openedAt) cmds.push(`Ouverture: ${new Date(s.openedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}\n`);
      if (s.closedAt) cmds.push(`Cloture: ${new Date(s.closedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}\n`);
      cmds.push(sep);

      // Each invoice with full detail
      for (const inv of row.invoices) {
        const time = new Date(inv.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const payMethod = PAYMENT_FR[inv.payment?.method] || inv.payment?.method || '?';
        cmds.push(`${ESC}E\x01`);
        cmds.push(`#${inv.ticketNumber}  ${time}${inv.tableNumber ? '  T.' + inv.tableNumber : ''}\n`);
        cmds.push(`${ESC}E\x00`);

        // Items grouped by category
        const items = inv.items || [];
        const groups = {};
        const ungrouped = [];
        for (const it of items) {
          if (it.category) {
            if (!groups[it.category]) groups[it.category] = [];
            groups[it.category].push(it);
          } else {
            ungrouped.push(it);
          }
        }
        const printItem = (it) => {
          const label = `  ${it.quantity}x ${truncate(it.name, cols - 14)}`;
          const price = fmt(it.totalPrice || it.unitPrice * it.quantity);
          const sp = cols - label.length - price.length;
          cmds.push(label + (sp > 0 ? ' '.repeat(sp) : ' ') + price + '\n');
        };
        for (const it of ungrouped) printItem(it);
        for (const [cat, catItems] of Object.entries(groups)) {
          const label = `  [${cat.toUpperCase()}]`;
          cmds.push(`${ESC}E\x01${truncate(label, cols)}${ESC}E\x00\n`);
          for (const it of catItems) printItem(it);
        }

        // Invoice total + payment
        cmds.push(padLine(`  Paiement: ${payMethod}`, fmt(inv.total)));
      }

      if (row.invoices.length === 0) cmds.push(`  Aucune facture payee\n`);
      cmds.push(sep);

      // Session totals
      cmds.push(padLine('  Especes', fmt(s.totalCash)));
      cmds.push(padLine('  Carte', fmt(s.totalCard)));
      cmds.push(padLine('  Mobile', fmt(s.totalMobileMoney)));
      cmds.push(`${ESC}E\x01`);
      cmds.push(padLine(`  SOUS-TOTAL (${row.invoices.length} fac.)`, fmt(row.totalAmount)));
      cmds.push(`${ESC}E\x00`);
      cmds.push(sep);
    }

    cmds.push(dsep);
    cmds.push(`${ESC}E\x01`);
    cmds.push(padLine('TOTAL JOURNEE', fmt(grandTotal)));
    cmds.push(`${ESC}E\x00`);
    cmds.push(padLine('  Especes', fmt(grandCash)));
    cmds.push(padLine('  Carte', fmt(grandCard)));
    cmds.push(padLine('  Mobile', fmt(grandMobile)));
    cmds.push(padLine('Factures', `${totalInvoices}`));
    cmds.push(padLine('Sessions', `${detail.length}`));
    cmds.push(dsep);
    cmds.push(`\n${ESC}a\x01${settings?.receiptFooter || 'Merci de votre visite!'}\n\n\n\n`);
    cmds.push(`${GS}V\x00`);

    const receiptBuffer = Buffer.from(cmds.join(''), 'binary');

    // --- Send to printer ---
    if (config.type === 'network' && config.address) {
      const cleanAddr = sanitizeIP(config.address);
      if (isCloudHosted() && isPrivateIP(cleanAddr)) {
        // Même schéma que ticket:auto-print : émettre un événement léger avec les paramètres,
        // l'agent local reconstruit et imprime lui-même (pas de buffer à sérialiser)
        const io = req.app.get('io');
        const agentSockets = await io.in('print-agents').fetchSockets();
        const reportEvent = { date: date || new Date().toISOString().split('T')[0], service: service || 'all' };
        if (agentSockets.length > 0) {
          agentSockets[0].emit('report:print', reportEvent);
          io.emit('report:cleared');
          console.log(`📤 report:print envoyé à l'agent: ${agentSockets[0].id}`);
          return res.json({ success: true, message: 'Rapport envoyé à l\'agent d\'impression', data: { printed: false, queued: true } });
        }
        // Broadcast si aucun agent enregistré
        io.emit('report:print', reportEvent);
        console.log('📤 report:print diffusé (aucun agent enregistré)');
        return res.json({ success: true, message: 'Aucun agent d\'impression connecté. Activez l\'agent dans Paramètres.', data: { printed: false, queued: true, noAgent: true } });
      }
      try {
        const socket = await connectNetworkPrinter(cleanAddr, config.port || 9100);
        await new Promise((resolve, reject) => {
          socket.on('error', reject);
          socket.write(receiptBuffer, (err) => { if (err) return reject(err); socket.end(resolve); });
        });
        req.app.get('io').emit('report:cleared');
        return res.json({ success: true, message: 'Rapport journalier imprimé', data: { printed: true } });
      } catch (err) {
        return res.status(500).json({ success: false, message: `Erreur impression réseau: ${err.message}`, data: { printed: false } });
      }
    }

    if (config.type === 'usb') {
      try {
        const escpos = require('escpos');
        const escposUsb = require('escpos-usb');
        const device = new escposUsb();
        await new Promise((resolve, reject) => {
          device.open((err) => { if (err) return reject(err); device.write(receiptBuffer); device.close(resolve); });
        });
        return res.json({ success: true, message: 'Rapport imprimé via USB', data: { printed: true } });
      } catch (err) {
        return res.status(500).json({ success: false, message: `Erreur USB: ${err.message}`, data: { printed: false } });
      }
    }

    // Fallback: no physical printer configured
    res.json({ success: true, message: 'Aucune imprimante configurée', data: { printed: false, fallback: true } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/printer/print-raw — Send pre-built ESC/POS buffer directly to network printer
// Used by browser print agents to forward cloud print-jobs to local WiFi printers
router.post('/print-raw', auth, async (req, res) => {
  try {
    const { receiptBuffer, printerConfig } = req.body;
    if (!receiptBuffer) return res.status(400).json({ success: false, message: 'receiptBuffer requis' });

    let config = printerConfig || {};
    if (!config.type || !config.address) {
      const settings = await Settings.findOne();
      config = settings?.printerConfig || {};
    }

    if (config.type === 'network' && config.address) {
      const cleanAddr = sanitizeIP(config.address);
      const buffer = Buffer.from(receiptBuffer, 'base64');
      const socket = await connectNetworkPrinter(cleanAddr, config.port || 9100);
      await new Promise((resolve, reject) => {
        socket.on('error', reject);
        socket.write(buffer, (err) => { if (err) return reject(err); socket.end(resolve); });
      });
      return res.json({ success: true, message: 'Imprimé avec succès', data: { printed: true } });
    }

    res.status(400).json({ success: false, message: 'Aucune imprimante réseau configurée', data: { printed: false } });
  } catch (error) {
    res.status(500).json({ success: false, message: `Erreur impression: ${error.message}`, data: { printed: false } });
  }
});

// GET /api/printer/status
router.get('/status', auth, async (req, res) => {
  try {
    const settings = await Settings.findOne();
    const config = settings?.printerConfig || { type: 'none' };

    if (config.type === 'network' && config.address) {
      const cleanAddr = sanitizeIP(config.address);
      if (isCloudHosted() && isPrivateIP(cleanAddr)) {
        return res.json({ success: true, data: { connected: false, type: 'network', message: `IP locale (${cleanAddr}) inaccessible depuis le cloud. Utilisez le Bluetooth.`, cloudError: true } });
      }
      try {
        const socket = await connectNetworkPrinter(cleanAddr, config.port || 9100, 3000);
        socket.destroy();
        return res.json({
          success: true,
          data: { connected: true, type: 'network', message: `Connectée à ${cleanAddr}:${config.port || 9100}` }
        });
      } catch {
        return res.json({
          success: true,
          data: { connected: false, type: 'network', message: `Impossible de joindre ${cleanAddr}:${config.port || 9100}` }
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
module.exports.buildEscPosReceipt = buildEscPosReceipt;
module.exports.sanitizeIP = sanitizeIP;
module.exports.isPrivateIP = isPrivateIP;
module.exports.isCloudHosted = isCloudHosted;
module.exports.connectNetworkPrinter = connectNetworkPrinter;
