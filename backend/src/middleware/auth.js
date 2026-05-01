'use strict';

const jwt = require('jsonwebtoken');
const { db } = require('../db/database');

/**
 * requireAuth
 * Verifies the JWT Bearer token in the Authorization header.
 * On success, attaches the full user row to req.user.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('[AUTH] JWT_SECRET is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = db.get(
    `SELECT id, name, email, phone, role, status, license_expires_at, created_at, approved_at, last_login, notes
       FROM users WHERE id = ?`,
    [payload.sub]
  );

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Account suspended' });
  }

  req.user = user;
  next();
}

/**
 * requireAdmin
 * Extends requireAuth — additionally checks that the user has the 'admin' role.
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
