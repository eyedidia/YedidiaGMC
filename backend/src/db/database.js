'use strict';

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// PersistentDb — thin wrapper around sql.js that persists to disk
// ---------------------------------------------------------------------------
class PersistentDb {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
  }

  async init() {
    const SQL = await initSqlJs();

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      const fileBuffer = fs.readFileSync(this.filePath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
      this._save();
    }
  }

  _save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.filePath, buffer);
  }

  /**
   * Execute a write SQL statement (INSERT / UPDATE / DELETE / CREATE / DROP).
   * Persists to disk after each call.
   * @param {string} sql
   * @param {Array|Object} params
   * @returns {{ lastInsertRowid: number, changes: number }}
   */
  run(sql, params = []) {
    this.db.run(sql, params);
    const stmt = this.db.prepare('SELECT last_insert_rowid() AS id, changes() AS changes');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    this._save();
    return { lastInsertRowid: row.id, changes: row.changes };
  }

  /**
   * Return the first matching row as a plain object, or undefined.
   * @param {string} sql
   * @param {Array|Object} params
   * @returns {Object|undefined}
   */
  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    let result;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  /**
   * Return all matching rows as an array of plain objects.
   * @param {string} sql
   * @param {Array|Object} params
   * @returns {Object[]}
   */
  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /**
   * Execute raw SQL (e.g. multi-statement schema migrations).
   * Persists to disk after each call.
   * @param {string} sql
   */
  exec(sql) {
    this.db.exec(sql);
    this._save();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '../../data/yedidiagmc.db');

const db = new PersistentDb(dbPath);

// ---------------------------------------------------------------------------
// Schema DDL
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  phone               TEXT,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'user',
  status              TEXT NOT NULL DEFAULT 'pending',
  license_expires_at  TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at         TEXT,
  approved_by         TEXT,
  last_login          TEXT,
  notes               TEXT
);

CREATE TABLE IF NOT EXISTS vehicles (
  id            TEXT PRIMARY KEY,
  vin           TEXT UNIQUE NOT NULL,
  nickname      TEXT,
  make          TEXT NOT NULL DEFAULT 'GMC',
  model         TEXT,
  year          INTEGER,
  color         TEXT,
  owner_user_id TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicle_access (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  vehicle_id   TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'full',
  granted_by   TEXT,
  granted_at   TEXT NOT NULL DEFAULT (datetime('now')),
  is_active    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS gm_credentials (
  id              TEXT PRIMARY KEY,
  user_id         TEXT UNIQUE NOT NULL,
  gm_username     TEXT,
  gm_password_enc TEXT,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TEXT,
  created_at      TEXT,
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS ble_enrollments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  vehicle_id  TEXT NOT NULL,
  device_name TEXT,
  key_id      TEXT,
  public_key  TEXT,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS command_logs (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  vehicle_id   TEXT,
  command      TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'ble',
  status       TEXT NOT NULL DEFAULT 'sent',
  error_msg    TEXT,
  executed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  token      TEXT NOT NULL,
  platform   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ---------------------------------------------------------------------------
// initDb — called once at startup
// ---------------------------------------------------------------------------
async function initDb() {
  await db.init();

  // Create all tables
  db.exec(SCHEMA_SQL);

  // Seed admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@yedidiagmc.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin1234!';

  const existing = db.get('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (!existing) {
    const passwordHash = bcrypt.hashSync(adminPassword, 12);
    const adminId = uuidv4();
    const farFuture = '2099-12-31T23:59:59.000Z';

    db.run(
      `INSERT INTO users
         (id, name, email, phone, password_hash, role, status, license_expires_at, created_at, approved_at, approved_by)
       VALUES
         (?, ?, ?, ?, ?, 'admin', 'approved', ?, datetime('now'), datetime('now'), ?)`,
      [adminId, 'Administrator', adminEmail, null, passwordHash, farFuture, adminId]
    );

    console.log(`[DB] Admin user seeded: ${adminEmail}`);
  }

  console.log('[DB] Database initialized successfully');
}

module.exports = { db, initDb };
