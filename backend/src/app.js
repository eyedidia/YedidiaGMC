'use strict';

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db/database');

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const vehicleRoutes = require('./routes/vehicles');
const notificationRoutes = require('./routes/notifications');

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

// ---------------------------------------------------------------------------
// Trust proxy (required when behind nginx/load balancer for rate limiting)
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(
  cors({
    origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: corsOrigin !== '*',
  })
);

// ---------------------------------------------------------------------------
// Body parser
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------------------------------------------------------------------------
// Rate limiting — global (100 req / 15 min)
// ---------------------------------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use(globalLimiter);

// ---------------------------------------------------------------------------
// Stricter rate limit for login endpoint (5 req / 15 min)
// ---------------------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

app.use('/api/auth/login', loginLimiter);

// ---------------------------------------------------------------------------
// Static admin panel
// ---------------------------------------------------------------------------
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Serve admin SPA on /admin (index.html for all sub-paths)
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/notifications', notificationRoutes);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[APP ERROR]', err);

  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Handle payload too large
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  const statusCode = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  return res.status(statusCode).json({ error: message });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;

async function start() {
  try {
    await initDb();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[APP] YedidiaGMC backend running on port ${PORT}`);
      console.log(`[APP] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[APP] Admin panel: http://localhost:${PORT}/admin`);
      console.log(`[APP] Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('[APP] Failed to initialize database:', err);
    process.exit(1);
  }
}

start();

module.exports = app; // Export for testing
