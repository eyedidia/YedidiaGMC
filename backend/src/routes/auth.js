'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { verifyGMCredentials } = require('../services/onstar');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encryptPassword(plaintext) {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function signToken(userId, role) {
  return jwt.sign(
    { sub: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function daysLeft(isoDate) {
  if (!isoDate) return null;
  const expires = new Date(isoDate);
  const now = new Date();
  const diff = expires - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.get(
      `SELECT id, name, email, phone, password_hash, role, status,
              license_expires_at, created_at, approved_at, last_login, notes
         FROM users WHERE email = ?`,
      [email.toLowerCase().trim()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Status checks
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Account pending approval' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Account rejected' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }

    // License check
    let licenseExpired = false;
    let days = null;

    if (user.role !== 'admin') {
      days = daysLeft(user.license_expires_at);
      if (days !== null && days <= 0) {
        licenseExpired = true;
      }
    }

    // Update last_login
    db.run('UPDATE users SET last_login = ? WHERE id = ?', [
      new Date().toISOString(),
      user.id,
    ]);

    const token = signToken(user.id, user.role);

    return res.json({
      token,
      licenseExpired,
      daysLeft: days,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        licenseExpiresAt: user.license_expires_at,
      },
    });
  } catch (err) {
    console.error('[AUTH /login]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      vin,
      vehicleNickname,
      gmUsername,
      gmPassword,
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!vin || vin.trim().length !== 17) {
      return res.status(400).json({ error: 'VIN must be exactly 17 characters' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedVin = vin.toUpperCase().trim();

    // Uniqueness check
    const existingUser = db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const existingVehicle = db.get('SELECT id FROM vehicles WHERE vin = ?', [normalizedVin]);

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const now = new Date().toISOString();

    // Create user
    db.run(
      `INSERT INTO users
         (id, name, email, phone, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'user', 'pending', ?)`,
      [userId, name.trim(), normalizedEmail, phone || null, passwordHash, now]
    );

    // Create vehicle (or reuse if VIN already registered)
    let vehicleId;
    if (!existingVehicle) {
      vehicleId = uuidv4();
      db.run(
        `INSERT INTO vehicles (id, vin, nickname, make, owner_user_id, created_at)
         VALUES (?, ?, ?, 'GMC', ?, ?)`,
        [vehicleId, normalizedVin, vehicleNickname || null, userId, now]
      );
    } else {
      vehicleId = existingVehicle.id;
    }

    // Create vehicle_access
    const accessId = uuidv4();
    db.run(
      `INSERT OR IGNORE INTO vehicle_access
         (id, user_id, vehicle_id, access_level, granted_at)
       VALUES (?, ?, ?, 'full', ?)`,
      [accessId, userId, vehicleId, now]
    );

    // Save GM credentials if provided
    if (gmUsername && gmPassword) {
      try {
        const encryptedPw = encryptPassword(gmPassword);
        db.run(
          `INSERT INTO gm_credentials
             (id, user_id, gm_username, gm_password_enc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), userId, gmUsername, encryptedPw, now, now]
        );
      } catch (encErr) {
        console.warn('[REGISTER] Could not encrypt GM password:', encErr.message);
        // Non-fatal — still create the account
      }
    }

    return res.status(201).json({
      message: 'Registration submitted, waiting for approval',
      userId,
    });
  } catch (err) {
    console.error('[AUTH /register]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-gm
// ---------------------------------------------------------------------------
router.post('/verify-gm', async (req, res) => {
  try {
    const { gmUsername, gmPassword } = req.body;

    if (!gmUsername || !gmPassword) {
      return res.status(400).json({ error: 'gmUsername and gmPassword are required' });
    }

    const result = await verifyGMCredentials(gmUsername, gmPassword);

    return res.json({
      valid: result.valid,
      message: result.message,
    });
  } catch (err) {
    console.error('[AUTH /verify-gm]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me  (requireAuth)
// ---------------------------------------------------------------------------
router.get('/me', requireAuth, (req, res) => {
  try {
    const user = req.user;

    // License info
    const days = daysLeft(user.license_expires_at);
    const licenseExpired = user.role !== 'admin' && days !== null && days <= 0;

    // Vehicles
    const vehicles = db.all(
      `SELECT v.id, v.vin, v.nickname, v.make, v.model, v.year, v.color,
              v.owner_user_id, v.created_at,
              va.access_level, va.granted_at
         FROM vehicles v
         JOIN vehicle_access va ON va.vehicle_id = v.id
        WHERE va.user_id = ? AND va.is_active = 1`,
      [user.id]
    );

    // BLE enrollments
    const enrolledVehicles = db.all(
      `SELECT be.id, be.vehicle_id, be.device_name, be.key_id,
              be.enrolled_at, be.last_used_at, be.is_active,
              v.vin, v.nickname
         FROM ble_enrollments be
         JOIN vehicles v ON v.id = be.vehicle_id
        WHERE be.user_id = ? AND be.is_active = 1`,
      [user.id]
    );

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      licenseExpiresAt: user.license_expires_at,
      licenseExpired,
      daysLeft: days,
      createdAt: user.created_at,
      lastLogin: user.last_login,
      vehicles,
      enrolledVehicles,
    });
  } catch (err) {
    console.error('[AUTH /me]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/ble-enroll  (requireAuth)
// ---------------------------------------------------------------------------
router.post('/ble-enroll', requireAuth, (req, res) => {
  try {
    const { vehicleId, keyId, publicKey, deviceName } = req.body;
    const userId = req.user.id;

    if (!vehicleId || !keyId || !publicKey) {
      return res.status(400).json({ error: 'vehicleId, keyId, and publicKey are required' });
    }

    // Verify user has access to this vehicle
    const access = db.get(
      `SELECT id FROM vehicle_access
        WHERE user_id = ? AND vehicle_id = ? AND is_active = 1`,
      [userId, vehicleId]
    );

    if (!access) {
      return res.status(403).json({ error: 'No access to this vehicle' });
    }

    const enrollmentId = uuidv4();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO ble_enrollments
         (id, user_id, vehicle_id, device_name, key_id, public_key, enrolled_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [enrollmentId, userId, vehicleId, deviceName || null, keyId, publicKey, now]
    );

    // Log the enrollment command
    db.run(
      `INSERT INTO command_logs
         (id, user_id, vehicle_id, command, source, status, executed_at, completed_at)
       VALUES (?, ?, ?, 'ENROLL', 'ble', 'success', ?, ?)`,
      [uuidv4(), userId, vehicleId, now, now]
    );

    return res.json({ success: true, enrollmentId });
  } catch (err) {
    console.error('[AUTH /ble-enroll]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password  (requireAuth)
// ---------------------------------------------------------------------------
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const userRow = db.get('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!userRow) {
      return res.status(404).json({ error: 'User not found' });
    }

    const match = await bcrypt.compare(currentPassword, userRow.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

    return res.json({ success: true });
  } catch (err) {
    console.error('[AUTH /change-password]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
