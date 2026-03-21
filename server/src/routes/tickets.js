const express = require('express');
const Ticket = require('../models/Ticket');
const Order = require('../models/Order');
const Table = require('../models/Table');
const { auth } = require('../middleware/auth');
const { generateTicketNumber } = require('../utils/helpers');

const router = express.Router();

// GET /api/tickets
router.get('/', auth, async (req, res) => {
  try {
    const { type, table, agent, isPaid, startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (table) filter.table = table;
    if (agent) filter.agent = agent;
    if (isPaid !== undefined) filter.isPaid = isPaid === 'true';
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
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: tickets,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
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

module.exports = router;
