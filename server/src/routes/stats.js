const express = require('express');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Product = require('../models/Product');
const Client = require('../models/Client');
const { auth, adminOnly } = require('../middleware/auth');
const { getDateRange } = require('../utils/helpers');

const router = express.Router();

// GET /api/stats/dashboard - Global dashboard stats
router.get('/dashboard', auth, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);

    const [orders, payments, tickets] = await Promise.all([
      Order.find({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } }),
      Payment.find({ createdAt: { $gte: start, $lt: end }, status: 'completed' }),
      Ticket.find({ createdAt: { $gte: start, $lt: end } })
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalOrders = orders.length;
    const totalTickets = tickets.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Revenue by payment method
    const revenueByMethod = {
      cash: payments.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
      card: payments.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0),
      mobile_money: payments.filter(p => p.method === 'mobile_money').reduce((s, p) => s + p.amount, 0),
      gift_card: payments.filter(p => p.method === 'gift_card').reduce((s, p) => s + p.amount, 0)
    };

    // Top products
    const productCounts = {};
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.name;
        if (!productCounts[key]) productCounts[key] = { name: key, quantity: 0, revenue: 0 };
        productCounts[key].quantity += item.quantity;
        productCounts[key].revenue += item.totalPrice;
      }
    }
    const topProducts = Object.values(productCounts).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    // Hourly distribution
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({ hour: i, orders: 0, revenue: 0 }));
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      hourlyData[hour].orders++;
      hourlyData[hour].revenue += order.total;
    }

    res.json({
      success: true,
      data: {
        totalRevenue, totalOrders, totalTickets, avgOrderValue,
        revenueByMethod, topProducts, hourlyData
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/agents - Agent performance stats (admin)
router.get('/agents', auth, adminOnly, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);

    const agents = await User.find({ role: 'agent', isActive: true }).select('-password');
    const agentStats = [];

    for (const agent of agents) {
      const orders = await Order.countDocuments({
        agent: agent._id, createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' }
      });

      const payments = await Payment.find({
        agent: agent._id, createdAt: { $gte: start, $lt: end }, status: 'completed'
      });

      const revenue = payments.reduce((sum, p) => sum + p.amount, 0);

      agentStats.push({
        agent: { _id: agent._id, firstName: agent.firstName, lastName: agent.lastName, email: agent.email },
        orders,
        revenue,
        transactions: payments.length,
        lastLogin: agent.lastLogin
      });
    }

    agentStats.sort((a, b) => b.revenue - a.revenue);
    res.json({ success: true, data: agentStats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/agent/:id - Single agent detailed stats
router.get('/agent/:id', auth, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);
    const agentId = req.params.id;

    const [orders, payments, tickets] = await Promise.all([
      Order.find({ agent: agentId, createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } }),
      Payment.find({ agent: agentId, createdAt: { $gte: start, $lt: end }, status: 'completed' }),
      Ticket.find({ agent: agentId, createdAt: { $gte: start, $lt: end } })
    ]);

    const revenue = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      data: {
        totalOrders: orders.length,
        totalRevenue: revenue,
        totalTickets: tickets.length,
        avgOrderValue: orders.length > 0 ? revenue / orders.length : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/sales - Sales journal
router.get('/sales', auth, async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const payments = await Payment.find({
      createdAt: { $gte: start, $lte: end },
      status: 'completed'
    }).populate('agent', 'firstName lastName').sort({ createdAt: -1 });

    // Group by day
    const salesByDay = {};
    for (const payment of payments) {
      const dateKey = payment.createdAt.toISOString().split('T')[0];
      if (!salesByDay[dateKey]) {
        salesByDay[dateKey] = { date: dateKey, count: 0, revenue: 0, payments: [] };
      }
      salesByDay[dateKey].count++;
      salesByDay[dateKey].revenue += payment.amount;
      salesByDay[dateKey].payments.push(payment);
    }

    res.json({
      success: true,
      data: {
        payments,
        summary: Object.values(salesByDay).sort((a, b) => b.date.localeCompare(a.date)),
        totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
        totalTransactions: payments.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/products - Product performance
router.get('/products', auth, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const { start, end } = getDateRange(period);

    const orders = await Order.find({
      createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' }
    });

    const productStats = {};
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.product.toString();
        if (!productStats[key]) {
          productStats[key] = { productId: key, name: item.name, quantity: 0, revenue: 0, orders: 0 };
        }
        productStats[key].quantity += item.quantity;
        productStats[key].revenue += item.totalPrice;
        productStats[key].orders++;
      }
    }

    const sorted = Object.values(productStats).sort((a, b) => b.revenue - a.revenue);
    res.json({ success: true, data: sorted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
