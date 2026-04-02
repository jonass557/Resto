const express = require('express');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Product = require('../models/Product');
const Client = require('../models/Client');
const { auth, adminOnly } = require('../middleware/auth');
const { getDateRange } = require('../utils/helpers');
const { statsCache } = require('../utils/statsCache');

const router = express.Router();
const SC = statsCache(30000); // 30s server-side cache for all stats GET routes

// GET /api/stats/dashboard - Global dashboard stats
router.get('/dashboard', auth, SC, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);

    // All stats via aggregation — no full document loads
    const [paymentAgg, orderAgg, ticketCount, productAgg, hourlyAgg] = await Promise.all([
      Payment.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        { $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          count: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ['$method', 'cash'] }, '$amount', 0] } },
          card: { $sum: { $cond: [{ $eq: ['$method', 'card'] }, '$amount', 0] } },
          mobile_money: { $sum: { $cond: [{ $eq: ['$method', 'mobile_money'] }, '$amount', 0] } },
          gift_card: { $sum: { $cond: [{ $eq: ['$method', 'gift_card'] }, '$amount', 0] } }
        }}
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$total' } } }
      ]),
      Ticket.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.totalPrice' } } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        { $project: { name: '$_id', quantity: 1, revenue: 1, _id: 0 } }
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $hour: '$createdAt' }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }
      ])
    ]);

    const p = paymentAgg[0] || { totalRevenue: 0, count: 0, cash: 0, card: 0, mobile_money: 0, gift_card: 0 };
    const o = orderAgg[0] || { count: 0, total: 0 };
    const totalRevenue = p.totalRevenue;
    const totalOrders = o.count;
    const revenueByMethod = { cash: p.cash, card: p.card, mobile_money: p.mobile_money, gift_card: p.gift_card };

    const hourlyMap = Object.fromEntries(hourlyAgg.map(h => [h._id, { orders: h.orders, revenue: h.revenue }]));
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: i, orders: hourlyMap[i]?.orders || 0, revenue: hourlyMap[i]?.revenue || 0
    }));

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders,
        totalTickets: ticketCount,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        revenueByMethod,
        topProducts: productAgg,
        hourlyData
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/agents - Agent performance stats (admin)
router.get('/agents', auth, adminOnly, SC, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);

    // Single aggregation per collection instead of N+1 per-agent queries
    const [agents, orderAggs, paymentAggs] = await Promise.all([
      User.find({ role: 'agent', isActive: true }).select('firstName lastName email lastLogin').lean(),
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$agent', orders: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        { $group: {
          _id: '$agent',
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ['$method', 'cash'] }, '$amount', 0] } },
          mobile_money: { $sum: { $cond: [{ $eq: ['$method', 'mobile_money'] }, '$amount', 0] } },
          card: { $sum: { $cond: [{ $eq: ['$method', 'card'] }, '$amount', 0] } }
        }}
      ])
    ]);

    const orderMap = Object.fromEntries(orderAggs.map(a => [a._id.toString(), a.orders]));
    const payMap = Object.fromEntries(paymentAggs.map(a => [a._id.toString(), { revenue: a.revenue, transactions: a.transactions, cash: a.cash, mobile_money: a.mobile_money, card: a.card }]));

    const agentStats = agents.map(agent => {
      const id = agent._id.toString();
      const pay = payMap[id] || { revenue: 0, transactions: 0, cash: 0, mobile_money: 0, card: 0 };
      return {
        agent: { _id: agent._id, firstName: agent.firstName, lastName: agent.lastName, email: agent.email },
        orders: orderMap[id] || 0,
        revenue: pay.revenue,
        transactions: pay.transactions,
        byMethod: { cash: pay.cash, mobile_money: pay.mobile_money, card: pay.card },
        lastLogin: agent.lastLogin
      };
    });

    agentStats.sort((a, b) => b.revenue - a.revenue);
    res.json({ success: true, data: agentStats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/agent/:id - Single agent detailed stats
router.get('/agent/:id', auth, SC, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);
    const agentId = req.params.id;

    const [orderAgg, paymentAgg, ticketCount] = await Promise.all([
      Order.aggregate([
        { $match: { agent: new (require('mongoose').Types.ObjectId)(agentId), createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { agent: new (require('mongoose').Types.ObjectId)(agentId), createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Ticket.countDocuments({ agent: agentId, createdAt: { $gte: start, $lt: end } })
    ]);

    const totalOrders = orderAgg[0]?.count || 0;
    const totalRevenue = paymentAgg[0]?.revenue || 0;

    res.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue,
        totalTickets: ticketCount,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/sales - Sales journal
router.get('/sales', auth, SC, async (req, res) => {
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
router.get('/products', auth, SC, async (req, res) => {
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
router.get('/agent-history/:id', auth, SC, async (req, res) => {
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

    // Parallel: paginated list + summary aggregation (no double-fetch)
    const [total, payments, summaryAgg] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter)
        .populate('ticket', 'ticketNumber type total table')
        .populate({ path: 'ticket', populate: { path: 'table', select: 'number name' } })
        .sort({ createdAt: -1 })
        .skip((page - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      Payment.aggregate([
        { $match: { agent: new (require('mongoose').Types.ObjectId)(agentId), status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          cash: { $sum: { $cond: [{ $eq: ['$method', 'cash'] }, '$amount', 0] } },
          card: { $sum: { $cond: [{ $eq: ['$method', 'card'] }, '$amount', 0] } },
          mobile_money: { $sum: { $cond: [{ $eq: ['$method', 'mobile_money'] }, '$amount', 0] } },
          gift_card: { $sum: { $cond: [{ $eq: ['$method', 'gift_card'] }, '$amount', 0] } }
        }}
      ])
    ]);

    const s = summaryAgg[0] || { totalRevenue: 0, cash: 0, card: 0, mobile_money: 0, gift_card: 0 };
    const byMethod = { cash: s.cash, card: s.card, mobile_money: s.mobile_money, gift_card: s.gift_card };

    res.json({
      success: true,
      data: payments,
      summary: { totalRevenue: s.totalRevenue, totalTransactions: total, byMethod },
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/revenue-chart - Revenue data for charts (daily/weekly/monthly/semester/yearly)
router.get('/revenue-chart', auth, SC, async (req, res) => {
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
router.get('/product-analytics', auth, SC, async (req, res) => {
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
router.get('/agent-performance', auth, adminOnly, SC, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);

    // All aggregations in one parallel round-trip
    const [agents, orderAggs, paymentAggs, ticketAggs, totalAgg] = await Promise.all([
      User.find({ role: 'agent', isActive: true }).select('firstName lastName email lastLogin').lean(),
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$agent', orders: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        { $group: {
          _id: '$agent',
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ['$method', 'cash'] }, '$amount', 0] } },
          mobile_money: { $sum: { $cond: [{ $eq: ['$method', 'mobile_money'] }, '$amount', 0] } },
          card: { $sum: { $cond: [{ $eq: ['$method', 'card'] }, '$amount', 0] } }
        }}
      ]),
      Ticket.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: '$agent', tickets: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        { $group: { _id: null, totalRevenue: { $sum: '$amount' }, totalOrders: { $sum: 1 } } }
      ])
    ]);

    const allOrderCount = orderAggs.reduce((s, a) => s + a.orders, 0);
    const totalRevenueAll = totalAgg[0]?.totalRevenue || 0;

    const orderMap = Object.fromEntries(orderAggs.map(a => [a._id.toString(), a.orders]));
    const payMap = Object.fromEntries(paymentAggs.map(a => [a._id.toString(), { revenue: a.revenue, transactions: a.transactions, cash: a.cash, mobile_money: a.mobile_money, card: a.card }]));
    const ticketMap = Object.fromEntries(ticketAggs.map(a => [a._id.toString(), a.tickets]));

    const agentPerf = agents.map(agent => {
      const id = agent._id.toString();
      const pay = payMap[id] || { revenue: 0, transactions: 0, cash: 0, mobile_money: 0, card: 0 };
      const agOrders = orderMap[id] || 0;
      return {
        agent: { _id: agent._id, firstName: agent.firstName, lastName: agent.lastName, email: agent.email },
        orders: agOrders,
        revenue: pay.revenue,
        tickets: ticketMap[id] || 0,
        transactions: pay.transactions,
        byMethod: { cash: pay.cash, mobile_money: pay.mobile_money, card: pay.card },
        orderPercent: allOrderCount > 0 ? Math.round((agOrders / allOrderCount) * 100) : 0,
        revenuePercent: totalRevenueAll > 0 ? Math.round((pay.revenue / totalRevenueAll) * 100) : 0,
        lastLogin: agent.lastLogin
      };
    });

    agentPerf.sort((a, b) => b.revenue - a.revenue);
    res.json({ success: true, data: agentPerf, totals: { orders: allOrderCount, revenue: totalRevenueAll } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/revenue-history - Full revenue history (daily + monthly aggregation)
router.get('/revenue-history', auth, adminOnly, SC, async (req, res) => {
  try {
    const { year, month } = req.query;
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();

    if (month) {
      // Daily breakdown for a specific month
      const targetMonth = parseInt(month) - 1;
      const start = new Date(targetYear, targetMonth, 1);
      const end = new Date(targetYear, targetMonth + 1, 1);

      const payments = await Payment.find({
        createdAt: { $gte: start, $lt: end },
        status: 'completed'
      }).sort({ createdAt: 1 });

      const byDay = {};
      const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        byDay[key] = { date: key, revenue: 0, transactions: 0, cash: 0, card: 0, mobile_money: 0 };
      }

      for (const p of payments) {
        const key = p.createdAt.toISOString().split('T')[0];
        if (byDay[key]) {
          byDay[key].revenue += p.amount;
          byDay[key].transactions++;
          if (p.method === 'cash') byDay[key].cash += p.amount;
          else if (p.method === 'card') byDay[key].card += p.amount;
          else if (p.method === 'mobile_money') byDay[key].mobile_money += p.amount;
        }
      }

      const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
      const totalTransactions = payments.length;

      res.json({
        success: true,
        data: Object.values(byDay),
        totalRevenue,
        totalTransactions,
        period: { year: targetYear, month: parseInt(month) }
      });
    } else {
      // Monthly breakdown for a year
      const start = new Date(targetYear, 0, 1);
      const end = new Date(targetYear + 1, 0, 1);

      const payments = await Payment.find({
        createdAt: { $gte: start, $lt: end },
        status: 'completed'
      }).sort({ createdAt: 1 });

      const byMonth = {};
      for (let m = 0; m < 12; m++) {
        const key = `${targetYear}-${String(m + 1).padStart(2, '0')}`;
        byMonth[key] = { month: key, monthName: new Date(targetYear, m).toLocaleString('fr-FR', { month: 'long' }), revenue: 0, transactions: 0, cash: 0, card: 0, mobile_money: 0 };
      }

      for (const p of payments) {
        const m = p.createdAt.getMonth();
        const key = `${targetYear}-${String(m + 1).padStart(2, '0')}`;
        if (byMonth[key]) {
          byMonth[key].revenue += p.amount;
          byMonth[key].transactions++;
          if (p.method === 'cash') byMonth[key].cash += p.amount;
          else if (p.method === 'card') byMonth[key].card += p.amount;
          else if (p.method === 'mobile_money') byMonth[key].mobile_money += p.amount;
        }
      }

      const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
      const totalTransactions = payments.length;

      res.json({
        success: true,
        data: Object.values(byMonth),
        totalRevenue,
        totalTransactions,
        period: { year: targetYear }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/daily-report/:date - Detailed daily report for PDF/print
router.get('/daily-report/:date', auth, adminOnly, async (req, res) => {
  try {
    const dateStr = req.params.date;
    const start = new Date(dateStr + 'T00:00:00.000Z');
    const end = new Date(dateStr + 'T23:59:59.999Z');

    const [payments, orders, tickets] = await Promise.all([
      Payment.find({ createdAt: { $gte: start, $lte: end }, status: 'completed' })
        .populate('agent', 'firstName lastName')
        .populate('ticket', 'ticketNumber type')
        .sort({ createdAt: 1 }),
      Order.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } })
        .populate('agent', 'firstName lastName')
        .populate('table', 'number name'),
      Ticket.find({ createdAt: { $gte: start, $lte: end } })
    ]);

    const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
    const byMethod = {
      cash: payments.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
      card: payments.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0),
      mobile_money: payments.filter(p => p.method === 'mobile_money').reduce((s, p) => s + p.amount, 0),
      gift_card: payments.filter(p => p.method === 'gift_card').reduce((s, p) => s + p.amount, 0),
    };

    // Product breakdown
    const productMap = {};
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.name;
        if (!productMap[key]) productMap[key] = { name: key, quantity: 0, revenue: 0 };
        productMap[key].quantity += item.quantity;
        productMap[key].revenue += item.totalPrice;
      }
    }
    const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

    // Agent breakdown
    const agentMap = {};
    for (const p of payments) {
      const aId = p.agent?._id?.toString() || 'unknown';
      const aName = p.agent ? `${p.agent.firstName} ${p.agent.lastName}` : 'Inconnu';
      if (!agentMap[aId]) agentMap[aId] = { name: aName, revenue: 0, transactions: 0 };
      agentMap[aId].revenue += p.amount;
      agentMap[aId].transactions++;
    }
    const agents = Object.values(agentMap).sort((a, b) => b.revenue - a.revenue);

    // Hourly breakdown
    const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, revenue: 0, transactions: 0 }));
    for (const p of payments) {
      const h = new Date(p.createdAt).getHours();
      hourly[h].revenue += p.amount;
      hourly[h].transactions++;
    }

    res.json({
      success: true,
      data: {
        date: dateStr,
        totalRevenue,
        totalTransactions: payments.length,
        totalOrders: orders.length,
        totalTickets: tickets.length,
        byMethod,
        payments: payments.map(p => ({
          _id: p._id,
          paymentNumber: p.paymentNumber,
          amount: p.amount,
          method: p.method,
          agent: p.agent ? `${p.agent.firstName} ${p.agent.lastName}` : 'Inconnu',
          ticket: p.ticket?.ticketNumber || '',
          time: p.createdAt
        })),
        products,
        agents,
        hourly
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/daily-invoices?date=YYYY-MM-DD — All paid invoices for a day, grouped by agent
router.get('/daily-invoices', auth, adminOnly, async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const start = new Date(dateStr + 'T00:00:00.000Z');
    const end = new Date(dateStr + 'T23:59:59.999Z');

    const invoices = await Ticket.find({
      type: 'invoice',
      isPaid: true,
      createdAt: { $gte: start, $lte: end }
    })
      .populate('agent', 'firstName lastName')
      .populate('table', 'number name')
      .populate('payment')
      .sort({ createdAt: 1 });

    // Group by agent
    const byAgent = {};
    let grandTotal = 0;
    let totalCash = 0;
    let totalMobileMoney = 0;
    let totalCard = 0;

    for (const inv of invoices) {
      const agentId = inv.agent?._id?.toString() || 'unknown';
      const agentName = inv.agent ? `${inv.agent.firstName} ${inv.agent.lastName}` : 'Inconnu';

      if (!byAgent[agentId]) {
        byAgent[agentId] = { agentName, invoices: [], total: 0, cash: 0, mobileMoney: 0, card: 0 };
      }

      const entry = {
        _id: inv._id,
        ticketNumber: inv.ticketNumber,
        table: inv.table ? `Table ${inv.table.number}` : (inv.orderType === 'delivery' ? 'Livraison' : 'À emporter'),
        items: inv.items,
        total: inv.total,
        createdAt: inv.createdAt,
        paymentMethod: inv.payment?.method || 'unknown',
        mixedPayments: inv.payment?.mixedPayments || []
      };

      // Aggregate by payment method
      if (inv.payment) {
        if (inv.payment.method === 'mixed' && inv.payment.mixedPayments?.length > 0) {
          for (const mp of inv.payment.mixedPayments) {
            if (mp.method === 'cash') { byAgent[agentId].cash += mp.amount; totalCash += mp.amount; }
            else if (mp.method === 'mobile_money') { byAgent[agentId].mobileMoney += mp.amount; totalMobileMoney += mp.amount; }
            else if (mp.method === 'card') { byAgent[agentId].card += mp.amount; totalCard += mp.amount; }
          }
        } else if (inv.payment.method === 'cash') {
          byAgent[agentId].cash += inv.total; totalCash += inv.total;
        } else if (inv.payment.method === 'mobile_money') {
          byAgent[agentId].mobileMoney += inv.total; totalMobileMoney += inv.total;
        } else if (inv.payment.method === 'card') {
          byAgent[agentId].card += inv.total; totalCard += inv.total;
        }
      }

      byAgent[agentId].invoices.push(entry);
      byAgent[agentId].total += inv.total;
      grandTotal += inv.total;
    }

    res.json({
      success: true,
      data: {
        date: dateStr,
        invoiceCount: invoices.length,
        grandTotal,
        totalCash,
        totalMobileMoney,
        totalCard,
        agents: Object.values(byAgent)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
