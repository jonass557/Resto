const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route non trouvée' });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connecté avec succès');
    server.listen(PORT, () => {
      console.log(`Serveur démarré sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erreur de connexion MongoDB:', err.message);
    process.exit(1);
  });

module.exports = { app, server, io };
