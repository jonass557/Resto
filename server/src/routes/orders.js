const express = require('express');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Ticket = require('../models/Ticket');
const Product = require('../models/Product');
const CashRegister = require('../models/CashRegister');
const { auth } = require('../middleware/auth');
const { generateOrderNumber, generateTicketNumber } = require('../utils/helpers');

const router = express.Router();

// GET /api/orders
router.get('/', auth, async (req, res) => {
  try {
    const { table, agent, status, startDate, endDate, activeSession, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (table) filter.table = table;
    if (agent) filter.agent = agent;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (activeSession === 'true') {
      const openSessions = await CashRegister.find({ status: 'open' });
      if (openSessions.length === 0) {
        return res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: parseInt(limit), pages: 0 } });
      }
      filter.$or = openSessions.map(s => ({ agent: s.agent, createdAt: { $gte: s.openedAt } }));
    }

    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('table', 'number name zone')
      .populate('agent', 'firstName lastName')
      .populate('client', 'firstName lastName')
      .populate('items.product', 'name image')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: orders,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/orders/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('table').populate('agent', 'firstName lastName')
      .populate('client').populate('items.product')
      .lean();
    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/orders - Create new order
// Supports: dine_in (table required), takeaway, delivery (deliveryInfo required)
router.post('/', auth, async (req, res) => {
  try {
    const openSession = await CashRegister.findOne({ agent: req.user._id, status: 'open' });
    if (!openSession) {
      return res.status(403).json({ success: false, message: 'Votre caisse n\'est pas ouverte. Contactez le caissier pour ouvrir votre service.' });
    }
    const { tableId, items, notes, clientId, discount, discountType, orderType = 'dine_in', deliveryInfo } = req.body;

    let table = null;

    // Validate table for dine-in orders
    if (orderType === 'dine_in') {
      if (!tableId) return res.status(400).json({ success: false, message: 'Table requise pour une commande sur place' });
      table = await Table.findById(tableId);
      if (!table) return res.status(404).json({ success: false, message: 'Table non trouvée' });
    }

    // Validate delivery info
    if (orderType === 'delivery') {
      if (!deliveryInfo || !deliveryInfo.clientName || !deliveryInfo.phone) {
        return res.status(400).json({ success: false, message: 'Nom et téléphone requis pour une livraison' });
      }
    }

    // Build order items
    const orderItems = [];
    let subtotal = 0;
    let taxAmount = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId).populate('category', 'name');
      if (!product) continue;
      if (!product.isAvailable) continue;

      // Check stock
      if (product.stock !== -1 && product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Stock insuffisant pour ${product.name}`
        });
      }

      let itemTotal = product.price * item.quantity;
      const optionsData = [];

      if (item.options && item.options.length > 0) {
        for (const opt of item.options) {
          itemTotal += (opt.price || 0) * item.quantity;
          optionsData.push({ groupName: opt.groupName, optionName: opt.optionName, price: opt.price || 0 });
        }
      }

      const itemTax = itemTotal * (product.taxRate / 100);
      taxAmount += itemTax;

      orderItems.push({
        product: product._id,
        name: product.name,
        category: product.category?.name || '',
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice: itemTotal,
        options: optionsData,
        notes: item.notes || ''
      });

      subtotal += itemTotal;

      // Update stock
      if (product.stock !== -1) {
        product.stock -= item.quantity;
        await product.save();
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (discount) {
      if (discountType === 'percent') {
        discountAmount = subtotal * (discount / 100);
      } else {
        discountAmount = discount;
      }
    }

    const total = subtotal + taxAmount - discountAmount;
    const orderNumber = generateOrderNumber();
    const ticketNum = generateTicketNumber('order');

    const order = new Order({
      orderNumber,
      orderType,
      table: table ? table._id : null,
      agent: req.user._id,
      client: clientId || null,
      deliveryInfo: orderType === 'delivery' ? deliveryInfo : undefined,
      items: orderItems,
      subtotal,
      taxAmount,
      discount: discountAmount,
      discountType: discountType || 'fixed',
      total,
      notes: notes || '',
      ticketNumber: ticketNum
    });

    await order.save();

    // Update table status for dine-in
    if (table) {
      table.status = 'occupied';
      table.currentOrders.push(order._id);
      await table.save();
    }

    // Create order ticket (auto-printed per order)
    const ticket = new Ticket({
      ticketNumber: ticketNum,
      type: 'order',
      orderType,
      table: table ? table._id : null,
      orders: [order._id],
      agent: req.user._id,
      client: clientId || null,
      deliveryInfo: orderType === 'delivery' ? {
        clientName: deliveryInfo.clientName,
        phone: deliveryInfo.phone,
        address: deliveryInfo.address || ''
      } : undefined,
      items: orderItems.map(i => ({
        name: i.name,
        category: i.category || '',
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
        options: i.options.map(o => ({ name: o.optionName, price: o.price }))
      })),
      subtotal,
      taxAmount,
      discount: discountAmount,
      total
    });
    await ticket.save();

    await order.populate('table', 'number name zone');
    await order.populate('agent', 'firstName lastName');

    // Real-time notifications
    const io = req.app.get('io');
    io.emit('order:created', order);
    if (table) io.emit('table:updated', table);
    io.emit('ticket:created', ticket);

    // Auto-print : cibler le premier agent enregistré, ou broadcast si aucun
    const agentSockets = await io.in('print-agents').fetchSockets();
    if (agentSockets.length > 0) {
      agentSockets[0].emit('ticket:auto-print', { ticket });
      console.log(`🖨️  Auto-print → agent ${agentSockets[0].id} pour ticket ${ticket.ticketNumber}`);
    } else {
      // Fallback : broadcast à tous les clients — PrintAgentContext imprime si actif et serveur local dispo
      io.emit('ticket:auto-print', { ticket });
      console.log(`📡 Auto-print broadcast (aucun agent enregistré) pour ticket ${ticket.ticketNumber}`);
    }

    res.status(201).json({ success: true, data: { order, ticket } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('table', 'number name').populate('agent', 'firstName lastName');

    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });

    const io = req.app.get('io');
    io.emit('order:status-changed', { id: order._id, status, order });

    // If cancelled, restore stock
    if (status === 'cancelled') {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product && product.stock !== -1) {
          product.stock += item.quantity;
          await product.save();
        }
      }
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/orders/:id/items/:itemId/status
router.patch('/:id/items/:itemId/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });

    const item = order.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Article non trouvé' });

    item.status = status;
    await order.save();

    const io = req.app.get('io');
    io.emit('order:item-status-changed', { orderId: order._id, itemId: item._id, status });

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });

    // Remove from table
    await Table.findByIdAndUpdate(order.table, {
      $pull: { currentOrders: order._id }
    });

    // Restore stock
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product && product.stock !== -1) {
        product.stock += item.quantity;
        await product.save();
      }
    }

    await Order.findByIdAndDelete(req.params.id);

    const io = req.app.get('io');
    io.emit('order:deleted', req.params.id);

    res.json({ success: true, message: 'Commande supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
