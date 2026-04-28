'use strict';

const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All vehicle routes require authentication
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helper — verify user has active access to a vehicle
// ---------------------------------------------------------------------------
function getUserVehicleAccess(userId, vehicleId) {
  return db.get(
    `SELECT va.id, va.access_level
       FROM vehicle_access va
      WHERE va.user_id = ? AND va.vehicle_id = ? AND va.is_active = 1`,
    [userId, vehicleId]
  );
}

// ---------------------------------------------------------------------------
// GET /api/vehicles  — list vehicles accessible to the authenticated user
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  try {
    const vehicles = db.all(
      `SELECT v.id, v.vin, v.nickname, v.make, v.model, v.year, v.color,
              v.owner_user_id, v.created_at,
              va.access_level, va.granted_at,
              (SELECT COUNT(*) FROM ble_enrollments be
                WHERE be.vehicle_id = v.id
                  AND be.user_id = ?
                  AND be.is_active = 1) AS enrolled
         FROM vehicles v
         JOIN vehicle_access va ON va.vehicle_id = v.id
        WHERE va.user_id = ? AND va.is_active = 1
        ORDER BY v.created_at ASC`,
      [req.user.id, req.user.id]
    );

    return res.json(vehicles);
  } catch (err) {
    console.error('[VEHICLES /]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/vehicles/:id/history  — command log for this vehicle
// ---------------------------------------------------------------------------
router.get('/:id/history', (req, res) => {
  try {
    const { id } = req.params;

    // Verify access
    const access = getUserVehicleAccess(req.user.id, id);
    if (!access) {
      return res.status(403).json({ error: 'No access to this vehicle' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const logs = db.all(
      `SELECT cl.id, cl.command, cl.source, cl.status, cl.error_msg,
              cl.executed_at, cl.completed_at,
              u.name AS user_name
         FROM command_logs cl
         LEFT JOIN users u ON u.id = cl.user_id
        WHERE cl.vehicle_id = ?
        ORDER BY cl.executed_at DESC
        LIMIT ? OFFSET ?`,
      [id, limit, offset]
    );

    return res.json(logs);
  } catch (err) {
    console.error('[VEHICLES /:id/history]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/vehicles/:id/diagnostics  — OBD2 / vehicle status placeholder
// ---------------------------------------------------------------------------
router.get('/:id/diagnostics', (req, res) => {
  try {
    const { id } = req.params;

    const access = getUserVehicleAccess(req.user.id, id);
    if (!access) {
      return res.status(403).json({ error: 'No access to this vehicle' });
    }

    const vehicle = db.get('SELECT vin, make, model, year FROM vehicles WHERE id = ?', [id]);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // OBD2 real-time data is collected locally via BLE on the mobile device.
    // This endpoint returns a placeholder indicating that live data must be
    // fetched directly from the vehicle over Bluetooth.
    return res.json({
      source: 'ble_only',
      message:
        'OBD2 diagnostics are read directly from the vehicle via Bluetooth Low Energy. ' +
        'Connect to the vehicle in the app to view live diagnostic data.',
      vehicleId: id,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model || null,
      year: vehicle.year || null,
      timestamp: new Date().toISOString(),
      data: null,
    });
  } catch (err) {
    console.error('[VEHICLES /:id/diagnostics]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/vehicles/:id/location  — last known location placeholder
// ---------------------------------------------------------------------------
router.get('/:id/location', (req, res) => {
  try {
    const { id } = req.params;

    const access = getUserVehicleAccess(req.user.id, id);
    if (!access) {
      return res.status(403).json({ error: 'No access to this vehicle' });
    }

    const vehicle = db.get('SELECT vin, make, model, year FROM vehicles WHERE id = ?', [id]);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // Location data is provided by the GM OnStar API or directly from the
    // vehicle's GPS module via BLE.  Without an active GM access token we
    // return a placeholder indicating the feature requires connectivity.
    return res.json({
      source: 'gm_onstar',
      message:
        'Vehicle location is retrieved from GM OnStar. ' +
        'Ensure GM credentials are configured and the vehicle has an active OnStar subscription.',
      vehicleId: id,
      vin: vehicle.vin,
      timestamp: new Date().toISOString(),
      location: null,
    });
  } catch (err) {
    console.error('[VEHICLES /:id/location]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
