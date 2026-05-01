'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin authentication
router.use(requireAdmin);

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

function addYears(dateStr, years) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    now.setFullYear(now.getFullYear() + years);
    return now.toISOString();
  }
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------------------
router.get('/stats', (req, res) => {
  try {
    const now = new Date().toISOString();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const totalUsers = db.get(
      "SELECT COUNT(*) AS cnt FROM users WHERE role != 'admin'"
    );
    const pendingApproval = db.get(
      "SELECT COUNT(*) AS cnt FROM users WHERE status = 'pending'"
    );
    const expiringLicenses = db.get(
      `SELECT COUNT(*) AS cnt FROM users
        WHERE role != 'admin'
          AND status = 'approved'
          AND license_expires_at IS NOT NULL
          AND license_expires_at <= ?
          AND license_expires_at > ?`,
      [in30Days, now]
    );
    const activeVehicles = db.get(
      'SELECT COUNT(*) AS cnt FROM vehicles'
    );
    const totalCommands = db.get(
      'SELECT COUNT(*) AS cnt FROM command_logs'
    );
    const recentCommands = db.all(
      `SELECT cl.id, cl.command, cl.source, cl.status, cl.executed_at,
              u.name AS user_name, u.email AS user_email,
              v.vin, v.nickname AS vehicle_nickname
         FROM command_logs cl
         LEFT JOIN users u ON u.id = cl.user_id
         LEFT JOIN vehicles v ON v.id = cl.vehicle_id
        ORDER BY cl.executed_at DESC
        LIMIT 10`
    );

    return res.json({
      totalUsers: totalUsers ? totalUsers.cnt : 0,
      pendingApproval: pendingApproval ? pendingApproval.cnt : 0,
      expiringLicenses: expiringLicenses ? expiringLicenses.cnt : 0,
      activeVehicles: activeVehicles ? activeVehicles.cnt : 0,
      totalCommands: totalCommands ? totalCommands.cnt : 0,
      recentCommands,
    });
  } catch (err) {
    console.error('[ADMIN /stats]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------
router.get('/users', (req, res) => {
  try {
    const { status } = req.query;

    let whereClause = '';
    const params = [];

    if (status && status !== 'all') {
      whereClause = 'WHERE u.status = ?';
      params.push(status);
    }

    const users = db.all(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.status,
              u.license_expires_at, u.created_at, u.approved_at,
              u.last_login, u.notes
         FROM users u
         ${whereClause}
        ORDER BY u.created_at DESC`,
      params
    );

    // For each user, get their vehicles and enrollment count
    const result = users.map((user) => {
      const vehicles = db.all(
        `SELECT v.id, v.vin, v.nickname, v.make, v.model, v.year, v.color,
                va.access_level, va.granted_at, va.is_active
           FROM vehicles v
           JOIN vehicle_access va ON va.vehicle_id = v.id
          WHERE va.user_id = ?`,
        [user.id]
      );

      const enrollmentCount = db.get(
        'SELECT COUNT(*) AS cnt FROM ble_enrollments WHERE user_id = ? AND is_active = 1',
        [user.id]
      );

      return {
        ...user,
        vehicles,
        enrollmentCount: enrollmentCount ? enrollmentCount.cnt : 0,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('[ADMIN /users]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users  — create a fully-approved user
// ---------------------------------------------------------------------------
router.post('/users', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      vin,
      vehicleNickname,
      gmUsername,
      gmPassword,
      licenseYears,
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

    const existingUser = db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const years = parseInt(licenseYears, 10) || 3;
    const now = new Date().toISOString();
    const licenseExpiresAt = addYears(now, years);

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    // Create user (auto-approved)
    db.run(
      `INSERT INTO users
         (id, name, email, phone, password_hash, role, status,
          license_expires_at, created_at, approved_at, approved_by)
       VALUES (?, ?, ?, ?, ?, 'user', 'approved', ?, ?, ?, ?)`,
      [
        userId,
        name.trim(),
        normalizedEmail,
        phone || null,
        passwordHash,
        licenseExpiresAt,
        now,
        now,
        req.user.id,
      ]
    );

    // Create vehicle
    let vehicleId;
    const existingVehicle = db.get('SELECT id FROM vehicles WHERE vin = ?', [normalizedVin]);

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
    db.run(
      `INSERT OR IGNORE INTO vehicle_access
         (id, user_id, vehicle_id, access_level, granted_by, granted_at)
       VALUES (?, ?, ?, 'full', ?, ?)`,
      [uuidv4(), userId, vehicleId, req.user.id, now]
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
        console.warn('[ADMIN /users POST] Could not encrypt GM password:', encErr.message);
      }
    }

    return res.status(201).json({
      userId,
      email: normalizedEmail,
      password,
      vin: normalizedVin,
      licenseExpiresAt,
    });
  } catch (err) {
    console.error('[ADMIN /users POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/approve
// ---------------------------------------------------------------------------
router.post('/users/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date().toISOString();
    const licenseExpiresAt = addYears(now, 3);

    const user = db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run(
      `UPDATE users
          SET status = 'approved',
              license_expires_at = ?,
              approved_by = ?,
              approved_at = ?
        WHERE id = ?`,
      [licenseExpiresAt, req.user.id, now, id]
    );

    return res.json({ success: true, licenseExpiresAt });
  } catch (err) {
    console.error('[ADMIN /users/:id/approve]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/reject
// ---------------------------------------------------------------------------
router.post('/users/:id/reject', (req, res) => {
  try {
    const { id } = req.params;

    const user = db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run("UPDATE users SET status = 'rejected' WHERE id = ?", [id]);

    return res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN /users/:id/reject]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/suspend
// ---------------------------------------------------------------------------
router.post('/users/:id/suspend', (req, res) => {
  try {
    const { id } = req.params;

    const user = db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run("UPDATE users SET status = 'suspended' WHERE id = ?", [id]);

    return res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN /users/:id/suspend]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/extend-license
// ---------------------------------------------------------------------------
router.post('/users/:id/extend-license', (req, res) => {
  try {
    const { id } = req.params;
    const years = parseInt(req.body.years, 10) || 3;

    const user = db.get(
      'SELECT id, status, license_expires_at FROM users WHERE id = ?',
      [id]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const currentExpiry = user.license_expires_at ? new Date(user.license_expires_at) : now;

    // Use the later of current expiry and now as the base
    const base = currentExpiry > now ? currentExpiry : now;
    base.setFullYear(base.getFullYear() + years);
    const newExpiresAt = base.toISOString();

    // If user was suspended, reinstate as approved (admin explicitly extending license)
    const newStatus = user.status === 'suspended' ? 'approved' : user.status;

    db.run(
      'UPDATE users SET license_expires_at = ?, status = ? WHERE id = ?',
      [newExpiresAt, newStatus, id]
    );

    return res.json({ success: true, newExpiresAt });
  } catch (err) {
    console.error('[ADMIN /users/:id/extend-license]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/vehicles
// ---------------------------------------------------------------------------
router.get('/vehicles', (req, res) => {
  try {
    const vehicles = db.all(
      `SELECT v.id, v.vin, v.nickname, v.make, v.model, v.year, v.color,
              v.owner_user_id, v.created_at,
              u.name AS owner_name, u.email AS owner_email, u.status AS owner_status
         FROM vehicles v
         LEFT JOIN users u ON u.id = v.owner_user_id
        ORDER BY v.created_at DESC`
    );

    // Add enrollment count for each vehicle
    const result = vehicles.map((vehicle) => {
      const enrollmentCount = db.get(
        'SELECT COUNT(*) AS cnt FROM ble_enrollments WHERE vehicle_id = ? AND is_active = 1',
        [vehicle.id]
      );
      const accessCount = db.get(
        'SELECT COUNT(*) AS cnt FROM vehicle_access WHERE vehicle_id = ? AND is_active = 1',
        [vehicle.id]
      );

      return {
        ...vehicle,
        enrollmentCount: enrollmentCount ? enrollmentCount.cnt : 0,
        accessCount: accessCount ? accessCount.cnt : 0,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('[ADMIN /vehicles]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/command-logs
// ---------------------------------------------------------------------------
router.get('/command-logs', (req, res) => {
  try {
    const logs = db.all(
      `SELECT cl.id, cl.command, cl.source, cl.status, cl.error_msg,
              cl.executed_at, cl.completed_at,
              u.name AS user_name, u.email AS user_email,
              v.vin, v.nickname AS vehicle_nickname
         FROM command_logs cl
         LEFT JOIN users u ON u.id = cl.user_id
         LEFT JOIN vehicles v ON v.id = cl.vehicle_id
        ORDER BY cl.executed_at DESC
        LIMIT 100`
    );

    return res.json(logs);
  } catch (err) {
    console.error('[ADMIN /command-logs]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/enrollments
// ---------------------------------------------------------------------------
router.get('/enrollments', (req, res) => {
  try {
    const enrollments = db.all(
      `SELECT be.id, be.device_name, be.key_id, be.enrolled_at,
              be.last_used_at, be.is_active,
              u.name AS user_name, u.email AS user_email,
              v.vin, v.nickname AS vehicle_nickname
         FROM ble_enrollments be
         LEFT JOIN users u ON u.id = be.user_id
         LEFT JOIN vehicles v ON v.id = be.vehicle_id
        ORDER BY be.enrolled_at DESC`
    );

    return res.json(enrollments);
  } catch (err) {
    console.error('[ADMIN /enrollments]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
