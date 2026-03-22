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

// GET /api/stats/revenue-history - Full revenue history (daily + monthly aggregation)
router.get('/revenue-history', auth, adminOnly, async (req, res) => {
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
