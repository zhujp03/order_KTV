const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Sqlite = require('better-sqlite3');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));

const app = express();

function envInt(name, fallback, min, max) {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.trunc(parsed);
  return Math.max(min, Math.min(max, integer));
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const DB_PATH = process.env.DB_PATH
  ? path.resolve(__dirname, process.env.DB_PATH)
  : path.join(__dirname, 'database', 'store.sqlite3');
const LEGACY_JSON_PATH = path.join(__dirname, 'database', 'store.json');
const TRUST_PROXY_RAW = process.env.TRUST_PROXY;
const ZONE_ACCESS_CODE_REQUIRED = process.env.ZONE_ACCESS_CODE_REQUIRED !== 'false';
const ZONE_ACCESS_CODE_LENGTH = envInt('ZONE_ACCESS_CODE_LENGTH', 4, 4, 8);
const ZONE_SESSION_TTL_MINUTES = envInt('ZONE_SESSION_TTL_MINUTES', 120, 5, 1440);
const ROTATE_ACCESS_CODE_ON_CHECKOUT = process.env.ROTATE_ACCESS_CODE_ON_CHECKOUT !== 'false';
const SESSION_HEADER_NAME = 'x-zone-session';

const ORDER_STATUSES = ['new', 'preparing', 'ready', 'served', 'cancelled'];
const DEBUG_REQUESTS = process.env.DEBUG_REQUESTS === '1';

function parseTrustProxy(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

const TRUST_PROXY_VALUE = parseTrustProxy(TRUST_PROXY_RAW);
if (TRUST_PROXY_VALUE !== null) {
  app.set('trust proxy', TRUST_PROXY_VALUE);
}

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

function createToken() {
  return crypto.randomBytes(12).toString('hex');
}

function createSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createAccessCode(length = ZONE_ACCESS_CODE_LENGTH) {
  const digits = [];
  for (let i = 0; i < length; i += 1) {
    digits.push(String(crypto.randomInt(0, 10)));
  }
  return digits.join('');
}

function sanitizeText(value, max = 120) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function defaultMenu() {
  return [
    {
      id: createId(),
      name: 'Signature Fried Chicken',
      price: 28,
      description: 'Freshly fried and crispy.',
      category: 'Hot Food',
      available: true,
    },
    {
      id: createId(),
      name: 'Lemon Cola',
      price: 12,
      description: 'Chilled and refreshing.',
      category: 'Drinks',
      available: true,
    },
    {
      id: createId(),
      name: 'Fruit Platter',
      price: 36,
      description: 'Daily fresh fruit combo.',
      category: 'Snacks',
      available: true,
    },
  ];
}

function defaultZones() {
  return [
    {
      id: createId(),
      label: '1 Room',
      token: createToken(),
      accessCode: createAccessCode(),
      accessCodeUpdatedAt: nowIso(),
      completed: false,
      completedAt: null,
      createdAt: nowIso(),
    },
    {
      id: createId(),
      label: '2 Room',
      token: createToken(),
      accessCode: createAccessCode(),
      accessCodeUpdatedAt: nowIso(),
      completed: false,
      completedAt: null,
      createdAt: nowIso(),
    },
  ];
}

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Sqlite(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  access_code TEXT,
  access_code_updated_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carts (
  zone_id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_label TEXT NOT NULL,
  zone_token TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  total REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  menu_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_history (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_label TEXT NOT NULL,
  zone_token TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  total REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  checkout_at TEXT
);

CREATE TABLE IF NOT EXISTS order_history_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  menu_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  archived_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zone_sessions (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_zones_token ON zones(token);
CREATE INDEX IF NOT EXISTS idx_orders_zone_id ON orders(zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_zone_id ON order_history(zone_id);
CREATE INDEX IF NOT EXISTS idx_order_history_created_at ON order_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_zone_sessions_zone_id ON zone_sessions(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_sessions_token ON zone_sessions(session_token);
`);

function hasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((col) => col.name === columnName);
}

if (!hasColumn('zones', 'access_code')) {
  db.exec('ALTER TABLE zones ADD COLUMN access_code TEXT');
}
if (!hasColumn('zones', 'access_code_updated_at')) {
  db.exec('ALTER TABLE zones ADD COLUMN access_code_updated_at TEXT');
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings(key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), nowIso());
}

function normalizeCategoryName(value) {
  return sanitizeText(value, 40);
}

function getAllCategories() {
  return db
    .prepare('SELECT id, name, created_at FROM categories ORDER BY name COLLATE NOCASE ASC')
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    }));
}

function getCategoryNameSet() {
  return new Set(getAllCategories().map((category) => category.name));
}

function normalizeMenu(inputMenu) {
  if (!Array.isArray(inputMenu)) return [];

  const result = [];
  for (const raw of inputMenu) {
    const name = sanitizeText(raw?.name, 80);
    if (!name) continue;

    const price = Number(raw?.price);
    if (!Number.isFinite(price) || price < 0 || price > 99999) continue;

    result.push({
      id: raw?.id && typeof raw.id === 'string' ? raw.id : createId(),
      name,
      price: round2(price),
      description: sanitizeText(raw?.description, 240),
      category: sanitizeText(raw?.category, 40) || 'Uncategorized',
      available: raw?.available !== false,
    });
  }

  return result;
}

function parseCartItems(itemsJson) {
  const parsed = safeJsonParse(itemsJson, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const clean = {};
  for (const [menuId, quantity] of Object.entries(parsed)) {
    const qty = Number(quantity);
    if (!menuId || !Number.isInteger(qty) || qty < 1 || qty > 99) continue;
    clean[menuId] = qty;
  }
  return clean;
}

function buildCartResponseFromRow(cartRow) {
  if (!cartRow) {
    return { items: {}, note: '', updatedAt: nowIso() };
  }
  return {
    items: parseCartItems(cartRow.items_json),
    note: typeof cartRow.note === 'string' ? cartRow.note : '',
    updatedAt: cartRow.updated_at || nowIso(),
  };
}

function ensureZoneCart(zoneId) {
  db.prepare(`
    INSERT OR IGNORE INTO carts(zone_id, items_json, note, updated_at)
    VALUES (?, '{}', '', ?)
  `).run(zoneId, nowIso());
}

function getZoneCart(zoneId) {
  ensureZoneCart(zoneId);
  const row = db.prepare('SELECT * FROM carts WHERE zone_id = ?').get(zoneId);
  return buildCartResponseFromRow(row);
}

function saveZoneCart(zoneId, cart) {
  const safeItems = parseCartItems(JSON.stringify(cart.items || {}));
  const note = sanitizeText(cart.note || '', 240);
  db.prepare(`
    INSERT INTO carts(zone_id, items_json, note, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(zone_id) DO UPDATE SET
      items_json = excluded.items_json,
      note = excluded.note,
      updated_at = excluded.updated_at
  `).run(zoneId, JSON.stringify(safeItems), note, nowIso());
}

function clearZoneCart(zoneId) {
  db.prepare(`
    INSERT INTO carts(zone_id, items_json, note, updated_at)
    VALUES (?, '{}', '', ?)
    ON CONFLICT(zone_id) DO UPDATE SET
      items_json = '{}',
      note = '',
      updated_at = excluded.updated_at
  `).run(zoneId, nowIso());
}

function getZoneByToken(token) {
  return db.prepare('SELECT * FROM zones WHERE token = ?').get(token);
}

function getZoneById(zoneId) {
  return db.prepare('SELECT * FROM zones WHERE id = ?').get(zoneId);
}

function setZoneCompleted(zoneId, completed) {
  db.prepare(`
    UPDATE zones
    SET completed = ?, completed_at = ?
    WHERE id = ?
  `).run(completed ? 1 : 0, completed ? nowIso() : null, zoneId);
}

function ensureZoneAccessCode(zoneId) {
  const zone = getZoneById(zoneId);
  if (!zone) return;
  if (zone.access_code && String(zone.access_code).trim()) return;
  db.prepare('UPDATE zones SET access_code = ?, access_code_updated_at = ? WHERE id = ?')
    .run(createAccessCode(), nowIso(), zoneId);
}

function rotateZoneAccessCode(zoneId) {
  const nextCode = createAccessCode();
  const updatedAt = nowIso();
  db.prepare('UPDATE zones SET access_code = ?, access_code_updated_at = ? WHERE id = ?')
    .run(nextCode, updatedAt, zoneId);
  return { accessCode: nextCode, accessCodeUpdatedAt: updatedAt };
}

function revokeZoneSessions(zoneId) {
  db.prepare('UPDATE zone_sessions SET revoked_at = ? WHERE zone_id = ? AND revoked_at IS NULL')
    .run(nowIso(), zoneId);
}

function createZoneSession(zoneId) {
  const createdAt = nowIso();
  const expiresAt = minutesFromNow(ZONE_SESSION_TTL_MINUTES);
  const sessionToken = createSessionToken();
  const id = createId();

  db.prepare(`
    INSERT INTO zone_sessions(id, zone_id, session_token, created_at, last_seen_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(id, zoneId, sessionToken, createdAt, createdAt, expiresAt);

  return { id, sessionToken, expiresAt };
}

function findValidZoneSession(zoneId, sessionToken) {
  const token = sanitizeText(sessionToken, 120);
  if (!token) return { ok: false, reason: 'missing' };

  const row = db.prepare(`
    SELECT id, zone_id, session_token, created_at, last_seen_at, expires_at, revoked_at
    FROM zone_sessions
    WHERE zone_id = ? AND session_token = ?
    LIMIT 1
  `).get(zoneId, token);

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, session: row };
}

function touchZoneSession(sessionId) {
  const touchedAt = nowIso();
  const expiresAt = minutesFromNow(ZONE_SESSION_TTL_MINUTES);
  db.prepare('UPDATE zone_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
    .run(touchedAt, expiresAt, sessionId);
  return expiresAt;
}

function validateZoneAccessCode(zone, accessCode) {
  const code = sanitizeText(accessCode, 20);
  const expected = sanitizeText(zone?.access_code, 20);
  if (!expected) return true;
  return code && code === expected;
}

const archiveAndClearZoneOrdersTx = db.transaction((zoneId, checkoutAt) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE zone_id = ? ORDER BY datetime(created_at) DESC')
    .all(zoneId);

  let clearedOrders = 0;
  for (const order of orders) {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const archivedAt = nowIso();

    db.prepare(`
      INSERT OR REPLACE INTO order_history(
        id, zone_id, zone_label, zone_token, note, total, status,
        created_at, updated_at, archived_at, checkout_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order.id,
      order.zone_id,
      order.zone_label,
      order.zone_token,
      order.note || '',
      round2(order.total),
      order.status,
      order.created_at,
      order.updated_at,
      archivedAt,
      checkoutAt || null,
    );

    const insertHistoryItemStmt = db.prepare(`
      INSERT INTO order_history_items(
        order_id, menu_id, name, price, quantity, subtotal, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      insertHistoryItemStmt.run(
        order.id,
        item.menu_id,
        item.name,
        round2(item.price),
        Number(item.quantity),
        round2(item.subtotal),
        archivedAt,
      );
    }

    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(order.id);
    clearedOrders += 1;
  }

  return clearedOrders;
});

function getActiveMenu() {
  return db
    .prepare('SELECT id, name, price, description, category, available FROM menu WHERE available = 1 ORDER BY category, name')
    .all()
    .map((row) => ({
      ...row,
      available: row.available === 1,
      price: round2(row.price),
    }));
}

function getAllMenu() {
  return db
    .prepare('SELECT id, name, price, description, category, available FROM menu ORDER BY category, name')
    .all()
    .map((row) => ({
      ...row,
      available: row.available === 1,
      price: round2(row.price),
    }));
}

function getZoneList(baseUrl) {
  const zones = db
    .prepare(`
      SELECT
        z.id,
        z.label,
        z.token,
        z.access_code,
        z.access_code_updated_at,
        z.completed,
        z.completed_at,
        z.created_at,
        COALESCE(stats.active_order_count, 0) AS active_order_count,
        COALESCE(stats.active_order_total, 0) AS active_order_total
      FROM zones z
      LEFT JOIN (
        SELECT zone_id, COUNT(*) AS active_order_count, SUM(total) AS active_order_total
        FROM orders
        GROUP BY zone_id
      ) stats ON stats.zone_id = z.id
      ORDER BY z.created_at ASC
    `)
    .all();

  return zones.map((zone) => ({
    id: zone.id,
    label: zone.label,
    token: zone.token,
    accessCode: zone.access_code || '',
    accessCodeUpdatedAt: zone.access_code_updated_at || null,
    completed: zone.completed === 1,
    completedAt: zone.completed_at || null,
    createdAt: zone.created_at,
    activeOrderCount: Number(zone.active_order_count || 0),
    activeOrderTotal: round2(zone.active_order_total || 0),
    accessUrl: `${baseUrl}/o/${zone.token}`,
    qrPngUrl: `${baseUrl}/api/admin/zones/${zone.id}/qrcode?format=png`,
    qrSvgUrl: `${baseUrl}/api/admin/zones/${zone.id}/qrcode?format=svg`,
  }));
}

function getOrderWithItems({ history = false, status = '' } = {}) {
  const tableName = history ? 'order_history' : 'orders';
  const itemsTable = history ? 'order_history_items' : 'order_items';

  const orderSql = status
    ? `SELECT * FROM ${tableName} WHERE status = ? ORDER BY datetime(created_at) DESC`
    : `SELECT * FROM ${tableName} ORDER BY datetime(created_at) DESC`;

  const orders = status ? db.prepare(orderSql).all(status) : db.prepare(orderSql).all();
  if (!orders.length) return [];

  const getItemsStmt = db.prepare(`
    SELECT order_id, menu_id, name, price, quantity, subtotal
    FROM ${itemsTable}
    WHERE order_id = ?
    ORDER BY id ASC
  `);

  return orders.map((order) => ({
    id: order.id,
    zoneId: order.zone_id,
    zoneLabel: order.zone_label,
    zoneToken: order.zone_token,
    items: getItemsStmt.all(order.id).map((item) => ({
      menuId: item.menu_id,
      name: item.name,
      price: round2(item.price),
      quantity: Number(item.quantity),
      subtotal: round2(item.subtotal),
    })),
    note: order.note || '',
    total: round2(order.total),
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    archivedAt: history ? order.archived_at : undefined,
    checkoutAt: history ? order.checkout_at : undefined,
  }));
}

function resolveBaseUrl(req) {
  if (PUBLIC_BASE_URL && typeof PUBLIC_BASE_URL === 'string') {
    return PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

function maybeMigrateFromLegacyJson() {
  const hasData = db
    .prepare('SELECT (SELECT COUNT(*) FROM menu) + (SELECT COUNT(*) FROM zones) + (SELECT COUNT(*) FROM orders) AS total')
    .get();
  if (Number(hasData.total || 0) > 0) {
    return false;
  }

  if (!fs.existsSync(LEGACY_JSON_PATH)) {
    return false;
  }

  const raw = fs.readFileSync(LEGACY_JSON_PATH, 'utf-8');
  const parsed = safeJsonParse(raw, null);
  if (!parsed || typeof parsed !== 'object') {
    console.warn('[DB] legacy json exists but parse failed, skip migration');
    return false;
  }

  const migrateTx = db.transaction((legacy) => {
    const settings = legacy.settings && typeof legacy.settings === 'object' ? legacy.settings : {};
    setSetting('venue_name', settings.venueName || 'Universal Order System');
    setSetting('privacy_mode', settings.privacyMode === false ? 'false' : 'true');

    const legacyMenu = normalizeMenu(legacy.menu);
    const categoryNames = [...new Set(legacyMenu.map((item) => normalizeCategoryName(item.category)).filter(Boolean))];
    const insertCategoryStmt = db.prepare(`
      INSERT OR IGNORE INTO categories(id, name, created_at)
      VALUES (?, ?, ?)
    `);
    for (const categoryName of categoryNames) {
      insertCategoryStmt.run(createId(), categoryName, nowIso());
    }

    const insertMenuStmt = db.prepare(`
      INSERT OR REPLACE INTO menu(id, name, price, description, category, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of legacyMenu) {
      insertMenuStmt.run(
        item.id,
        item.name,
        round2(item.price),
        item.description || '',
        item.category || 'Uncategorized',
        item.available ? 1 : 0,
        nowIso(),
        nowIso(),
      );
    }

    const insertZoneStmt = db.prepare(`
      INSERT OR REPLACE INTO zones(
        id, label, token, access_code, access_code_updated_at, completed, completed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const rawZones = Array.isArray(legacy.zones) ? legacy.zones : [];
    for (const zone of rawZones) {
      const zoneId = typeof zone?.id === 'string' ? zone.id : createId();
      const label = sanitizeText(zone?.label, 80) || `Table ${zoneId.slice(0, 4)}`;
      const token = sanitizeText(zone?.token, 100) || createToken();
      const accessCode = sanitizeText(zone?.accessCode, 20) || createAccessCode();
      const accessCodeUpdatedAt = typeof zone?.accessCodeUpdatedAt === 'string' ? zone.accessCodeUpdatedAt : nowIso();
      const completed = zone?.completed === true ? 1 : 0;
      const completedAt = typeof zone?.completedAt === 'string' ? zone.completedAt : null;
      const createdAt = typeof zone?.createdAt === 'string' ? zone.createdAt : nowIso();
      insertZoneStmt.run(
        zoneId,
        label,
        token,
        accessCode,
        accessCodeUpdatedAt,
        completed,
        completedAt,
        createdAt,
      );

      const legacyCart = legacy.carts && legacy.carts[zoneId] ? legacy.carts[zoneId] : null;
      const items = legacyCart?.items && typeof legacyCart.items === 'object' ? legacyCart.items : {};
      const note = sanitizeText(legacyCart?.note || '', 240);
      db.prepare(`
        INSERT OR REPLACE INTO carts(zone_id, items_json, note, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(zoneId, JSON.stringify(parseCartItems(JSON.stringify(items))), note, nowIso());
    }

    const insertOrderStmt = db.prepare(`
      INSERT OR REPLACE INTO orders(
        id, zone_id, zone_label, zone_token, note, total, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItemStmt = db.prepare(`
      INSERT INTO order_items(order_id, menu_id, name, price, quantity, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const rawOrders = Array.isArray(legacy.orders) ? legacy.orders : [];
    for (const order of rawOrders) {
      const orderId = typeof order?.id === 'string' ? order.id : createId();
      const zoneId = sanitizeText(order?.zoneId, 100);
      const zone = zoneId ? getZoneById(zoneId) : null;
      if (!zone) continue;

      const status = ORDER_STATUSES.includes(order?.status) ? order.status : 'new';
      const createdAt = typeof order?.createdAt === 'string' ? order.createdAt : nowIso();
      const updatedAt = typeof order?.updatedAt === 'string' ? order.updatedAt : createdAt;

      insertOrderStmt.run(
        orderId,
        zone.id,
        sanitizeText(order?.zoneLabel, 80) || zone.label,
        sanitizeText(order?.zoneToken, 120) || zone.token,
        sanitizeText(order?.note, 240),
        round2(order?.total || 0),
        status,
        createdAt,
        updatedAt,
      );

      const rawItems = Array.isArray(order?.items) ? order.items : [];
      for (const item of rawItems) {
        const quantity = Number(item?.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue;

        const price = Number(item?.price);
        if (!Number.isFinite(price) || price < 0) continue;

        insertItemStmt.run(
          orderId,
          sanitizeText(item?.menuId, 100),
          sanitizeText(item?.name, 120) || 'Unnamed item',
          round2(price),
          quantity,
          round2(item?.subtotal || price * quantity),
        );
      }
    }
  });

  try {
    migrateTx(parsed);
    console.log('[DB] migrated legacy JSON -> SQLite');
    return true;
  } catch (error) {
    console.error('[DB] migration failed:', error);
    return false;
  }
}

function seedDefaultsIfNeeded() {
  const categoryCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  const menuCount = db.prepare('SELECT COUNT(*) AS count FROM menu').get().count;
  const zoneCount = db.prepare('SELECT COUNT(*) AS count FROM zones').get().count;

  if (categoryCount === 0) {
    const insertCategoryStmt = db.prepare(`
      INSERT INTO categories(id, name, created_at)
      VALUES (?, ?, ?)
    `);
    const categories = [...new Set(defaultMenu().map((item) => normalizeCategoryName(item.category)).filter(Boolean))];
    const createdAt = nowIso();
    for (const categoryName of categories) {
      insertCategoryStmt.run(createId(), categoryName, createdAt);
    }
  }

  if (menuCount === 0) {
    const insertMenuStmt = db.prepare(`
      INSERT INTO menu(id, name, price, description, category, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = nowIso();
    for (const item of defaultMenu()) {
      insertMenuStmt.run(
        item.id,
        item.name,
        round2(item.price),
        item.description,
        item.category,
        item.available ? 1 : 0,
        now,
        now,
      );
    }
  }

  if (zoneCount === 0) {
    const insertZoneStmt = db.prepare(`
      INSERT INTO zones(
        id, label, token, access_code, access_code_updated_at, completed, completed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const zone of defaultZones()) {
      insertZoneStmt.run(
        zone.id,
        zone.label,
        zone.token,
        zone.accessCode,
        zone.accessCodeUpdatedAt,
        zone.completed ? 1 : 0,
        zone.completedAt,
        zone.createdAt,
      );
      ensureZoneCart(zone.id);
    }
  }

  if (!getSetting('venue_name')) {
    setSetting('venue_name', 'Universal Order System');
  }
  if (!getSetting('privacy_mode')) {
    setSetting('privacy_mode', 'true');
  }
}

function backfillCategoriesFromMenu() {
  const menuCategories = db
    .prepare("SELECT DISTINCT category FROM menu WHERE TRIM(category) != ''")
    .all()
    .map((row) => normalizeCategoryName(row.category))
    .filter(Boolean);
  if (!menuCategories.length) return;

  const existing = getCategoryNameSet();
  const insertCategoryStmt = db.prepare(`
    INSERT INTO categories(id, name, created_at)
    VALUES (?, ?, ?)
  `);
  for (const categoryName of menuCategories) {
    if (existing.has(categoryName)) continue;
    insertCategoryStmt.run(createId(), categoryName, nowIso());
    existing.add(categoryName);
  }
}

function backfillZoneAccessCodes() {
  const rows = db.prepare(`
    SELECT id
    FROM zones
    WHERE access_code IS NULL OR TRIM(access_code) = ''
  `).all();

  if (!rows.length) return;
  for (const row of rows) {
    ensureZoneAccessCode(row.id);
  }
}

maybeMigrateFromLegacyJson();
seedDefaultsIfNeeded();
backfillCategoriesFromMenu();
backfillZoneAccessCodes();

app.use(express.json({ limit: '1mb' }));

if (DEBUG_REQUESTS) {
  app.use((req, res, next) => {
    const started = Date.now();
    const requestId = Math.random().toString(16).slice(2, 8);
    console.log(`[REQ ${requestId}] ${req.method} ${req.originalUrl}`);

    res.on('finish', () => {
      const ms = Date.now() - started;
      const contentType = res.getHeader('content-type') || '-';
      console.log(`[RES ${requestId}] ${res.statusCode} ${req.method} ${req.originalUrl} ${ms}ms ct=${contentType}`);
    });

    next();
  });
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'self';",
  );

  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
});

app.use('/style', express.static(path.join(__dirname, 'style')));
app.use('/front_user', express.static(path.join(__dirname, 'front_user')));
app.use('/front_admin', express.static(path.join(__dirname, 'front_admin')));
app.use('/admin_manage', express.static(path.join(__dirname, 'admin_manage')));

app.get('/', (req, res) => {
  res.redirect('/front_user/index.html');
});

app.get('/admin', (req, res) => {
  res.redirect('/front_admin/index.html');
});

app.get('/manage', (req, res) => {
  res.redirect('/admin_manage/index.html');
});

app.get('/o/:token', (req, res) => {
  const token = encodeURIComponent(req.params.token || '');
  res.redirect(`/front_user/index.html?token=${token}`);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: nowIso(), db: 'sqlite3' });
});

function sessionRequiredResponse(res, message = 'Session expired. Please verify access code again.') {
  return res.status(403).json({
    error: message,
    code: 'SESSION_REQUIRED',
    requiresAccessCode: true,
  });
}

function requireZoneSession(req, res, zone) {
  if (!ZONE_ACCESS_CODE_REQUIRED) {
    return { ok: true, sessionToken: '' };
  }

  const sessionToken = req.get(SESSION_HEADER_NAME) || '';
  const result = findValidZoneSession(zone.id, sessionToken);
  if (!result.ok) {
    const message = result.reason === 'expired'
      ? 'Session expired. Please verify access code again.'
      : 'Missing or invalid session. Please verify access code.';
    sessionRequiredResponse(res, message);
    return { ok: false };
  }

  const expiresAt = touchZoneSession(result.session.id);
  return { ok: true, sessionToken: result.session.session_token, expiresAt };
}

app.post('/api/public/session/open', (req, res) => {
  const token = sanitizeText(req.body?.token, 100);
  const accessCode = sanitizeText(req.body?.accessCode, 20);

  if (!token) {
    return res.status(400).json({ error: 'Missing token.' });
  }

  const zone = getZoneByToken(token);
  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or expired.' });
  }

  if (ZONE_ACCESS_CODE_REQUIRED && !validateZoneAccessCode(zone, accessCode)) {
    return res.status(403).json({
      error: 'Invalid access code. Please use the code provided in store.',
      code: 'ACCESS_CODE_INVALID',
      requiresAccessCode: true,
    });
  }

  const session = createZoneSession(zone.id);
  return res.status(201).json({
    ok: true,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
    ttlMinutes: ZONE_SESSION_TTL_MINUTES,
    zone: {
      id: zone.id,
      label: zone.label,
      token: zone.token,
    },
    cart: getZoneCart(zone.id),
  });
});

app.get('/api/public/context/:token', (req, res) => {
  const token = sanitizeText(req.params.token, 100);
  const zone = getZoneByToken(token);

  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or expired.' });
  }

  const venueName = getSetting('venue_name') || 'Universal Order System';
  let cart = getZoneCart(zone.id);
  let session = null;
  if (ZONE_ACCESS_CODE_REQUIRED) {
    const sessionToken = req.get(SESSION_HEADER_NAME) || '';
    const check = findValidZoneSession(zone.id, sessionToken);
    if (check.ok) {
      const expiresAt = touchZoneSession(check.session.id);
      session = { token: check.session.session_token, expiresAt };
    } else {
      cart = { items: {}, note: '', updatedAt: nowIso() };
    }
  }

  return res.json({
    venueName,
    accessCodeRequired: ZONE_ACCESS_CODE_REQUIRED,
    zone: {
      id: zone.id,
      label: zone.label,
      token: zone.token,
    },
    menu: getActiveMenu(),
    cart,
    session,
  });
});

app.get('/api/public/cart/:token', (req, res) => {
  const token = sanitizeText(req.params.token, 100);
  const zone = getZoneByToken(token);

  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or expired.' });
  }
  const sessionCheck = requireZoneSession(req, res, zone);
  if (!sessionCheck.ok) return;

  const cart = getZoneCart(zone.id);
  return res.json({
    zoneId: zone.id,
    zoneLabel: zone.label,
    cart,
    session: {
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
    },
  });
});

app.post('/api/public/cart/:token/items', (req, res) => {
  const token = sanitizeText(req.params.token, 100);
  const menuId = sanitizeText(req.body?.menuId, 100);
  const delta = Number(req.body?.delta);

  if (!menuId || !Number.isInteger(delta) || ![-1, 1].includes(delta)) {
    return res.status(400).json({ error: 'Invalid delta. Only +1 or -1 is supported.' });
  }

  const zone = getZoneByToken(token);
  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or not configured.' });
  }
  const sessionCheck = requireZoneSession(req, res, zone);
  if (!sessionCheck.ok) return;

  const menuItem = db.prepare('SELECT id FROM menu WHERE id = ? AND available = 1').get(menuId);
  if (!menuItem) {
    return res.status(400).json({ error: 'Menu item does not exist or is unavailable.' });
  }

  const cart = getZoneCart(zone.id);
  const current = Number(cart.items[menuId] || 0);
  const next = Math.max(0, Math.min(99, current + delta));

  if (next === 0) {
    delete cart.items[menuId];
  } else {
    cart.items[menuId] = next;
    setZoneCompleted(zone.id, false);
  }

  saveZoneCart(zone.id, cart);

  return res.json({
    ok: true,
    cart: getZoneCart(zone.id),
    session: {
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
    },
  });
});

app.put('/api/public/cart/:token/note', (req, res) => {
  const token = sanitizeText(req.params.token, 100);
  const note = sanitizeText(req.body?.note, 240);

  const zone = getZoneByToken(token);
  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or not configured.' });
  }
  const sessionCheck = requireZoneSession(req, res, zone);
  if (!sessionCheck.ok) return;

  const cart = getZoneCart(zone.id);
  cart.note = note;
  saveZoneCart(zone.id, cart);

  return res.json({
    ok: true,
    cart: getZoneCart(zone.id),
    session: {
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
    },
  });
});

app.post('/api/public/orders', (req, res) => {
  const token = sanitizeText(req.body?.token, 100);
  const incomingItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const incomingNote = sanitizeText(req.body?.note, 240);
  const useSharedCart = req.body?.useSharedCart !== false;

  if (!token) {
    return res.status(400).json({ error: 'Missing token.' });
  }

  const zone = getZoneByToken(token);
  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or not configured.' });
  }
  const sessionCheck = requireZoneSession(req, res, zone);
  if (!sessionCheck.ok) return;

  const publicMenu = getActiveMenu();
  const menuMap = new Map(publicMenu.map((item) => [item.id, item]));
  const zoneCart = getZoneCart(zone.id);

  const sourceItems = useSharedCart
    ? Object.entries(zoneCart.items).map(([menuId, quantity]) => ({ menuId, quantity }))
    : incomingItems;

  const normalizedItems = [];
  for (const raw of sourceItems) {
    const menuId = sanitizeText(raw?.menuId, 100);
    const quantity = Number(raw?.quantity);
    if (!menuId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue;

    const menuItem = menuMap.get(menuId);
    if (!menuItem) continue;

    normalizedItems.push({
      menuId: menuItem.id,
      name: menuItem.name,
      price: round2(menuItem.price),
      quantity,
      subtotal: round2(menuItem.price * quantity),
    });
  }

  if (!normalizedItems.length) {
    return res.status(400).json({ error: 'Please choose at least one valid item.' });
  }

  const total = round2(normalizedItems.reduce((sum, item) => sum + item.subtotal, 0));
  const orderId = createId();
  const finalNote = incomingNote || zoneCart.note || '';
  const createdAt = nowIso();

  const createOrderTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO orders(
        id, zone_id, zone_label, zone_token, note, total, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      zone.id,
      zone.label,
      zone.token,
      finalNote,
      total,
      'new',
      createdAt,
      createdAt,
    );

    const insertOrderItemStmt = db.prepare(`
      INSERT INTO order_items(order_id, menu_id, name, price, quantity, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const item of normalizedItems) {
      insertOrderItemStmt.run(
        orderId,
        item.menuId,
        item.name,
        item.price,
        item.quantity,
        item.subtotal,
      );
    }

    setZoneCompleted(zone.id, false);
    clearZoneCart(zone.id);
  });

  createOrderTx();

  return res.status(201).json({
    ok: true,
    orderId,
    zoneLabel: zone.label,
    status: 'new',
    session: {
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
    },
  });
});

app.get('/api/admin/menu', (req, res) => {
  const venueName = getSetting('venue_name') || 'Universal Order System';
  return res.json({ menu: getAllMenu(), categories: getAllCategories(), venueName });
});

app.put('/api/admin/menu', (req, res) => {
  const nextMenu = normalizeMenu(req.body?.menu);
  const categorySet = getCategoryNameSet();
  if (!categorySet.size) {
    return res.status(400).json({ error: 'Please create at least one category before saving menu.' });
  }

  for (const item of nextMenu) {
    const category = normalizeCategoryName(item.category);
    if (!category || !categorySet.has(category)) {
      return res.status(400).json({
        error: `Menu item "${item.name}" has invalid category "${item.category}". Please choose a created category.`,
      });
    }
    item.category = category;
  }

  const now = nowIso();

  const replaceMenuTx = db.transaction(() => {
    db.prepare('DELETE FROM menu').run();

    const insertMenuStmt = db.prepare(`
      INSERT INTO menu(id, name, price, description, category, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of nextMenu) {
      insertMenuStmt.run(
        item.id,
        item.name,
        round2(item.price),
        item.description || '',
        item.category || 'Uncategorized',
        item.available ? 1 : 0,
        now,
        now,
      );
    }
  });

  replaceMenuTx();
  return res.json({ ok: true, menu: getAllMenu(), categories: getAllCategories() });
});

app.get('/api/admin/categories', (req, res) => {
  return res.json({ categories: getAllCategories() });
});

app.post('/api/admin/categories', (req, res) => {
  const name = normalizeCategoryName(req.body?.name);
  if (!name) {
    return res.status(400).json({ error: 'Category name cannot be empty.' });
  }

  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (existing) {
    return res.status(409).json({ error: `Category already exists: ${name}` });
  }

  const category = { id: createId(), name, createdAt: nowIso() };
  db.prepare('INSERT INTO categories(id, name, created_at) VALUES (?, ?, ?)').run(
    category.id,
    category.name,
    category.createdAt,
  );

  return res.status(201).json({ ok: true, category, categories: getAllCategories() });
});

app.delete('/api/admin/categories/:id', (req, res) => {
  const categoryId = sanitizeText(req.params.id, 100);
  const category = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(categoryId);
  if (!category) {
    return res.status(404).json({ error: 'Category not found.' });
  }

  const usingCount = db.prepare('SELECT COUNT(*) AS count FROM menu WHERE category = ?').get(category.name).count;
  if (Number(usingCount) > 0) {
    return res.status(409).json({ error: `Category "${category.name}" is in use by menu items.` });
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
  return res.json({ ok: true, categories: getAllCategories() });
});

app.get('/api/admin/zones', (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  return res.json({ zones: getZoneList(baseUrl) });
});

app.post('/api/admin/zones', (req, res) => {
  const label = sanitizeText(req.body?.label, 80) || `Table ${Date.now().toString().slice(-4)}`;

  const existing = db.prepare('SELECT id FROM zones WHERE label = ?').get(label);
  if (existing) {
    return res.status(409).json({ error: `Zone label already exists: ${label}` });
  }

  const zone = {
    id: createId(),
    label,
    token: createToken(),
    accessCode: createAccessCode(),
    accessCodeUpdatedAt: nowIso(),
    completed: false,
    completedAt: null,
    createdAt: nowIso(),
  };

  db.prepare(`
    INSERT INTO zones(
      id, label, token, access_code, access_code_updated_at, completed, completed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(zone.id, zone.label, zone.token, zone.accessCode, zone.accessCodeUpdatedAt, 0, null, zone.createdAt);

  ensureZoneCart(zone.id);
  return res.status(201).json({ ok: true, zone });
});

app.put('/api/admin/zones/:id', (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const label = sanitizeText(req.body?.label, 80);
  if (!label) {
    return res.status(400).json({ error: 'Label cannot be empty.' });
  }

  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }

  const duplicate = db.prepare('SELECT id FROM zones WHERE label = ? AND id != ?').get(label, zoneId);
  if (duplicate) {
    return res.status(409).json({ error: `Zone label already exists: ${label}` });
  }

  db.prepare('UPDATE zones SET label = ? WHERE id = ?').run(label, zoneId);
  const updated = getZoneById(zoneId);
  return res.json({
    ok: true,
    zone: {
      id: updated.id,
      label: updated.label,
      token: updated.token,
      accessCode: updated.access_code || '',
      accessCodeUpdatedAt: updated.access_code_updated_at || null,
      completed: updated.completed === 1,
      completedAt: updated.completed_at || null,
      createdAt: updated.created_at,
    },
  });
});

app.post('/api/admin/zones/:id/regenerate', (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const zone = getZoneById(zoneId);

  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }

  const nextToken = createToken();
  revokeZoneSessions(zoneId);
  const nextCode = createAccessCode();
  const codeUpdatedAt = nowIso();
  db.prepare('UPDATE zones SET token = ?, access_code = ?, access_code_updated_at = ? WHERE id = ?')
    .run(nextToken, nextCode, codeUpdatedAt, zoneId);

  const updated = getZoneById(zoneId);

  return res.json({
    ok: true,
    zone: {
      id: updated.id,
      label: updated.label,
      token: updated.token,
      accessCode: updated.access_code || '',
      accessCodeUpdatedAt: updated.access_code_updated_at || null,
      completed: updated.completed === 1,
      completedAt: updated.completed_at || null,
      createdAt: updated.created_at,
    },
  });
});

app.patch('/api/admin/zones/:id/completion', (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const completed = req.body?.completed === true;

  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }

  setZoneCompleted(zoneId, completed);

  const updated = getZoneById(zoneId);
  return res.json({
    ok: true,
    zone: {
      id: updated.id,
      label: updated.label,
      token: updated.token,
      completed: updated.completed === 1,
      completedAt: updated.completed_at || null,
      createdAt: updated.created_at,
    },
  });
});

app.post('/api/admin/zones/:id/checkout', (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }

  const checkoutAt = nowIso();
  const clearedOrders = archiveAndClearZoneOrdersTx(zoneId, checkoutAt);
  clearZoneCart(zoneId);
  setZoneCompleted(zoneId, true);
  revokeZoneSessions(zoneId);
  if (ROTATE_ACCESS_CODE_ON_CHECKOUT) {
    rotateZoneAccessCode(zoneId);
  }

  const updated = getZoneById(zoneId);
  return res.json({
    ok: true,
    clearedOrders,
    zone: {
      id: updated.id,
      label: updated.label,
      token: updated.token,
      accessCode: updated.access_code || '',
      accessCodeUpdatedAt: updated.access_code_updated_at || null,
      completed: updated.completed === 1,
      completedAt: updated.completed_at || null,
      createdAt: updated.created_at,
    },
  });
});

app.post('/api/admin/zones/:id/access-code/rotate', (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }

  const rotated = rotateZoneAccessCode(zoneId);
  revokeZoneSessions(zoneId);
  const updated = getZoneById(zoneId);
  return res.json({
    ok: true,
    zone: {
      id: updated.id,
      label: updated.label,
      token: updated.token,
      accessCode: updated.access_code || rotated.accessCode,
      accessCodeUpdatedAt: updated.access_code_updated_at || rotated.accessCodeUpdatedAt,
      completed: updated.completed === 1,
      completedAt: updated.completed_at || null,
      createdAt: updated.created_at,
    },
  });
});

app.delete('/api/admin/zones/:id', (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }

  archiveAndClearZoneOrdersTx(zoneId, nowIso());
  clearZoneCart(zoneId);
  revokeZoneSessions(zoneId);
  db.prepare('DELETE FROM zones WHERE id = ?').run(zoneId);

  return res.json({ ok: true });
});

app.get('/api/admin/zones/:id/qrcode', async (req, res) => {
  try {
    const zoneId = sanitizeText(req.params.id, 100);
    const format = (req.query.format || 'png').toString().toLowerCase();
    const size = Math.min(800, Math.max(180, Number(req.query.size || 300)));

    const zone = getZoneById(zoneId);
    if (!zone) {
      return res.status(404).json({ error: 'Zone not found.' });
    }

    const accessUrl = `${resolveBaseUrl(req)}/o/${zone.token}`;

    if (format === 'svg') {
      const svg = await QRCode.toString(accessUrl, {
        type: 'svg',
        width: size,
        margin: 1,
      });
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      return res.send(svg);
    }

    const png = await QRCode.toBuffer(accessUrl, {
      type: 'png',
      width: size,
      margin: 1,
    });
    res.setHeader('Content-Type', 'image/png');
    return res.send(png);
  } catch (error) {
    console.error('[QR] generation failed:', error);
    return res.status(500).json({ error: 'QR generation failed.' });
  }
});

app.get('/api/admin/orders', (req, res) => {
  const status = sanitizeText(req.query.status, 40);
  if (status && !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  return res.json({
    orders: getOrderWithItems({ history: false, status }),
    statuses: ORDER_STATUSES,
  });
});

app.patch('/api/admin/orders/:id', (req, res) => {
  const orderId = sanitizeText(req.params.id, 100);
  const status = sanitizeText(req.body?.status, 40);

  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), orderId);
  const updatedOrder = getOrderWithItems({ history: false }).find((o) => o.id === orderId);

  return res.json({ ok: true, order: updatedOrder });
});

app.get('/api/admin/orders/history', (req, res) => {
  const limitRaw = Number(req.query.limit || 200);
  const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(2000, limitRaw)) : 200;

  const all = getOrderWithItems({ history: true });
  const history = all.slice(0, limit);
  return res.json({ history, count: history.length });
});

app.use('/api', (req, res) => {
  return res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error('[UNCAUGHT]', err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(500).json({ error: 'Internal server error', detail: err?.message || 'unknown' });
});

function startServer(port = PORT, host = HOST) {
  return app.listen(port, host, () => {
    console.log(`[order-system] running on http://${host}:${port}`);
    console.log(`[order-system] database     -> ${DB_PATH}`);
    if (PUBLIC_BASE_URL) {
      console.log(`[order-system] public base  -> ${PUBLIC_BASE_URL}`);
    }
    if (TRUST_PROXY_VALUE !== null) {
      console.log(`[order-system] trust proxy  -> ${String(TRUST_PROXY_VALUE)}`);
    }
    console.log(`[order-system] access code  -> ${ZONE_ACCESS_CODE_REQUIRED ? 'required' : 'disabled'}`);
    console.log(`[order-system] session ttl  -> ${ZONE_SESSION_TTL_MINUTES} minute(s)`);
    console.log('[order-system] user page    -> /front_user/index.html?token=<token>');
    console.log('[order-system] admin board  -> /front_admin/index.html');
    console.log('[order-system] admin manage -> /admin_manage/index.html');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
