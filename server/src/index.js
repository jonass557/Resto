const express = require('express');
const http = require('http');
const path = require('path');
const axios = require('axios');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const User = require('./models/User');
const CashRegister = require('./models/CashRegister');
const Ticket = require('./models/Ticket');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const tableRoutes = require('./routes/tables');
const orderRoutes = require('./routes/orders');
const ticketRoutes = require('./routes/tickets');
const paymentRoutes = require('./routes/payments');
const cashRegisterRoutes = require('./routes/cashRegister');
const clientRoutes = require('./routes/clients');
const statsRoutes = require('./routes/stats');
const accountingRoutes = require('./routes/accounting');
const printerRoutes = require('./routes/printer');
const settingsRoutes = require('./routes/settings');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);

// CORS origins — support comma-separated list in CLIENT_URL for multiple domains
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  },
  // WebSocket uniquement — élimine la latence du fallback HTTP long-polling
  transports: ['websocket'],
  // Ping/pong optimisé pour Railway (connexions stables)
  pingTimeout: 20000,
  pingInterval: 25000,
  upgradeTimeout: 5000
});

// Middleware
app.use(compression()); // gzip all responses
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true
}));
// Support Private Network Access (Chrome 104+) — allows HTTPS sites to reach this local server
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/cash-register', cashRegisterRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/printer', printerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Print-server discovery — allows clients to detect a local print server
app.get('/api/print-server/ping', (req, res) => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  const localIPs = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) localIPs.push(iface.address);
    }
  }
  res.json({
    success: true,
    printServer: true,
    hostname: os.hostname(),
    localIPs,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Socket.io
io.on('connection', (socket) => {
  socket.on('join-room', (room) => {
    socket.join(room);
  });

  socket.on('leave-room', (room) => {
    socket.leave(room);
  });

  // Agent d'impression : s'enregistre seulement si le serveur local est disponible sur cet appareil
  socket.on('register-print-agent', () => {
    socket.join('print-agents');
    console.log(`🖨️  Agent d'impression enregistré: ${socket.id}`);
  });

  socket.on('unregister-print-agent', () => {
    socket.leave('print-agents');
    console.log(`🔌 Agent d'impression désenregistré: ${socket.id}`);
  });

  socket.on('disconnect', () => {});
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Serve built client (for local print-server mode)
const clientBuildPath = path.join(__dirname, '../../client/dist');
const fs = require('fs');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
  console.log('📂 Serving client build from', clientBuildPath);
} else {
  // 404 handler (no client build available)
  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route non trouvée' });
  });
}

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;

async function ensureAdminExists() {
  try {
    const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
    if (adminCount === 0) {
      const email = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
      const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        existing.role = 'admin';
        await existing.save();
        console.log(`✅ Utilisateur ${email} promu administrateur automatiquement`);
      } else {
        await User.create({
          firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
          lastName: process.env.ADMIN_LAST_NAME || 'Principal',
          email,
          password,
          role: 'admin'
        });
        console.log(`✅ Compte admin créé automatiquement : ${email} / ${password}`);
        console.log('⚠️  Changez ce mot de passe dès la première connexion !');
      }
    }
  } catch (err) {
    console.error('Erreur init admin:', err.message);
  }
}

