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
const PUBLIC_CART_SESSION_ID = '__public__';
const EMPLOYEE_SESSION_HEADER_NAME = 'x-employee-session';
const EMPLOYEE_SESSION_TTL_MINUTES = envInt('EMPLOYEE_SESSION_TTL_MINUTES', 720, 30, 10080);
const CSP_ALLOW_INLINE_STYLE = process.env.CSP_ALLOW_INLINE_STYLE !== 'false';
const SQLITE_BUSY_TIMEOUT_MS = envInt('SQLITE_BUSY_TIMEOUT_MS', 5000, 100, 60000);
const WRITE_QUEUE_ENABLED = process.env.WRITE_QUEUE_ENABLED !== 'false';
const WRITE_QUEUE_MAX_SIZE = envInt('WRITE_QUEUE_MAX_SIZE', 2000, 10, 100000);

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

function ceil2(value) {
  return Math.ceil((Number(value) + Number.EPSILON) * 100) / 100;
}

const TAX_RATE = 0.13;
const SERVICE_RATE = 0.18;

function calculateOrderGrandTotal(items = []) {
  let subtotalAll = 0;
  let serviceAll = 0;
  let taxAll = 0;
  for (const item of items) {
    const subtotal = round2(Number(item?.subtotal) || 0);
    const service = round2(subtotal * SERVICE_RATE);
    const tax = ceil2((subtotal + service) * TAX_RATE);
    subtotalAll += subtotal;
    serviceAll += service;
    taxAll += tax;
  }
  return round2(round2(subtotalAll) + round2(serviceAll) + round2(taxAll));
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
db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const writeQueue = [];
let writeQueueRunning = false;
let writeQueueCurrent = null;
let writeQueueSeq = 0;
let writeQueueProcessed = 0;
let writeQueueFailed = 0;

function getWriteQueueInfo() {
  return {
    enabled: WRITE_QUEUE_ENABLED,
    busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
    maxSize: WRITE_QUEUE_MAX_SIZE,
    pending: writeQueue.length,
    processing: Boolean(writeQueueCurrent),
    current: writeQueueCurrent
      ? {
          ticket: writeQueueCurrent.ticket,
          task: writeQueueCurrent.task,
          queuedAt: new Date(writeQueueCurrent.queuedAt).toISOString(),
          startedAt: writeQueueCurrent.startedAt ? new Date(writeQueueCurrent.startedAt).toISOString() : null,
        }
      : null,
    stats: {
      processed: writeQueueProcessed,
      failed: writeQueueFailed,
    },
  };
}

function runWriteQueue() {
  if (writeQueueRunning) return;
  writeQueueRunning = true;

  const processNext = () => {
    if (!writeQueue.length) {
      writeQueueCurrent = null;
      writeQueueRunning = false;
      return;
    }

    const item = writeQueue.shift();
    writeQueueCurrent = item;
    writeQueueCurrent.startedAt = Date.now();

    Promise.resolve()
      .then(() => item.work())
      .then((result) => {
        writeQueueProcessed += 1;
        writeQueueCurrent = null;
        item.resolve(result);
        setImmediate(processNext);
      })
      .catch((error) => {
        writeQueueFailed += 1;
        writeQueueCurrent = null;
        item.reject(error);
        setImmediate(processNext);
      });
  };

  setImmediate(processNext);
}

function enqueueWrite(task, work) {
  if (!WRITE_QUEUE_ENABLED) {
    return Promise.resolve().then(work);
  }

  if (writeQueue.length >= WRITE_QUEUE_MAX_SIZE) {
    const error = new Error('写入请求过多，请稍后重试。');
    error.code = 'WRITE_QUEUE_FULL';
    throw error;
  }

  const ticket = ++writeQueueSeq;
  return new Promise((resolve, reject) => {
    writeQueue.push({
      ticket,
      task,
      queuedAt: Date.now(),
      startedAt: null,
      work,
      resolve,
      reject,
    });
    runWriteQueue();
  });
}

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  sort_index INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS session_carts (
  zone_id TEXT NOT NULL,
  zone_session_id TEXT NOT NULL,
  items_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(zone_id, zone_session_id),
  FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_label TEXT NOT NULL,
  zone_token TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
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
  served INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_history (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  zone_label TEXT NOT NULL,
  zone_token TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
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
  served INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zone_sessions (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_sessions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS zone_customer_settlements (
  zone_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  period_start_at TEXT NOT NULL,
  settled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by_employee_id TEXT NOT NULL DEFAULT '',
  updated_by_employee_username TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(zone_id, customer_name, period_start_at),
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
CREATE INDEX IF NOT EXISTS idx_session_carts_zone_id ON session_carts(zone_id);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee_id ON employee_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_token ON employee_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_zone_customer_settlements_zone_period ON zone_customer_settlements(zone_id, period_start_at);
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
if (!hasColumn('categories', 'sort_index')) {
  db.exec('ALTER TABLE categories ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('menu', 'sort_index')) {
  db.exec('ALTER TABLE menu ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('orders', 'customer_name')) {
  db.exec("ALTER TABLE orders ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''");
}
if (!hasColumn('order_history', 'customer_name')) {
  db.exec("ALTER TABLE order_history ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''");
}
if (!hasColumn('zone_sessions', 'customer_name')) {
  db.exec("ALTER TABLE zone_sessions ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''");
}
if (!hasColumn('orders', 'handled_by_employee_id')) {
  db.exec("ALTER TABLE orders ADD COLUMN handled_by_employee_id TEXT NOT NULL DEFAULT ''");
}
if (!hasColumn('orders', 'handled_by_employee_username')) {
  db.exec("ALTER TABLE orders ADD COLUMN handled_by_employee_username TEXT NOT NULL DEFAULT ''");
}
if (!hasColumn('order_history', 'handled_by_employee_id')) {
  db.exec("ALTER TABLE order_history ADD COLUMN handled_by_employee_id TEXT NOT NULL DEFAULT ''");
}
if (!hasColumn('order_history', 'handled_by_employee_username')) {
  db.exec("ALTER TABLE order_history ADD COLUMN handled_by_employee_username TEXT NOT NULL DEFAULT ''");
}
if (!hasColumn('order_items', 'served')) {
  db.exec('ALTER TABLE order_items ADD COLUMN served INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('order_history_items', 'served')) {
  db.exec('ALTER TABLE order_history_items ADD COLUMN served INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('employees', 'display_name')) {
  db.exec("ALTER TABLE employees ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
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
    .prepare('SELECT id, name, sort_index, created_at FROM categories ORDER BY sort_index ASC, datetime(created_at) ASC, name COLLATE NOCASE ASC')
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      sortIndex: Number(row.sort_index || 0),
      createdAt: row.created_at,
    }));
}

function getCategoryNameSet() {
  return new Set(getAllCategories().map((category) => category.name));
}

function nextCategorySortIndex() {
  const row = db.prepare('SELECT COALESCE(MAX(sort_index), -1) AS max_idx FROM categories').get();
  return Number(row?.max_idx ?? -1) + 1;
}

function nextMenuSortIndex() {
  const row = db.prepare('SELECT COALESCE(MAX(sort_index), -1) AS max_idx FROM menu').get();
  return Number(row?.max_idx ?? -1) + 1;
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
      sortIndex: Number.isInteger(Number(raw?.sortIndex)) ? Number(raw.sortIndex) : null,
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

function normalizeCartOwnerKey(cartOwnerKey) {
  const safe = sanitizeText(cartOwnerKey, 120);
  return safe || PUBLIC_CART_SESSION_ID;
}

function ensureSessionCart(zoneId, cartOwnerKey) {
  const ownerKey = normalizeCartOwnerKey(cartOwnerKey);
  db.prepare(`
    INSERT OR IGNORE INTO session_carts(zone_id, zone_session_id, items_json, note, updated_at)
    VALUES (?, ?, '{}', '', ?)
  `).run(zoneId, ownerKey, nowIso());
}

function getSessionCart(zoneId, cartOwnerKey) {
  const ownerKey = normalizeCartOwnerKey(cartOwnerKey);
  ensureSessionCart(zoneId, ownerKey);
  const row = db
    .prepare('SELECT * FROM session_carts WHERE zone_id = ? AND zone_session_id = ?')
    .get(zoneId, ownerKey);
  return buildCartResponseFromRow(row);
}

function saveSessionCart(zoneId, cartOwnerKey, cart) {
  const ownerKey = normalizeCartOwnerKey(cartOwnerKey);
  const safeItems = parseCartItems(JSON.stringify(cart.items || {}));
  const note = sanitizeText(cart.note || '', 240);
  db.prepare(`
    INSERT INTO session_carts(zone_id, zone_session_id, items_json, note, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(zone_id, zone_session_id) DO UPDATE SET
      items_json = excluded.items_json,
      note = excluded.note,
      updated_at = excluded.updated_at
  `).run(zoneId, ownerKey, JSON.stringify(safeItems), note, nowIso());
}

function clearSessionCart(zoneId, cartOwnerKey) {
  saveSessionCart(zoneId, cartOwnerKey, { items: {}, note: '' });
}

function clearAllZoneCarts(zoneId) {
  db.prepare('DELETE FROM session_carts WHERE zone_id = ?').run(zoneId);
  // Legacy safety: also clear old shared cart row if present.
  db.prepare('DELETE FROM carts WHERE zone_id = ?').run(zoneId);
}

function migrateLegacyZoneCartToPublic(zoneId) {
  const legacyRow = db.prepare('SELECT * FROM carts WHERE zone_id = ?').get(zoneId);
  if (!legacyRow) return;
  const legacy = buildCartResponseFromRow(legacyRow);
  const hasItems = Object.keys(legacy.items || {}).length > 0;
  if (!hasItems && !legacy.note) return;

  const existing = getSessionCart(zoneId, PUBLIC_CART_SESSION_ID);
  const existingHasItems = Object.keys(existing.items || {}).length > 0;
  if (existingHasItems || existing.note) return;
  saveSessionCart(zoneId, PUBLIC_CART_SESSION_ID, legacy);
}

function getRoomLiveCarts(zoneId) {
  const rows = db.prepare(`
    SELECT
      c.zone_session_id,
      c.items_json,
      c.note,
      c.updated_at,
      s.customer_name,
      s.expires_at,
      s.revoked_at
    FROM session_carts c
    LEFT JOIN zone_sessions s ON s.id = c.zone_session_id
    WHERE c.zone_id = ?
    ORDER BY datetime(c.updated_at) DESC
  `).all(zoneId);

  const nowMs = Date.now();
  const roomCarts = [];
  for (const row of rows) {
    const items = parseCartItems(row.items_json);
    const note = typeof row.note === 'string' ? row.note : '';
    const hasContent = Object.keys(items).length > 0 || Boolean(note);
    if (!hasContent) continue;

    const ownerId = sanitizeText(row.zone_session_id || '', 120);
    const isPublic = ownerId === PUBLIC_CART_SESSION_ID;
    const revoked = Boolean(row.revoked_at);
    const expired = row.expires_at ? (new Date(row.expires_at).getTime() <= nowMs) : false;
    if (!isPublic && (revoked || expired)) continue;

    const customerName = sanitizeText(row.customer_name || '', 40);
    roomCarts.push({
      ownerId,
      customerName: customerName || (isPublic ? 'Guest' : `Guest ${ownerId.slice(0, 4)}`),
      items,
      note,
      updatedAt: row.updated_at || nowIso(),
    });
  }

  return roomCarts;
}

function getZoneByToken(token) {
  return db.prepare('SELECT * FROM zones WHERE token = ?').get(token);
}

function getZoneById(zoneId) {
  return db.prepare('SELECT * FROM zones WHERE id = ?').get(zoneId);
}

function getZonePeriodStartAt(zone) {
  if (!zone) return nowIso();
  return zone.access_code_updated_at || zone.created_at || nowIso();
}

function getZoneCustomerSettlements(zoneId, periodStartAt) {
  const rows = db.prepare(`
    SELECT customer_name, settled, updated_at, updated_by_employee_id, updated_by_employee_username
    FROM zone_customer_settlements
    WHERE zone_id = ? AND period_start_at = ?
  `).all(zoneId, periodStartAt);

  const byCustomer = {};
  for (const row of rows) {
    const key = sanitizeText(row.customer_name || '', 40);
    if (!key) continue;
    byCustomer[key] = {
      settled: row.settled === 1,
      updatedAt: row.updated_at || '',
      updatedByEmployeeId: sanitizeText(row.updated_by_employee_id || '', 120),
      updatedByEmployeeUsername: sanitizeText(row.updated_by_employee_username || '', 60),
    };
  }
  return byCustomer;
}

function setZoneCustomerSettlement({ zoneId, periodStartAt, customerName, settled, employee = null }) {
  const safeCustomerName = sanitizeText(customerName, 40);
  if (!safeCustomerName) {
    return { ok: false, error: 'customer_name_required' };
  }
  const now = nowIso();
  db.prepare(`
    INSERT INTO zone_customer_settlements(
      zone_id, customer_name, period_start_at, settled, updated_at, updated_by_employee_id, updated_by_employee_username
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(zone_id, customer_name, period_start_at) DO UPDATE SET
      settled = excluded.settled,
      updated_at = excluded.updated_at,
      updated_by_employee_id = excluded.updated_by_employee_id,
      updated_by_employee_username = excluded.updated_by_employee_username
  `).run(
    zoneId,
    safeCustomerName,
    periodStartAt,
    settled ? 1 : 0,
    now,
    sanitizeText(employee?.id || '', 120),
    sanitizeText(employee?.username || '', 60),
  );
  return { ok: true };
}

function clearZoneCustomerSettlements(zoneId) {
  db.prepare('DELETE FROM zone_customer_settlements WHERE zone_id = ?').run(zoneId);
}

function getZoneSessionOrders(zoneId) {
  const zone = getZoneById(zoneId);
  if (!zone) return [];
  const periodStartAt = getZonePeriodStartAt(zone);
  const periodStartMs = new Date(periodStartAt).getTime();
  return getOrderWithItems({ history: false })
    .filter((order) => order.zoneId === zoneId)
    .filter((order) => {
      const createdMs = new Date(order.createdAt).getTime();
      return Number.isFinite(createdMs) && createdMs >= periodStartMs;
    });
}

function getZoneCheckoutStatus(zoneId) {
  const zone = getZoneById(zoneId);
  if (!zone) {
    return {
      zoneId,
      periodStartAt: nowIso(),
      customerNames: [],
      unsettledCustomerNames: [],
      settlements: {},
      customerCount: 0,
      unsettledCustomerCount: 0,
      canCheckout: true,
    };
  }

  const periodStartAt = getZonePeriodStartAt(zone);
  const sessionOrders = getZoneSessionOrders(zoneId);
  const customerNames = [...new Set(
    sessionOrders
      .map((order) => sanitizeText(order.customerName || '', 40) || 'Guest')
      .filter(Boolean),
  )];
  const settlements = getZoneCustomerSettlements(zoneId, periodStartAt);
  const unsettledCustomerNames = customerNames.filter((customerName) => !settlements[customerName]?.settled);

  return {
    zoneId,
    periodStartAt,
    customerNames,
    unsettledCustomerNames,
    settlements,
    customerCount: customerNames.length,
    unsettledCustomerCount: unsettledCustomerNames.length,
    canCheckout: unsettledCustomerNames.length === 0,
  };
}

function buildCustomerReceipt({ zone, customerName, orders, employee }) {
  const requestedCustomerName = sanitizeText(customerName, 40);
  const safeCustomerName = requestedCustomerName && requestedCustomerName !== '未填写'
    ? requestedCustomerName
    : 'Guest';
  const receiptOrders = (orders || [])
    .filter((order) => (sanitizeText(order.customerName || '', 40) || 'Guest') === safeCustomerName)
    .filter((order) => order.status !== 'cancelled')
    .sort((a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || ''));

  const itemsMap = new Map();
  for (const order of receiptOrders) {
    for (const item of order.items || []) {
      const key = [item.menuId || '', item.name || '', Number(item.price || 0).toFixed(2)].join('::');
      const existing = itemsMap.get(key) || {
        name: item.name || 'Item',
        price: round2(item.price),
        quantity: 0,
        subtotal: 0,
      };
      existing.quantity += Number(item.quantity || 0);
      existing.subtotal = round2(existing.subtotal + Number(item.subtotal || 0));
      itemsMap.set(key, existing);
    }
  }

  const items = Array.from(itemsMap.values());
  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const serviceCharge = round2(subtotal * SERVICE_RATE);
  const tax = ceil2((subtotal + serviceCharge) * TAX_RATE);
  const total = round2(subtotal + serviceCharge + tax);
  const firstOrder = receiptOrders[0] || null;
  const venueName = getSetting('venue_name') || 'Universal Order System';

  return {
    venueName,
    receiptType: 'Dine In',
    waiter: sanitizeText(employee?.displayName || employee?.username || '', 60) || 'Staff',
    customerName: safeCustomerName,
    zoneLabel: zone?.label || '',
    serial: `${String(zone?.id || '').slice(0, 8)}-${safeCustomerName.slice(0, 6)}`,
    chk: `${receiptOrders.length}/${items.length}/${receiptOrders.reduce((sum, order) => sum + Number(order.items?.length || 0), 0)}`,
    openAt: firstOrder?.createdAt || nowIso(),
    printedAt: nowIso(),
    printCount: 1,
    items,
    subtotal,
    serviceCharge,
    tax,
    total,
    orderCount: receiptOrders.length,
    orderIds: receiptOrders.map((order) => order.id),
  };
}

function ensureZoneCanCheckout(zoneId) {
  const status = getZoneCheckoutStatus(zoneId);
  if (status.canCheckout) {
    return { ok: true, checkoutStatus: status };
  }
  const customerList = status.unsettledCustomerNames.join('、');
  return {
    ok: false,
    statusCode: 409,
    error: `还有未结顾客，不能结单清零：${customerList}`,
    checkoutStatus: status,
  };
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

function createZoneSession(zoneId, customerName = '') {
  const createdAt = nowIso();
  const expiresAt = minutesFromNow(ZONE_SESSION_TTL_MINUTES);
  const sessionToken = createSessionToken();
  const id = createId();
  const safeCustomerName = sanitizeText(customerName, 40);

  db.prepare(`
    INSERT INTO zone_sessions(id, zone_id, session_token, customer_name, created_at, last_seen_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(id, zoneId, sessionToken, safeCustomerName, createdAt, createdAt, expiresAt);

  return { id, sessionToken, expiresAt, customerName: safeCustomerName };
}

function findValidZoneSession(zoneId, sessionToken) {
  const token = sanitizeText(sessionToken, 120);
  if (!token) return { ok: false, reason: 'missing' };

  const row = db.prepare(`
    SELECT id, zone_id, session_token, customer_name, created_at, last_seen_at, expires_at, revoked_at
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

function hashEmployeePassword(password) {
  const value = sanitizeText(password, 200);
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ensureDefaultEmployee() {
  const countRow = db.prepare('SELECT COUNT(*) AS count FROM employees').get();
  if (Number(countRow?.count || 0) > 0) return;
  const now = nowIso();
  db.prepare(`
    INSERT INTO employees(id, username, display_name, password_hash, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(createId(), 'staff', 'Staff', hashEmployeePassword('123456'), now, now);
  console.log('[employee] default account created: staff / 123456 (please change in admin_manage)');
}

function getActiveEmployees() {
  return db
    .prepare('SELECT id, username, display_name, active, created_at, updated_at FROM employees ORDER BY datetime(created_at) ASC')
    .all()
    .map((row) => ({
      id: row.id,
      username: row.username,
      displayName: sanitizeText(row.display_name || '', 60) || row.username,
      active: row.active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function createEmployeeSession(employeeId) {
  const now = nowIso();
  const expiresAt = minutesFromNow(EMPLOYEE_SESSION_TTL_MINUTES);
  const token = createSessionToken();
  db.prepare(`
    INSERT INTO employee_sessions(id, employee_id, session_token, created_at, last_seen_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(createId(), employeeId, token, now, now, expiresAt);
  return { token, expiresAt };
}

function verifyEmployeeSession(token) {
  const value = sanitizeText(token, 120);
  if (!value) return { ok: false, reason: 'missing' };
  const row = db.prepare(`
    SELECT
      s.id, s.employee_id, s.session_token, s.expires_at, s.revoked_at,
      e.username, e.display_name, e.active
    FROM employee_sessions s
    JOIN employees e ON e.id = s.employee_id
    WHERE s.session_token = ?
    LIMIT 1
  `).get(value);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.active !== 1) return { ok: false, reason: 'employee_inactive' };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, session: row };
}

function touchEmployeeSession(sessionId) {
  const touchedAt = nowIso();
  const expiresAt = minutesFromNow(EMPLOYEE_SESSION_TTL_MINUTES);
  db.prepare('UPDATE employee_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
    .run(touchedAt, expiresAt, sessionId);
  return expiresAt;
}

function revokeEmployeeSession(token) {
  const value = sanitizeText(token, 120);
  if (!value) return;
  db.prepare('UPDATE employee_sessions SET revoked_at = ? WHERE session_token = ? AND revoked_at IS NULL')
    .run(nowIso(), value);
}

function revokeEmployeeSessionsByEmployee(employeeId) {
  db.prepare('UPDATE employee_sessions SET revoked_at = ? WHERE employee_id = ? AND revoked_at IS NULL')
    .run(nowIso(), employeeId);
}

function canEditOrder(order) {
  return Boolean(order && !['served', 'cancelled'].includes(order.status));
}

function recalculateOrderTotal(orderId) {
  const rows = db.prepare('SELECT subtotal FROM order_items WHERE order_id = ? ORDER BY id ASC').all(orderId);
  const items = rows.map((row) => ({ subtotal: round2(row.subtotal) }));
  const total = calculateOrderGrandTotal(items);
  db.prepare('UPDATE orders SET total = ?, updated_at = ? WHERE id = ?').run(total, nowIso(), orderId);
  return total;
}

function getEditableOrderOrError(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return { ok: false, statusCode: 404, error: 'Order not found.' };
  }
  if (!canEditOrder(order)) {
    return { ok: false, statusCode: 409, error: 'Completed or cancelled orders cannot be edited.' };
  }
  return { ok: true, order };
}

function requireEmployeeAuth(req, res, next) {
  const token = sanitizeText(req.get(EMPLOYEE_SESSION_HEADER_NAME) || '', 120);
  const verified = verifyEmployeeSession(token);
  if (!verified.ok) {
    return res.status(401).json({ error: '请先员工登录。', requiresEmployeeLogin: true });
  }
  const expiresAt = touchEmployeeSession(verified.session.id);
  req.employee = {
    id: verified.session.employee_id,
    username: verified.session.username,
    displayName: sanitizeText(verified.session.display_name || '', 60) || verified.session.username,
    token: verified.session.session_token,
    expiresAt,
  };
  return next();
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
        id, zone_id, zone_label, zone_token, customer_name, note, total, status,
        created_at, updated_at, archived_at, checkout_at,
        handled_by_employee_id, handled_by_employee_username
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order.id,
      order.zone_id,
      order.zone_label,
      order.zone_token,
      sanitizeText(order.customer_name || '', 40),
      order.note || '',
      round2(order.total),
      order.status,
      order.created_at,
      order.updated_at,
      archivedAt,
      checkoutAt || null,
      sanitizeText(order.handled_by_employee_id || '', 120),
      sanitizeText(order.handled_by_employee_username || '', 60),
    );

    const insertHistoryItemStmt = db.prepare(`
      INSERT INTO order_history_items(
        order_id, menu_id, name, price, quantity, subtotal, served, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      insertHistoryItemStmt.run(
        order.id,
        item.menu_id,
        item.name,
        round2(item.price),
        Number(item.quantity),
        round2(item.subtotal),
        item.served === 1 ? 1 : 0,
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
    .prepare('SELECT id, name, price, description, category, sort_index, available FROM menu WHERE available = 1 ORDER BY sort_index ASC, datetime(created_at) ASC, name COLLATE NOCASE ASC')
    .all()
    .map((row) => ({
      ...row,
      available: row.available === 1,
      price: round2(row.price),
    }));
}

function getAllMenu() {
  return db
    .prepare('SELECT id, name, price, description, category, sort_index, available FROM menu ORDER BY sort_index ASC, datetime(created_at) ASC, name COLLATE NOCASE ASC')
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
        COALESCE(stats.active_order_count, 0) AS active_order_count
      FROM zones z
      LEFT JOIN (
        SELECT zone_id, COUNT(*) AS active_order_count
        FROM orders
        GROUP BY zone_id
      ) stats ON stats.zone_id = z.id
      ORDER BY z.created_at ASC
    `)
    .all();

  const activeOrders = getOrderWithItems();
  const zoneTotalMap = new Map();
  for (const order of activeOrders) {
    const total = calculateOrderGrandTotal(order.items || []);
    zoneTotalMap.set(order.zoneId, round2((zoneTotalMap.get(order.zoneId) || 0) + total));
  }

  return zones.map((zone) => {
    const checkoutStatus = getZoneCheckoutStatus(zone.id);
    return {
      id: zone.id,
      label: zone.label,
      token: zone.token,
      accessCode: zone.access_code || '',
      accessCodeUpdatedAt: zone.access_code_updated_at || null,
      completed: zone.completed === 1,
      completedAt: zone.completed_at || null,
      createdAt: zone.created_at,
      activeOrderCount: Number(zone.active_order_count || 0),
      activeOrderTotal: round2(zoneTotalMap.get(zone.id) || 0),
      canCheckout: checkoutStatus.canCheckout,
      unsettledCustomerCount: checkoutStatus.unsettledCustomerCount,
      accessUrl: `${baseUrl}/o/${zone.token}`,
      qrPngUrl: `${baseUrl}/api/admin/zones/${zone.id}/qrcode?format=png`,
      qrSvgUrl: `${baseUrl}/api/admin/zones/${zone.id}/qrcode?format=svg`,
    };
  });
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
    SELECT id, order_id, menu_id, name, price, quantity, subtotal, served
    FROM ${itemsTable}
    WHERE order_id = ?
    ORDER BY id ASC
  `);

  return orders.map((order) => {
    const items = getItemsStmt.all(order.id).map((item) => ({
      itemId: Number(item.id),
      menuId: item.menu_id,
      name: item.name,
      price: round2(item.price),
      quantity: Number(item.quantity),
      subtotal: round2(item.subtotal),
      served: item.served === 1,
    }));
    return ({
    id: order.id,
    zoneId: order.zone_id,
    zoneLabel: order.zone_label,
    zoneToken: order.zone_token,
    customerName: sanitizeText(order.customer_name || '', 40),
    items,
    note: order.note || '',
    total: calculateOrderGrandTotal(items),
    status: order.status,
    handledByEmployeeId: sanitizeText(order.handled_by_employee_id || '', 120),
    handledByEmployeeUsername: sanitizeText(order.handled_by_employee_username || '', 60),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    archivedAt: history ? order.archived_at : undefined,
    checkoutAt: history ? order.checkout_at : undefined,
  });
  });
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
      INSERT OR IGNORE INTO categories(id, name, sort_index, created_at)
      VALUES (?, ?, ?, ?)
    `);
    let categorySortIndex = nextCategorySortIndex();
    for (const categoryName of categoryNames) {
      insertCategoryStmt.run(createId(), categoryName, categorySortIndex, nowIso());
      categorySortIndex += 1;
    }

    const insertMenuStmt = db.prepare(`
      INSERT OR REPLACE INTO menu(id, name, price, description, category, sort_index, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let menuSortIndex = nextMenuSortIndex();
    for (const item of legacyMenu) {
      insertMenuStmt.run(
        item.id,
        item.name,
        round2(item.price),
        item.description || '',
        item.category || 'Uncategorized',
        menuSortIndex,
        item.available ? 1 : 0,
        nowIso(),
        nowIso(),
      );
      menuSortIndex += 1;
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
      db.prepare(`
        INSERT OR REPLACE INTO session_carts(zone_id, zone_session_id, items_json, note, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(zoneId, PUBLIC_CART_SESSION_ID, JSON.stringify(parseCartItems(JSON.stringify(items))), note, nowIso());
    }

    const insertOrderStmt = db.prepare(`
      INSERT OR REPLACE INTO orders(
        id, zone_id, zone_label, zone_token, note, total, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItemStmt = db.prepare(`
      INSERT INTO order_items(order_id, menu_id, name, price, quantity, subtotal, served)
      VALUES (?, ?, ?, ?, ?, ?, 0)
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
      INSERT INTO categories(id, name, sort_index, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const categories = [...new Set(defaultMenu().map((item) => normalizeCategoryName(item.category)).filter(Boolean))];
    const createdAt = nowIso();
    for (let i = 0; i < categories.length; i += 1) {
      const categoryName = categories[i];
      insertCategoryStmt.run(createId(), categoryName, i, createdAt);
    }
  }

  if (menuCount === 0) {
    const insertMenuStmt = db.prepare(`
      INSERT INTO menu(id, name, price, description, category, sort_index, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = nowIso();
    const defaults = defaultMenu();
    for (let i = 0; i < defaults.length; i += 1) {
      const item = defaults[i];
      insertMenuStmt.run(
        item.id,
        item.name,
        round2(item.price),
        item.description,
        item.category,
        i,
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
      // carts are created per user session when needed
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
    INSERT INTO categories(id, name, sort_index, created_at)
    VALUES (?, ?, ?, ?)
  `);
  let nextIdx = nextCategorySortIndex();
  for (const categoryName of menuCategories) {
    if (existing.has(categoryName)) continue;
    insertCategoryStmt.run(createId(), categoryName, nextIdx, nowIso());
    nextIdx += 1;
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

function backfillSortIndexes() {
  // Only initialize sort indexes for legacy rows that are all defaulted to 0.
  // Never overwrite user-customized ordering.
  const catStat = db.prepare('SELECT COUNT(*) AS count, COALESCE(MAX(sort_index), 0) AS max_idx FROM categories').get();
  if (Number(catStat?.count || 0) > 1 && Number(catStat?.max_idx || 0) === 0) {
    const categories = db.prepare('SELECT id FROM categories ORDER BY datetime(created_at) ASC, name COLLATE NOCASE ASC').all();
    const updateCategorySortStmt = db.prepare('UPDATE categories SET sort_index = ? WHERE id = ?');
    categories.forEach((row, idx) => updateCategorySortStmt.run(idx, row.id));
  }

  const menuStat = db.prepare('SELECT COUNT(*) AS count, COALESCE(MAX(sort_index), 0) AS max_idx FROM menu').get();
  if (Number(menuStat?.count || 0) > 1 && Number(menuStat?.max_idx || 0) === 0) {
    const menuRows = db.prepare('SELECT id FROM menu ORDER BY datetime(created_at) ASC, name COLLATE NOCASE ASC').all();
    const updateMenuSortStmt = db.prepare('UPDATE menu SET sort_index = ? WHERE id = ?');
    menuRows.forEach((row, idx) => updateMenuSortStmt.run(idx, row.id));
  }
}

maybeMigrateFromLegacyJson();
seedDefaultsIfNeeded();
ensureDefaultEmployee();
backfillCategoriesFromMenu();
backfillZoneAccessCodes();
// Do not auto-run backfillSortIndexes on every startup.
// It can accidentally rewrite manually adjusted ordering in production.

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
  const styleSrc = CSP_ALLOW_INLINE_STYLE ? "style-src 'self' 'unsafe-inline';" : "style-src 'self';";
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; img-src 'self' data:; ${styleSrc} script-src 'self'; connect-src 'self'; frame-ancestors 'self';`,
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

app.use('/api', (req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) {
    return next();
  }

  const taskName = `${req.method} ${req.path}`;
  let taskPromise;
  try {
    taskPromise = enqueueWrite(taskName, () => new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        res.removeListener('finish', onDone);
        res.removeListener('close', onDone);
      };

      const settle = (error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const onDone = () => settle();

      res.on('finish', onDone);
      res.on('close', onDone);

      try {
        next();
      } catch (error) {
        settle(error);
      }
    }));
  } catch (error) {
    taskPromise = Promise.reject(error);
  }

  taskPromise.catch((error) => {
    if (res.headersSent) return;
    if (error?.code === 'WRITE_QUEUE_FULL') {
      return res.status(503).json({
        error: error.message,
        code: error.code,
        writeQueue: getWriteQueueInfo(),
      });
    }
    return next(error);
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: nowIso(), db: 'sqlite3', writeQueue: getWriteQueueInfo() });
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
    return {
      ok: true,
      sessionToken: '',
      customerName: '',
      sessionId: '',
      cartOwnerKey: PUBLIC_CART_SESSION_ID,
    };
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
  return {
    ok: true,
    sessionToken: result.session.session_token,
    expiresAt,
    sessionId: result.session.id,
    cartOwnerKey: result.session.id,
    customerName: sanitizeText(result.session.customer_name || '', 40),
  };
}

app.post('/api/public/session/open', (req, res) => {
  const token = sanitizeText(req.body?.token, 100);
  const accessCode = sanitizeText(req.body?.accessCode, 20);
  const customerName = sanitizeText(req.body?.customerName, 40);

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
  if (!customerName) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const session = createZoneSession(zone.id, customerName);
  migrateLegacyZoneCartToPublic(zone.id);
  return res.status(201).json({
    ok: true,
    sessionToken: session.sessionToken,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    ttlMinutes: ZONE_SESSION_TTL_MINUTES,
    zone: {
      id: zone.id,
      label: zone.label,
      token: zone.token,
    },
    customerName: session.customerName,
    cart: getSessionCart(zone.id, session.id),
    roomCarts: getRoomLiveCarts(zone.id),
  });
});

app.get('/api/public/context/:token', (req, res) => {
  const token = sanitizeText(req.params.token, 100);
  const zone = getZoneByToken(token);

  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or expired.' });
  }

  const venueName = getSetting('venue_name') || 'Universal Order System';
  let cart = { items: {}, note: '', updatedAt: nowIso() };
  let roomCarts = [];
  let session = null;
  if (ZONE_ACCESS_CODE_REQUIRED) {
    const sessionToken = req.get(SESSION_HEADER_NAME) || '';
    const check = findValidZoneSession(zone.id, sessionToken);
    if (check.ok) {
      const expiresAt = touchZoneSession(check.session.id);
      session = {
        id: check.session.id,
        token: check.session.session_token,
        expiresAt,
        customerName: sanitizeText(check.session.customer_name || '', 40),
      };
      cart = getSessionCart(zone.id, check.session.id);
      roomCarts = getRoomLiveCarts(zone.id);
    } else {
      cart = { items: {}, note: '', updatedAt: nowIso() };
    }
  } else {
    migrateLegacyZoneCartToPublic(zone.id);
    cart = getSessionCart(zone.id, PUBLIC_CART_SESSION_ID);
    roomCarts = getRoomLiveCarts(zone.id);
  }

  return res.json({
    venueName,
    accessCodeRequired: ZONE_ACCESS_CODE_REQUIRED,
    zone: {
      id: zone.id,
      label: zone.label,
      token: zone.token,
    },
    menu: getAllMenu(),
    categories: getAllCategories(),
    cart,
    roomCarts,
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

  const cart = getSessionCart(zone.id, sessionCheck.cartOwnerKey);
  return res.json({
    zoneId: zone.id,
    zoneLabel: zone.label,
    cart,
    roomCarts: getRoomLiveCarts(zone.id),
    session: {
      id: sessionCheck.sessionId || '',
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
      customerName: sessionCheck.customerName,
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

  const cart = getSessionCart(zone.id, sessionCheck.cartOwnerKey);
  const current = Number(cart.items[menuId] || 0);
  const next = Math.max(0, Math.min(99, current + delta));

  if (next === 0) {
    delete cart.items[menuId];
  } else {
    cart.items[menuId] = next;
    setZoneCompleted(zone.id, false);
  }

  saveSessionCart(zone.id, sessionCheck.cartOwnerKey, cart);

  return res.json({
    ok: true,
    cart: getSessionCart(zone.id, sessionCheck.cartOwnerKey),
    roomCarts: getRoomLiveCarts(zone.id),
    session: {
      id: sessionCheck.sessionId || '',
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
      customerName: sessionCheck.customerName,
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

  const cart = getSessionCart(zone.id, sessionCheck.cartOwnerKey);
  cart.note = note;
  saveSessionCart(zone.id, sessionCheck.cartOwnerKey, cart);

  return res.json({
    ok: true,
    cart: getSessionCart(zone.id, sessionCheck.cartOwnerKey),
    roomCarts: getRoomLiveCarts(zone.id),
    session: {
      id: sessionCheck.sessionId || '',
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
      customerName: sessionCheck.customerName,
    },
  });
});

app.post('/api/public/orders', (req, res) => {
  const token = sanitizeText(req.body?.token, 100);
  const incomingItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const incomingNote = sanitizeText(req.body?.note, 240);

  if (!token) {
    return res.status(400).json({ error: 'Missing token.' });
  }

  const zone = getZoneByToken(token);
  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or not configured.' });
  }
  const sessionCheck = requireZoneSession(req, res, zone);
  if (!sessionCheck.ok) return;

  const publicMenu = getAllMenu();
  const menuMap = new Map(publicMenu.map((item) => [item.id, item]));
  const zoneCart = getSessionCart(zone.id, sessionCheck.cartOwnerKey);

  const sourceItems = incomingItems.length
    ? incomingItems
    : Object.entries(zoneCart.items).map(([menuId, quantity]) => ({ menuId, quantity }));

  const normalizedItems = [];
  for (const raw of sourceItems) {
    const menuId = sanitizeText(raw?.menuId, 100);
    const quantity = Number(raw?.quantity);
    if (!menuId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue;

    const menuItem = menuMap.get(menuId);
    if (!menuItem || menuItem.available !== true) continue;

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

  const total = calculateOrderGrandTotal(normalizedItems);
  const orderId = createId();
  const finalNote = incomingNote || zoneCart.note || '';
  const createdAt = nowIso();

  const createOrderTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO orders(
        id, zone_id, zone_label, zone_token, customer_name, note, total, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      zone.id,
      zone.label,
      zone.token,
      sessionCheck.customerName || '',
      finalNote,
      total,
      'new',
      createdAt,
      createdAt,
    );

    const insertOrderItemStmt = db.prepare(`
      INSERT INTO order_items(order_id, menu_id, name, price, quantity, subtotal, served)
      VALUES (?, ?, ?, ?, ?, ?, 0)
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
    clearSessionCart(zone.id, sessionCheck.cartOwnerKey);
  });

  createOrderTx();

  return res.status(201).json({
    ok: true,
    orderId,
    zoneLabel: zone.label,
    status: 'new',
    roomCarts: getRoomLiveCarts(zone.id),
    session: {
      id: sessionCheck.sessionId || '',
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
      customerName: sessionCheck.customerName,
    },
  });
});

app.get('/api/public/orders/:token', (req, res) => {
  const token = sanitizeText(req.params.token, 100);

  const zone = getZoneByToken(token);
  if (!zone) {
    return res.status(404).json({ error: 'QR code is invalid or expired.' });
  }
  const sessionCheck = requireZoneSession(req, res, zone);
  if (!sessionCheck.ok) return;

  const periodStartIso = zone.access_code_updated_at || zone.created_at || nowIso();
  const periodStartMs = new Date(periodStartIso).getTime();
  const isInCurrentAccessPeriod = (order) => {
    const createdMs = new Date(order.createdAt).getTime();
    if (!Number.isFinite(createdMs)) return false;
    return createdMs >= periodStartMs;
  };

  const activeOrders = getOrderWithItems({ history: false })
    .filter((order) => order.zoneId === zone.id)
    .filter(isInCurrentAccessPeriod)
    .map((order) => ({ ...order, source: 'active' }));
  const historyOrders = getOrderWithItems({ history: true })
    .filter((order) => order.zoneId === zone.id)
    .filter(isInCurrentAccessPeriod)
    .map((order) => ({ ...order, source: 'history' }));

  const combined = [...activeOrders, ...historyOrders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json({
    orders: combined,
    session: {
      id: sessionCheck.sessionId || '',
      token: sessionCheck.sessionToken,
      expiresAt: sessionCheck.expiresAt,
      customerName: sessionCheck.customerName,
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
      INSERT INTO menu(id, name, price, description, category, sort_index, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < nextMenu.length; i += 1) {
      const item = nextMenu[i];
      insertMenuStmt.run(
        item.id,
        item.name,
        round2(item.price),
        item.description || '',
        item.category || 'Uncategorized',
        i,
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

  const category = { id: createId(), name, sortIndex: nextCategorySortIndex(), createdAt: nowIso() };
  db.prepare('INSERT INTO categories(id, name, sort_index, created_at) VALUES (?, ?, ?, ?)').run(
    category.id,
    category.name,
    category.sortIndex,
    category.createdAt,
  );

  return res.status(201).json({ ok: true, category, categories: getAllCategories() });
});

app.patch('/api/admin/categories/reorder', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => sanitizeText(id, 100)).filter(Boolean) : [];
  if (!ids.length) {
    return res.status(400).json({ error: 'ids is required.' });
  }

  const existing = getAllCategories();
  const existingIds = new Set(existing.map((c) => c.id));
  if (ids.length !== existing.length) {
    return res.status(400).json({ error: 'ids length does not match category count.' });
  }
  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'ids contains duplicates.' });
  }
  for (const id of ids) {
    if (!existingIds.has(id)) {
      return res.status(400).json({ error: `Invalid category id: ${id}` });
    }
  }

  const reorderTx = db.transaction(() => {
    const updateStmt = db.prepare('UPDATE categories SET sort_index = ? WHERE id = ?');
    ids.forEach((id, idx) => updateStmt.run(idx, id));
  });
  reorderTx();

  return res.json({ ok: true, categories: getAllCategories() });
});

app.patch('/api/admin/categories/:id', (req, res) => {
  const categoryId = sanitizeText(req.params.id, 100);
  const name = normalizeCategoryName(req.body?.name);
  if (!name) {
    return res.status(400).json({ error: 'Category name cannot be empty.' });
  }

  const category = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(categoryId);
  if (!category) {
    return res.status(404).json({ error: 'Category not found.' });
  }
  if (category.name === name) {
    return res.json({ ok: true, category: { id: category.id, name }, categories: getAllCategories() });
  }

  const duplicate = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name, categoryId);
  if (duplicate) {
    return res.status(409).json({ error: `Category already exists: ${name}` });
  }

  const renameTx = db.transaction(() => {
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, categoryId);
    db.prepare('UPDATE menu SET category = ?, updated_at = ? WHERE category = ?').run(name, nowIso(), category.name);
  });
  renameTx();

  return res.json({
    ok: true,
    category: { id: categoryId, name },
    categories: getAllCategories(),
    menu: getAllMenu(),
  });
});

app.post('/api/admin/menu/import-text', (req, res) => {
  const rawText = sanitizeText(req.body?.text || '', 100000);
  if (!rawText) {
    return res.status(400).json({ error: 'Import text cannot be empty.' });
  }

  const blocks = String(rawText)
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const parsedItems = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const data = { category: '', name: '', price: NaN, description: '' };
    for (const line of lines) {
      const m = line.match(/^([A-Za-z ]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].trim().toLowerCase();
      const value = m[2] ?? '';
      if (key === 'category') data.category = normalizeCategoryName(value);
      if (key === 'name') data.name = sanitizeText(value, 80);
      if (key === 'price') data.price = Number(value);
      if (key === 'description') data.description = sanitizeText(value, 240);
    }
    if (!data.category || !data.name || !Number.isFinite(data.price) || data.price < 0) {
      continue;
    }
    parsedItems.push({
      category: data.category,
      name: data.name,
      price: round2(data.price),
      description: data.description || '',
      available: true,
    });
  }

  if (!parsedItems.length) {
    return res.status(400).json({ error: 'No valid items parsed. Use Category/Name/Price/Description format.' });
  }

  const importTx = db.transaction(() => {
    const existingCategoryNames = new Set(getAllCategories().map((c) => c.name));
    let categoryIdx = nextCategorySortIndex();
    const insertCategoryStmt = db.prepare('INSERT INTO categories(id, name, sort_index, created_at) VALUES (?, ?, ?, ?)');
    for (const item of parsedItems) {
      if (existingCategoryNames.has(item.category)) continue;
      insertCategoryStmt.run(createId(), item.category, categoryIdx, nowIso());
      existingCategoryNames.add(item.category);
      categoryIdx += 1;
    }

    const insertMenuStmt = db.prepare(`
      INSERT INTO menu(id, name, price, description, category, sort_index, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let menuIdx = nextMenuSortIndex();
    const now = nowIso();
    for (const item of parsedItems) {
      insertMenuStmt.run(
        createId(),
        item.name,
        item.price,
        item.description,
        item.category,
        menuIdx,
        1,
        now,
        now,
      );
      menuIdx += 1;
    }
  });

  importTx();
  return res.status(201).json({
    ok: true,
    importedCount: parsedItems.length,
    menu: getAllMenu(),
    categories: getAllCategories(),
  });
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

  // carts are created per user session when needed
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
  clearZoneCustomerSettlements(zoneId);
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
  const guard = ensureZoneCanCheckout(zoneId);
  if (!guard.ok) {
    return res.status(guard.statusCode).json({ error: guard.error, checkoutStatus: guard.checkoutStatus });
  }

  const checkoutAt = nowIso();
  const clearedOrders = archiveAndClearZoneOrdersTx(zoneId, checkoutAt);
  clearAllZoneCarts(zoneId);
  clearZoneCustomerSettlements(zoneId);
  setZoneCompleted(zoneId, false);
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
  clearZoneCustomerSettlements(zoneId);
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
  clearAllZoneCarts(zoneId);
  clearZoneCustomerSettlements(zoneId);
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

app.get('/api/admin/employees', (req, res) => {
  return res.json({ employees: getActiveEmployees() });
});

app.post('/api/admin/employees', (req, res) => {
  const username = sanitizeText(req.body?.username, 40);
  const displayName = sanitizeText(req.body?.displayName, 60) || username;
  const password = sanitizeText(req.body?.password, 120);
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required.' });
  }
  const existing = db.prepare('SELECT id FROM employees WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'username already exists.' });
  }
  const now = nowIso();
  db.prepare(`
    INSERT INTO employees(id, username, display_name, password_hash, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(createId(), username, displayName, hashEmployeePassword(password), now, now);
  return res.status(201).json({ ok: true, employees: getActiveEmployees() });
});

app.patch('/api/admin/employees/:id', (req, res) => {
  const employeeId = sanitizeText(req.params.id, 120);
  const username = sanitizeText(req.body?.username, 40);
  const displayName = sanitizeText(req.body?.displayName, 60) || username;
  const password = sanitizeText(req.body?.password, 120);
  const employee = db.prepare('SELECT id, username FROM employees WHERE id = ?').get(employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'employee not found.' });
  }
  if (!username) {
    return res.status(400).json({ error: 'username cannot be empty.' });
  }
  const duplicate = db.prepare('SELECT id FROM employees WHERE username = ? AND id != ?').get(username, employeeId);
  if (duplicate) {
    return res.status(409).json({ error: 'username already exists.' });
  }
  if (password) {
    db.prepare('UPDATE employees SET username = ?, display_name = ?, password_hash = ?, updated_at = ? WHERE id = ?')
      .run(username, displayName, hashEmployeePassword(password), nowIso(), employeeId);
  } else {
    db.prepare('UPDATE employees SET username = ?, display_name = ?, updated_at = ? WHERE id = ?')
      .run(username, displayName, nowIso(), employeeId);
  }
  return res.json({ ok: true, employees: getActiveEmployees() });
});

app.delete('/api/admin/employees/:id', (req, res) => {
  const employeeId = sanitizeText(req.params.id, 120);
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'employee not found.' });
  }
  db.transaction(() => {
    revokeEmployeeSessionsByEmployee(employeeId);
    db.prepare('DELETE FROM employees WHERE id = ?').run(employeeId);
  })();
  ensureDefaultEmployee();
  return res.json({ ok: true, employees: getActiveEmployees() });
});

app.post('/api/employee/auth/login', (req, res) => {
  const username = sanitizeText(req.body?.username, 40);
  const password = sanitizeText(req.body?.password, 120);
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码。' });
  }
  const employee = db.prepare('SELECT id, username, display_name, password_hash, active FROM employees WHERE username = ?').get(username);
  if (!employee || employee.active !== 1) {
    return res.status(401).json({ error: '账号或密码错误。' });
  }
  if (employee.password_hash !== hashEmployeePassword(password)) {
    return res.status(401).json({ error: '账号或密码错误。' });
  }
  const session = createEmployeeSession(employee.id);
  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    employee: {
      id: employee.id,
      username: employee.username,
      displayName: sanitizeText(employee.display_name || '', 60) || employee.username,
    },
  });
});

app.post('/api/employee/auth/logout', requireEmployeeAuth, (req, res) => {
  revokeEmployeeSession(req.employee.token);
  return res.json({ ok: true });
});

app.get('/api/employee/auth/me', requireEmployeeAuth, (req, res) => {
  return res.json({
    ok: true,
    employee: {
      id: req.employee.id,
      username: req.employee.username,
      displayName: req.employee.displayName || req.employee.username,
    },
    expiresAt: req.employee.expiresAt,
  });
});

app.get('/api/employee/menu', requireEmployeeAuth, (req, res) => {
  return res.json({ menu: getActiveMenu(), categories: getAllCategories() });
});

app.get('/api/employee/write-queue', requireEmployeeAuth, (req, res) => {
  return res.json({ writeQueue: getWriteQueueInfo() });
});

app.get('/api/employee/orders', requireEmployeeAuth, (req, res) => {
  const status = sanitizeText(req.query.status, 40);
  if (status && !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }
  return res.json({
    orders: getOrderWithItems({ history: false, status }),
    statuses: ORDER_STATUSES,
    writeQueue: getWriteQueueInfo(),
  });
});

app.patch('/api/employee/orders/:id', requireEmployeeAuth, (req, res) => {
  const orderId = sanitizeText(req.params.id, 100);
  const status = sanitizeText(req.body?.status, 40);
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }
  const result = patchOrderStatus(orderId, status, req.employee);
  if (!result.ok) {
    return res.status(result.statusCode).json({ error: result.error });
  }
  return res.json({ ok: true, order: result.order });
});

app.patch('/api/employee/orders/:orderId/items/:itemId/served', requireEmployeeAuth, (req, res) => {
  const orderId = sanitizeText(req.params.orderId, 100);
  const itemId = Number(req.params.itemId);
  const served = req.body?.served === true;
  if (!Number.isInteger(itemId) || itemId < 1) {
    return res.status(400).json({ error: 'Invalid item id.' });
  }
  const result = patchOrderItemServed(orderId, itemId, served);
  if (!result.ok) {
    return res.status(result.statusCode).json({ error: result.error });
  }
  return res.json({ ok: true, order: result.order });
});

app.patch('/api/employee/orders/:orderId/items/:itemId/quantity', requireEmployeeAuth, (req, res) => {
  const orderId = sanitizeText(req.params.orderId, 100);
  const itemId = Number(req.params.itemId);
  const delta = Number(req.body?.delta);
  if (!Number.isInteger(itemId) || itemId < 1) {
    return res.status(400).json({ error: 'Invalid item id.' });
  }
  const result = patchOrderItemQuantity(orderId, itemId, delta);
  if (!result.ok) {
    return res.status(result.statusCode).json({ error: result.error });
  }
  return res.json({ ok: true, order: result.order });
});

app.post('/api/employee/orders/:orderId/items', requireEmployeeAuth, (req, res) => {
  const orderId = sanitizeText(req.params.orderId, 100);
  const menuId = sanitizeText(req.body?.menuId, 100);
  if (!menuId) {
    return res.status(400).json({ error: 'menuId is required.' });
  }
  const result = addOrderItem(orderId, menuId);
  if (!result.ok) {
    return res.status(result.statusCode).json({ error: result.error });
  }
  return res.status(201).json({ ok: true, order: result.order });
});

app.get('/api/employee/zones', requireEmployeeAuth, (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  return res.json({ zones: getZoneList(baseUrl) });
});

app.get('/api/employee/zones/:id/customer-settlements', requireEmployeeAuth, (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }
  const checkoutStatus = getZoneCheckoutStatus(zoneId);
  return res.json(checkoutStatus);
});

app.get('/api/employee/zones/:id/receipt', requireEmployeeAuth, (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const customerName = sanitizeText(req.query.customerName, 40) || 'Guest';
  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }
  const receipt = buildCustomerReceipt({
    zone,
    customerName,
    orders: getZoneSessionOrders(zoneId),
    employee: req.employee || null,
  });
  if (!receipt.items.length) {
    return res.status(404).json({ error: '该顾客当前 session 没有可打印的项目。' });
  }
  return res.json({ ok: true, receipt });
});

app.patch('/api/employee/zones/:id/customer-settlements', requireEmployeeAuth, (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }
  const customerName = sanitizeText(req.body?.customerName, 40);
  const settled = req.body?.settled === true;
  if (!customerName) {
    return res.status(400).json({ error: 'customerName is required.' });
  }
  const periodStartAt = getZonePeriodStartAt(zone);
  const result = setZoneCustomerSettlement({
    zoneId,
    periodStartAt,
    customerName,
    settled,
    employee: req.employee || null,
  });
  if (!result.ok) {
    return res.status(400).json({ error: 'Invalid customer settlement data.' });
  }
  const checkoutStatus = getZoneCheckoutStatus(zoneId);
  return res.json({ ok: true, ...checkoutStatus });
});

app.post('/api/employee/zones/:id/checkout', requireEmployeeAuth, (req, res) => {
  const zoneId = sanitizeText(req.params.id, 100);
  const zone = getZoneById(zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found.' });
  }
  const guard = ensureZoneCanCheckout(zoneId);
  if (!guard.ok) {
    return res.status(guard.statusCode).json({ error: guard.error, checkoutStatus: guard.checkoutStatus });
  }
  const checkoutAt = nowIso();
  const clearedOrders = archiveAndClearZoneOrdersTx(zoneId, checkoutAt);
  clearAllZoneCarts(zoneId);
  clearZoneCustomerSettlements(zoneId);
  setZoneCompleted(zoneId, false);
  revokeZoneSessions(zoneId);
  if (ROTATE_ACCESS_CODE_ON_CHECKOUT) {
    rotateZoneAccessCode(zoneId);
  }
  return res.json({ ok: true, clearedOrders });
});

app.get('/api/admin/orders', requireEmployeeAuth, (req, res) => {
  const status = sanitizeText(req.query.status, 40);
  if (status && !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  return res.json({
    orders: getOrderWithItems({ history: false, status }),
    statuses: ORDER_STATUSES,
    writeQueue: getWriteQueueInfo(),
  });
});

function patchOrderStatus(orderId, status, actor = null) {
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return { ok: false, statusCode: 404, error: 'Order not found.' };
  }
  if (actor?.id && actor?.username) {
    db.prepare(`
      UPDATE orders
      SET status = ?, updated_at = ?, handled_by_employee_id = ?, handled_by_employee_username = ?
      WHERE id = ?
    `).run(status, nowIso(), actor.id, actor.username, orderId);
  } else {
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), orderId);
  }
  const updatedOrder = getOrderWithItems({ history: false }).find((o) => o.id === orderId);
  return { ok: true, order: updatedOrder };
}

