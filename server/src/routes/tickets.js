const express = require('express');
const Ticket = require('../models/Ticket');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const CashRegister = require('../models/CashRegister');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { generateTicketNumber } = require('../utils/helpers');

const router = express.Router();

// GET /api/tickets
router.get('/', auth, async (req, res) => {
  try {
    const { type, table, agent, isPaid, memoStatus, startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (table) filter.table = table;
    if (agent) filter.agent = agent;
    if (isPaid !== undefined) filter.isPaid = isPaid === 'true';
    if (memoStatus) filter.memoStatus = memoStatus;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const total = await Ticket.countDocuments(filter);
    const tickets = await Ticket.find(filter)
      .populate('table', 'number name zone')
      .populate('agent', 'firstName lastName')
      .populate('client', 'firstName lastName')
      .populate('orders')
      .populate('payment')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: tickets,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/tickets/counts — Compteurs En cours / À Encaisser pour sidebar
router.get('/counts', auth, async (req, res) => {
  try {
    const agentId = req.user._id;
    const [enCours, aEncaisser] = await Promise.all([
      Ticket.countDocuments({ agent: agentId, type: 'invoice', isPaid: false, memoStatus: 'en_cours' }),
      Ticket.countDocuments({ agent: agentId, type: 'invoice', isPaid: false, memoStatus: 'a_encaisser' })
    ]);
    res.json({ success: true, data: { enCours, aEncaisser } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/tickets/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('table').populate('agent', 'firstName lastName')
      .populate('client').populate('orders').populate('payment');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket non trouvé' });
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/tickets/invoice/:tableId - Generate global invoice for a table (dine_in)
// Merges all active orders on the table into one single invoice ticket for payment
router.post('/invoice/:tableId', auth, async (req, res) => {
  try {
    const table = await Table.findById(req.params.tableId).populate('currentOrders');
    if (!table) return res.status(404).json({ success: false, message: 'Table non trouvée' });

    const activeOrders = await Order.find({
      _id: { $in: table.currentOrders },
      status: { $nin: ['cancelled', 'paid'] }
    });

    if (activeOrders.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune commande active sur cette table' });
    }

    // Merge all order items into one consolidated invoice
    const allItems = [];
    let subtotal = 0;
    let taxAmount = 0;
    let discount = 0;

    for (const order of activeOrders) {
      for (const item of order.items) {
        allItems.push({
          name: item.name,
          category: item.category || '',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          options: item.options.map(o => ({ name: o.optionName || o.name, price: o.price }))
        });
      }
      subtotal += order.subtotal;
      taxAmount += order.taxAmount;
      discount += order.discount;
    }

    const total = subtotal + taxAmount - discount;

    const invoice = new Ticket({
      ticketNumber: generateTicketNumber('invoice'),
      type: 'invoice',
      orderType: 'dine_in',
      table: table._id,
      orders: activeOrders.map(o => o._id),
      agent: req.user._id,
      client: activeOrders[0].client || null,
      items: allItems,
      subtotal,
      taxAmount,
      discount,
      total
    });

    await invoice.save();
    await invoice.populate('table', 'number name zone');
    await invoice.populate('agent', 'firstName lastName');

    const io = req.app.get('io');
    io.emit('ticket:invoice-created', invoice);
    io.emit('ticket:auto-print', { ticket: invoice, orderType: 'dine_in' });

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/tickets/invoice-orders - Generate invoice from specific order IDs (delivery/takeaway)
router.post('/invoice-orders', auth, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!orderIds || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune commande sélectionnée' });
    }

    const orders = await Order.find({
      _id: { $in: orderIds },
      status: { $nin: ['cancelled', 'paid'] }
    });

    if (orders.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune commande active trouvée' });
    }

    const allItems = [];
    let subtotal = 0;
    let taxAmount = 0;
    let discount = 0;

    for (const order of orders) {
      for (const item of order.items) {
        allItems.push({
          name: item.name,
          category: item.category || '',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          options: item.options.map(o => ({ name: o.optionName || o.name, price: o.price }))
        });
      }
      subtotal += order.subtotal;
      taxAmount += order.taxAmount;
      discount += order.discount;
    }

    const total = subtotal + taxAmount - discount;
    const firstOrder = orders[0];

    const invoice = new Ticket({
      ticketNumber: generateTicketNumber('invoice'),
      type: 'invoice',
      orderType: firstOrder.orderType,
      table: firstOrder.table || null,
      orders: orders.map(o => o._id),
      agent: req.user._id,
      client: firstOrder.client || null,
      deliveryInfo: firstOrder.orderType === 'delivery' ? firstOrder.deliveryInfo : undefined,
      items: allItems,
      subtotal,
      taxAmount,
      discount,
      total
    });

    await invoice.save();
    if (invoice.table) await invoice.populate('table', 'number name zone');
    await invoice.populate('agent', 'firstName lastName');

    const io = req.app.get('io');
    io.emit('ticket:invoice-created', invoice);
    io.emit('ticket:auto-print', { ticket: invoice, orderType: firstOrder.orderType });

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/tickets/:id/printed
router.patch('/:id/printed', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { isPrinted: true, printedAt: new Date() },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket non trouvé' });
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/tickets/:id/mark-paid — Admin force-mark ticket as paid
router.patch('/:id/mark-paid', auth, adminOnly, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket non trouvé' });
    if (ticket.isPaid) return res.status(400).json({ success: false, message: 'Ce ticket est déjà payé' });

    ticket.isPaid = true;
    await ticket.save();

    // Also mark related order tickets as paid if this is an invoice
    if (ticket.type === 'invoice' && ticket.orders.length > 0) {
      await Ticket.updateMany(
        { orders: { $in: ticket.orders }, type: 'order', isPaid: false },
        { isPaid: true }
      );
    }

    // Mark orders as paid
    if (ticket.orders.length > 0) {
      await Order.updateMany({ _id: { $in: ticket.orders } }, { status: 'paid' });
    }

    const io = req.app.get('io');
    io.emit('ticket:paid', { ticketId: ticket._id });

    res.json({ success: true, data: ticket, message: 'Ticket marqué comme payé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/tickets/direct-invoice — Créer une facture directement (sans commande préalable)
router.post('/direct-invoice', auth, async (req, res) => {
  try {
    const openSession = await CashRegister.findOne({ agent: req.user._id, status: 'open' });
    if (!openSession) {
      return res.status(403).json({ success: false, message: 'Votre caisse n\'est pas ouverte. Contactez le caissier pour ouvrir votre service.' });
    }
    const { tableNumber, items, notes } = req.body;
    if (!tableNumber || !String(tableNumber).trim()) {
      return res.status(400).json({ success: false, message: 'Numéro de table requis' });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Au moins un article requis' });
    }

    let subtotal = 0;
    const processedItems = items.map(item => {
      const tp = item.unitPrice * item.quantity;
      subtotal += tp;
      return { name: item.name, category: item.category || '', quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: tp, options: [] };
    });

    const invoice = new Ticket({
      ticketNumber: generateTicketNumber('invoice'),
      type: 'invoice',
      orderType: 'dine_in',
      tableNumber: String(tableNumber).trim(),
      items: processedItems,
      subtotal,
      taxAmount: 0,
      discount: 0,
      total: subtotal,
      agent: req.user._id,
      memoStatus: 'en_cours',
      notes: notes || ''
    });

    await invoice.save();
    await invoice.populate('agent', 'firstName lastName');

    const io = req.app.get('io');
    io.emit('invoice:created', invoice);

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/tickets/:id/a-encaisser — Mémoriser la facture dans "À Encaisser"
router.patch('/:id/a-encaisser', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndUpdate(
      { _id: req.params.id, agent: req.user._id, isPaid: false },
      { memoStatus: 'a_encaisser' },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Facture non trouvée' });
    const io = req.app.get('io');
    io.emit('invoice:memo', { ticketId: req.params.id });
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/tickets/:id/add-items — Ajouter des articles à une facture (En cours ou À encaisser)
router.patch('/:id/add-items', auth, async (req, res) => {
  try {
    const openSession = await CashRegister.findOne({ agent: req.user._id, status: 'open' });
    if (!openSession) {
      return res.status(403).json({ success: false, message: 'Votre caisse n\'est pas ouverte. Contactez le caissier pour ouvrir votre service.' });
    }
    const { items } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Articles requis' });
    }
    const ticket = await Ticket.findOne({ _id: req.params.id, agent: req.user._id, isPaid: false });
    if (!ticket) return res.status(404).json({ success: false, message: 'Facture non trouvée' });

    const prevStatus = ticket.memoStatus;

    for (const item of items) {
      const existing = ticket.items.find(i => i.name === item.name && i.unitPrice === item.unitPrice);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice = existing.quantity * existing.unitPrice;
        if (!existing.category && item.category) existing.category = item.category;
      } else {
        ticket.items.push({ name: item.name, category: item.category || '', quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity, options: [] });
      }
    }

    ticket.subtotal = ticket.items.reduce((s, i) => s + i.totalPrice, 0);
    ticket.total = ticket.subtotal + ticket.taxAmount - ticket.discount;
    // Preserve a_encaisser status; otherwise reset to en_cours
    if (prevStatus !== 'a_encaisser') {
      ticket.memoStatus = 'en_cours';
    }

    await ticket.save();
    const io = req.app.get('io');
    io.emit('invoice:updated', ticket);

    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/tickets/:id/admin-delete — Agent triggers deletion, server verifies admin password only
router.post('/:id/admin-delete', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, message: 'Mot de passe administrateur requis' });
    }

    // Check password against all active admins
    const admins = await User.find({ role: 'admin', isActive: true });
    let admin = null;
    for (const a of admins) {
      const isMatch = await a.comparePassword(password);
      if (isMatch) { admin = a; break; }
    }
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Mot de passe administrateur invalide' });
    }

    const ticket = await Ticket.findById(req.params.id)
      .populate('table', 'number name')
      .populate('agent', 'firstName lastName');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket non trouvé' });

    // Capture ticket data for printing before deletion
    const ticketPrintData = {
      ticketNumber: ticket.ticketNumber,
      type: ticket.type,
      orderType: ticket.orderType || 'dine_in',
      tableName: ticket.table ? `Table ${ticket.table.number}` : null,
      tableNumber: ticket.table?.number || null,
      agentName: ticket.agent ? `${ticket.agent.firstName} ${ticket.agent.lastName}` : '',
      items: (ticket.items || []).map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice, category: i.category || '', options: i.options || [] })),
      subtotal: ticket.subtotal,
      taxAmount: ticket.taxAmount || 0,
      discount: ticket.discount || 0,
      total: ticket.total,
      isPaid: ticket.isPaid,
      deleted: true,
      adminName: `${admin.firstName} ${admin.lastName}`,
      deletedAt: new Date().toISOString(),
    };

    if (ticket.payment) await Payment.findByIdAndDelete(ticket.payment);

    const ticketNumber = ticket.ticketNumber;
    const ticketType = ticket.type;
    const tableNumber = ticket.table?.number || null;

    await Ticket.findByIdAndDelete(req.params.id);

    if (!ticket.isPaid && ticket.table) {
      const tableId = ticket.table._id || ticket.table;
      if (ticket.orders && ticket.orders.length > 0) {
        await Table.findByIdAndUpdate(tableId, { $pull: { currentOrders: { $in: ticket.orders } } });
      }
      const updatedTable = await Table.findById(tableId).populate('currentOrders');
      const hasActive = updatedTable?.currentOrders?.some(o => !['cancelled', 'paid'].includes(o.status));
      if (!hasActive) {
        await Table.findByIdAndUpdate(tableId, { status: 'available', currentOrders: [] });
        req.app.get('io').emit('table:updated', { tableId: tableId.toString(), status: 'available' });
      }
    }

    const notif = await Notification.create({
      type: ticketType === 'invoice' ? 'invoice_deleted' : 'ticket_deleted',
      title: ticketType === 'invoice' ? 'Facture supprimée' : 'Ticket supprimé',
      message: `Supprimé par l'admin ${admin.firstName} ${admin.lastName} : ${ticketType === 'invoice' ? 'facture' : 'ticket'} ${ticketNumber}${tableNumber ? ' (Table ' + tableNumber + ')' : ''}`,
      agent: req.user._id,
      data: { ticketNumber, ticketType, tableNumber }
    });
    const io = req.app.get('io');
    io.emit('notification:new', notif);
    io.emit('ticket:deleted', { ticketId: req.params.id, ticketNumber });

    res.json({
      success: true,
      message: `${ticketType === 'invoice' ? 'Facture' : 'Ticket'} ${ticketNumber} supprimé(e)`,
      ticketData: ticketPrintData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/tickets/:id — Admin only can delete a ticket or invoice
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).populate('table', 'number name');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket non trouvé' });

    // If paid, also remove the payment
    if (ticket.payment) {
      await Payment.findByIdAndDelete(ticket.payment);
    }

    const ticketNumber = ticket.ticketNumber;
    const ticketType = ticket.type;
    const tableNumber = ticket.table?.number || null;

    await Ticket.findByIdAndDelete(req.params.id);

    // Si ticket/facture non payé avec une table → libérer la table si plus de commandes actives
    if (!ticket.isPaid && ticket.table) {
      const tableId = ticket.table._id || ticket.table;
      if (ticket.orders && ticket.orders.length > 0) {
        await Table.findByIdAndUpdate(tableId, {
          $pull: { currentOrders: { $in: ticket.orders } }
        });
      }
      const updatedTable = await Table.findById(tableId).populate('currentOrders');
      const hasActive = updatedTable?.currentOrders?.some(o => !['cancelled', 'paid'].includes(o.status));
      if (!hasActive) {
        await Table.findByIdAndUpdate(tableId, { status: 'available', currentOrders: [] });
        const io = req.app.get('io');
        io.emit('table:updated', { tableId: tableId.toString(), status: 'available' });
      }
    }

    // Notify
    const notif = await Notification.create({
      type: ticketType === 'invoice' ? 'invoice_deleted' : 'ticket_deleted',
      title: ticketType === 'invoice' ? 'Facture supprimée' : 'Ticket supprimé',
      message: `L'administrateur a supprimé ${ticketType === 'invoice' ? 'la facture' : 'le ticket'} ${ticketNumber}${tableNumber ? ' (Table ' + tableNumber + ')' : ''}`,
      agent: req.user._id,
      data: { ticketNumber, ticketType, tableNumber }
    });

    const io = req.app.get('io');
    io.emit('notification:new', notif);
    io.emit('ticket:deleted', { ticketId: req.params.id, ticketNumber });

    res.json({ success: true, message: `${ticketType === 'invoice' ? 'Facture' : 'Ticket'} ${ticketNumber} supprimé(e)` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