// ── Print-agent client ───────────────────────────────────────────────────────
// When CLOUD_SERVER_URL is set (local print-agent mode), this server connects
// to the cloud backend as a Socket.IO CLIENT, registers itself as a print-agent,
// and handles print-job events by sending ESC/POS data to the WiFi printer.
function startPrintAgentClient() {
  const cloudUrl = process.env.CLOUD_SERVER_URL;
  if (!cloudUrl) return;

  const { io: ioClient } = require('socket.io-client');
  const net = require('net');

  const cloudSocket = ioClient(cloudUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
  });

  cloudSocket.on('connect', () => {
    cloudSocket.emit('register-print-agent');
    console.log(`🖨️  Agent d'impression connecté au cloud: ${cloudUrl}`);
  });

  cloudSocket.on('disconnect', () => {
    console.log('🔌 Agent d\'impression déconnecté du cloud, reconnexion en cours...');
  });

  cloudSocket.on('connect_error', (err) => {
    console.error('⚠️  Erreur connexion cloud:', err.message);
  });

  cloudSocket.on('print-job', async (job) => {
    console.log(`📄 Job d'impression reçu: ${job.id || 'unknown'}`);
    if (job.type !== 'network' || !job.address || !job.receiptBuffer) {
      console.warn('⚠️  Job ignoré (type ou adresse manquant)');
      return;
    }
    try {
      const buffer = Buffer.from(job.receiptBuffer, 'base64');
      const printerSocket = await new Promise((resolve, reject) => {
        const s = net.createConnection({ host: job.address, port: job.port || 9100 }, () => resolve(s));
        s.setTimeout(8000);
        s.on('error', reject);
        s.on('timeout', () => { s.destroy(); reject(new Error('Timeout imprimante')); });
      });
      await new Promise((resolve, reject) => {
        printerSocket.on('error', reject);
        printerSocket.write(buffer, (err) => {
          if (err) return reject(err);
          printerSocket.end(resolve);
        });
      });
      console.log(`✅ Imprimé via WiFi: ${job.address}:${job.port || 9100}`);
    } catch (err) {
      console.error(`❌ Erreur impression: ${err.message}`);
    }
  });

  // Facture supprimée : le cloud délègue l'impression à l'agent local
  cloudSocket.on('ticket:deleted-print', async ({ ticketData }) => {
    if (!ticketData?.ticketNumber) return;
    console.log(`🗑️ Impression facture supprimée: ${ticketData.ticketNumber}`);
    const localPort = process.env.PORT || 5000;
    try {
      const resp = await axios.post(
        `http://localhost:${localPort}/api/printer/print-ticket`,
        { ticketData },
        {
          headers: { 'X-Internal-Key': process.env.JWT_SECRET },
          timeout: 15000
        }
      );
      if (resp.data?.data?.printed) {
        console.log('✅ Facture supprimée imprimée localement:', ticketData.ticketNumber);
      } else {
        console.warn('⚠️  Facture supprimée: réponse inattendue', resp.data?.message);
      }
    } catch (err) {
      console.error(`❌ Erreur impression facture supprimée: ${err.message}`);
    }
  });

  // Rapport global : le cloud délègue à l'agent local (même schéma que ticket:auto-print)
  cloudSocket.on('report:print', async ({ date, service }) => {
    console.log(`📊 Impression rapport global reçue: ${date} service=${service}`);
    const localPort = process.env.PORT || 5000;
    try {
      const resp = await axios.post(
        `http://localhost:${localPort}/api/printer/print-global-report`,
        { date, service },
        {
          headers: { 'X-Internal-Key': process.env.JWT_SECRET },
          timeout: 20000
        }
      );
      if (resp.data?.data?.printed) {
        console.log('✅ Rapport global imprimé localement');
      } else {
        console.warn('⚠️  Rapport global: réponse inattendue', resp.data?.message);
      }
    } catch (err) {
      console.error(`❌ Erreur impression rapport global: ${err.message}`);
    }
  });
}

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 25,        // plan payant → plus de RAM disponible
  minPoolSize: 5,         // connexions pré-établies au démarrage
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  heartbeatFrequencyMS: 10000,
  compressors: 'zlib'
})
  .then(async () => {
    console.log('MongoDB connecté avec succès');
    await ensureAdminExists();

    // Nettoyage automatique : supprimer les sessions caisse fermées depuis plus de 30 jours
    const cleanCashHistory = async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await CashRegister.deleteMany({ status: 'closed', closedAt: { $lt: cutoff } });
      if (result.deletedCount > 0) console.log(`🗑️  ${result.deletedCount} session(s) caisse supprimée(s) (>30j)`);
    };
    // Nettoyage automatique : supprimer les factures payées depuis plus de 30 jours
    const cleanPaidInvoices = async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await Ticket.deleteMany({ type: 'invoice', isPaid: true, updatedAt: { $lt: cutoff } });
      if (result.deletedCount > 0) console.log(`🗑️  ${result.deletedCount} facture(s) payée(s) supprimée(s) (>30j)`);
    };
    await cleanCashHistory();
    await cleanPaidInvoices();
    setInterval(cleanCashHistory, 6 * 60 * 60 * 1000); // toutes les 6h
    setInterval(cleanPaidInvoices, 6 * 60 * 60 * 1000); // toutes les 6h
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Port ${PORT} occupé — nouvelle tentative dans 2s...`);
        setTimeout(() => server.listen(PORT, '0.0.0.0'), 2000);
      } else {
        console.error('❌ Erreur serveur:', err);
        process.exit(1);
      }
    });

    server.listen(PORT, '0.0.0.0', () => {
      const os = require('os');
      const ifaces = os.networkInterfaces();
      const localIPs = [];
      for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) localIPs.push(iface.address);
        }
      }
      console.log(`Serveur démarré sur le port ${PORT}`);
      if (localIPs.length) {
        console.log(`📡 Serveur d'impression local accessible sur:`);
        localIPs.forEach(ip => console.log(`   http://${ip}:${PORT}`));
      }

      // Start print-agent client if CLOUD_SERVER_URL is configured
      startPrintAgentClient();
    });
  })
  .catch((err) => {
    console.error('Erreur de connexion MongoDB:', err.message);
    process.exit(1);
  });

module.exports = { app, server, io };
