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

// GET /api/stats/agent-history/:id - Agent's full transaction history
router.get('/agent-history/:id', auth, async (req, res) => {
  try {
    const agentId = req.params.id;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;

    // Default to last 30 days if no dates
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const filter = {
      agent: agentId,
      status: 'completed',
      createdAt: { $gte: start, $lte: end }
    };

    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .populate('ticket', 'ticketNumber type total table')
      .populate({ path: 'ticket', populate: { path: 'table', select: 'number name' } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Summary by day
    const allPayments = await Payment.find(filter);
    const totalRevenue = allPayments.reduce((s, p) => s + p.amount, 0);
    const byMethod = {
      cash: allPayments.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
      card: allPayments.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0),
      mobile_money: allPayments.filter(p => p.method === 'mobile_money').reduce((s, p) => s + p.amount, 0),
      gift_card: allPayments.filter(p => p.method === 'gift_card').reduce((s, p) => s + p.amount, 0),
    };

    res.json({
      success: true,
      data: payments,
      summary: { totalRevenue, totalTransactions: total, byMethod },
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/revenue-chart - Revenue data for charts (daily/weekly/monthly/semester/yearly)
router.get('/revenue-chart', auth, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const { start, end } = getDateRange(period);

    const payments = await Payment.find({
      createdAt: { $gte: start, $lt: end },
      status: 'completed'
    }).sort({ createdAt: 1 });

    // Group by day
    const byDay = {};
    for (const p of payments) {
      const key = p.createdAt.toISOString().split('T')[0];
      if (!byDay[key]) byDay[key] = { date: key, revenue: 0, count: 0 };
      byDay[key].revenue += p.amount;
      byDay[key].count++;
    }

    res.json({
      success: true,
      data: Object.values(byDay),
      totalRevenue: payments.reduce((s, p) => s + p.amount, 0),
      totalTransactions: payments.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/product-analytics - Detailed product analytics with daily breakdown
router.get('/product-analytics', auth, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const { start, end } = getDateRange(period);

    const orders = await Order.find({
      createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' }
    });

    const productStats = {};
    const dailyBreakdown = {};

    for (const order of orders) {
      const dayKey = order.createdAt.toISOString().split('T')[0];
      for (const item of order.items) {
        const pid = item.product?.toString() || item.name;
        if (!productStats[pid]) {
          productStats[pid] = { productId: pid, name: item.name, totalQuantity: 0, totalRevenue: 0, totalOrders: 0, daily: {} };
        }
        productStats[pid].totalQuantity += item.quantity;
        productStats[pid].totalRevenue += item.totalPrice;
        productStats[pid].totalOrders++;

        if (!productStats[pid].daily[dayKey]) productStats[pid].daily[dayKey] = { quantity: 0, revenue: 0 };
        productStats[pid].daily[dayKey].quantity += item.quantity;
        productStats[pid].daily[dayKey].revenue += item.totalPrice;

        if (!dailyBreakdown[dayKey]) dailyBreakdown[dayKey] = { date: dayKey, totalQuantity: 0, totalRevenue: 0 };
        dailyBreakdown[dayKey].totalQuantity += item.quantity;
        dailyBreakdown[dayKey].totalRevenue += item.totalPrice;
      }
    }

    const sorted = Object.values(productStats)
      .map(p => ({ ...p, daily: Object.values(p.daily) }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({
      success: true,
      data: sorted,
      dailyBreakdown: Object.values(dailyBreakdown).sort((a, b) => a.date.localeCompare(b.date)),
      totalProducts: sorted.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/agent-performance - Agent performance with percentages
router.get('/agent-performance', auth, adminOnly, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);

    const agents = await User.find({ role: 'agent', isActive: true }).select('-password');

    // Totals across all agents for the period
    const allOrders = await Order.countDocuments({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } });
    const allPayments = await Payment.find({ createdAt: { $gte: start, $lt: end }, status: 'completed' });
    const totalRevenueAll = allPayments.reduce((s, p) => s + p.amount, 0);

    const agentPerf = [];
    for (const agent of agents) {
      const agOrders = await Order.countDocuments({ agent: agent._id, createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } });
      const agPayments = await Payment.find({ agent: agent._id, createdAt: { $gte: start, $lt: end }, status: 'completed' });
      const agRevenue = agPayments.reduce((s, p) => s + p.amount, 0);
      const agTickets = await Ticket.countDocuments({ agent: agent._id, createdAt: { $gte: start, $lt: end } });

      agentPerf.push({
        agent: { _id: agent._id, firstName: agent.firstName, lastName: agent.lastName, email: agent.email },
        orders: agOrders,
        revenue: agRevenue,
        tickets: agTickets,
        transactions: agPayments.length,
        orderPercent: allOrders > 0 ? Math.round((agOrders / allOrders) * 100) : 0,
        revenuePercent: totalRevenueAll > 0 ? Math.round((agRevenue / totalRevenueAll) * 100) : 0,
        lastLogin: agent.lastLogin
      });
    }

    agentPerf.sort((a, b) => b.revenue - a.revenue);
    res.json({ success: true, data: agentPerf, totals: { orders: allOrders, revenue: totalRevenueAll } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
