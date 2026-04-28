'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All notification routes require authentication
router.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /api/notifications/register-token
// Registers a push notification token for the authenticated user.
// Body: { token, platform }  — platform is 'ios' | 'android' | 'web'
// ---------------------------------------------------------------------------
router.post('/register-token', (req, res) => {
  try {
    const { token, platform } = req.body;
    const userId = req.user.id;

    if (!token || !token.trim()) {
      return res.status(400).json({ error: 'token is required' });
    }

    const normalizedToken = token.trim();
    const now = new Date().toISOString();

    // Check if this exact token is already registered for this user
    const existing = db.get(
      'SELECT id FROM push_tokens WHERE user_id = ? AND token = ?',
      [userId, normalizedToken]
    );

    if (existing) {
      // Token already registered — return success without duplicating
      return res.json({ success: true, updated: false });
    }

    db.run(
      `INSERT INTO push_tokens (id, user_id, token, platform, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), userId, normalizedToken, platform || null, now]
    );

    return res.json({ success: true, updated: true });
  } catch (err) {
    console.error('[NOTIFICATIONS /register-token]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/notifications/token
// Removes a push token for the authenticated user.
// Body: { token }
// ---------------------------------------------------------------------------
router.delete('/token', (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token || !token.trim()) {
      return res.status(400).json({ error: 'token is required' });
    }

    const result = db.run(
      'DELETE FROM push_tokens WHERE user_id = ? AND token = ?',
      [userId, token.trim()]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Token not found for this user' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[NOTIFICATIONS /token DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