function getActiveOrderById(orderId) {
  return getOrderWithItems({ history: false }).find((order) => order.id === orderId) || null;
}

function patchOrderItemServed(orderId, itemId, served) {
  const editable = getEditableOrderOrError(orderId);
  if (!editable.ok) return editable;

  const item = db.prepare('SELECT id FROM order_items WHERE id = ? AND order_id = ?').get(itemId, orderId);
  if (!item) {
    return { ok: false, statusCode: 404, error: 'Order item not found.' };
  }

  db.prepare('UPDATE order_items SET served = ? WHERE id = ? AND order_id = ?')
    .run(served ? 1 : 0, itemId, orderId);
  db.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').run(nowIso(), orderId);

  return { ok: true, order: getActiveOrderById(orderId) };
}

function patchOrderItemQuantity(orderId, itemId, delta) {
  const editable = getEditableOrderOrError(orderId);
  if (!editable.ok) return editable;

  if (!Number.isInteger(delta) || ![-1, 1].includes(delta)) {
    return { ok: false, statusCode: 400, error: 'Invalid delta.' };
  }

  const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(itemId, orderId);
  if (!item) {
    return { ok: false, statusCode: 404, error: 'Order item not found.' };
  }
  if (item.served === 1) {
    return { ok: false, statusCode: 409, error: 'Served items cannot be edited.' };
  }

  const allItems = db.prepare('SELECT id, quantity FROM order_items WHERE order_id = ? ORDER BY id ASC').all(orderId);
  const totalQty = allItems.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  if (delta === -1 && Number(item.quantity) <= 1) {
    if (totalQty <= 1) {
      return { ok: false, statusCode: 409, error: 'An order must keep at least one item.' };
    }
    db.prepare('DELETE FROM order_items WHERE id = ? AND order_id = ?').run(itemId, orderId);
  } else {
    const nextQty = Math.max(1, Math.min(99, Number(item.quantity) + delta));
    db.prepare(`
      UPDATE order_items
      SET quantity = ?, subtotal = ?
      WHERE id = ? AND order_id = ?
    `).run(nextQty, round2(Number(item.price) * nextQty), itemId, orderId);
  }

  recalculateOrderTotal(orderId);
  return { ok: true, order: getActiveOrderById(orderId) };
}

