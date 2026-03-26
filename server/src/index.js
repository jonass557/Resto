const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const User = require('./models/User');
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
  }
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
  console.log('Client connected:', socket.id);

  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('leave-room', (room) => {
    socket.leave(room);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
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

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  compressors: 'zlib'
})
  .then(async () => {
    console.log('MongoDB connecté avec succès');
    await ensureAdminExists();
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
    });
  })
  .catch((err) => {
    console.error('Erreur de connexion MongoDB:', err.message);
    process.exit(1);
  });

module.exports = { app, server, io };