function addOrderItem(orderId, menuId) {
  const editable = getEditableOrderOrError(orderId);
  if (!editable.ok) return editable;

  const menuItem = db.prepare('SELECT id, name, price FROM menu WHERE id = ? AND available = 1').get(menuId);
  if (!menuItem) {
    return { ok: false, statusCode: 404, error: 'Menu item not found or unavailable.' };
  }

  const existing = db.prepare(`
    SELECT id, quantity
    FROM order_items
    WHERE order_id = ? AND menu_id = ? AND served = 0
    ORDER BY id ASC
    LIMIT 1
  `).get(orderId, menuId);

  if (existing) {
    const nextQty = Math.min(99, Number(existing.quantity) + 1);
    db.prepare('UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ? AND order_id = ?')
      .run(nextQty, round2(Number(menuItem.price) * nextQty), existing.id, orderId);
  } else {
    db.prepare(`
      INSERT INTO order_items(order_id, menu_id, name, price, quantity, subtotal, served)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(
      orderId,
      menuItem.id,
      menuItem.name,
      round2(menuItem.price),
      1,
      round2(Number(menuItem.price)),
    );
  }

  recalculateOrderTotal(orderId);
  return { ok: true, order: getActiveOrderById(orderId) };
}

app.patch('/api/admin/orders/:id', requireEmployeeAuth, (req, res) => {
  const orderId = sanitizeText(req.params.id, 100);
  const status = sanitizeText(req.body?.status, 40);

  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  const result = patchOrderStatus(orderId, status, req.employee || null);
  if (!result.ok) {
    return res.status(result.statusCode).json({ error: result.error });
  }
  return res.json({ ok: true, order: result.order });
});

app.get('/api/admin/orders/history', (req, res) => {
  const limitRaw = Number(req.query.limit || 200);
  const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(2000, limitRaw)) : 200;

  const all = getOrderWithItems({ history: true });
  const history = all.slice(0, limit);
  return res.json({ history, count: history.length });
});

app.get('/api/admin/orders/by-day', (req, res) => {
  const dateText = sanitizeText(req.query.date, 20);
  const tzOffsetRaw = Number(req.query.tzOffsetMinutes);
  const tzOffsetMinutes = Number.isFinite(tzOffsetRaw) ? Math.trunc(tzOffsetRaw) : 0;
  const m = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
  }

  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  const startUtcMs = Date.UTC(year, monthIdx, day, 0, 0, 0, 0) + tzOffsetMinutes * 60 * 1000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;

  const all = [
    ...getOrderWithItems({ history: false }).map((o) => ({ ...o, source: 'active' })),
    ...getOrderWithItems({ history: true }).map((o) => ({ ...o, source: 'history' })),
  ];

  const orders = all
    .filter((order) => {
      const t = new Date(order.createdAt).getTime();
      return Number.isFinite(t) && t >= startUtcMs && t < endUtcMs;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalAmount = round2(orders.reduce((sum, order) => sum + Number(order.total || 0), 0));
  const statusCount = {
    new: 0,
    preparing: 0,
    ready: 0,
    served: 0,
    cancelled: 0,
  };
  for (const order of orders) {
    if (Object.hasOwn(statusCount, order.status)) {
      statusCount[order.status] += 1;
    }
  }

  return res.json({
    date: dateText,
    tzOffsetMinutes,
    count: orders.length,
    totalAmount,
    statusCount,
    orders,
  });
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
    console.log(`[order-system] write queue  -> ${WRITE_QUEUE_ENABLED ? `enabled (max=${WRITE_QUEUE_MAX_SIZE})` : 'disabled'}`);
    console.log(`[order-system] sqlite busy  -> ${SQLITE_BUSY_TIMEOUT_MS}ms`);
    console.log('[order-system] user page    -> /front_user/index.html?token=<token>');
    console.log('[order-system] admin board  -> /front_admin/index.html');
    console.log('[order-system] admin manage -> /admin_manage/index.html');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
