const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const DEFAULT_BASE_URL = 'https://order.1383karaoke.ca';
const CONFIG_FILE_NAME = 'employee-desktop-config.json';
const PRINT_WORKER_ID = `windows-${crypto.randomUUID()}`;

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

function readConfig() {
  const configPath = getConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      return { baseUrl: DEFAULT_BASE_URL, printerName: '' };
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
        ? parsed.baseUrl.trim().replace(/\/+$/, '')
        : DEFAULT_BASE_URL,
      printerName: typeof parsed.printerName === 'string' ? parsed.printerName.trim() : '',
    };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL, printerName: '' };
  }
}

function writeConfig(nextConfig) {
  const configPath = getConfigPath();
  const safeConfig = {
    baseUrl: typeof nextConfig.baseUrl === 'string' && nextConfig.baseUrl.trim()
      ? nextConfig.baseUrl.trim().replace(/\/+$/, '')
      : DEFAULT_BASE_URL,
    printerName: typeof nextConfig.printerName === 'string' ? nextConfig.printerName.trim() : '',
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(safeConfig, null, 2), 'utf8');
  return safeConfig;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currency(value) {
  return Number(value || 0).toFixed(2);
}

function formatReceiptDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || '-').replace('T', ' ').replace(/\.\d+Z?$/, '');
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function buildReceiptHtml(receipt) {
  const itemsHtml = (receipt.items || []).map((item) => `
    <tr>
      <td class="qty">${escapeHtml(item.quantity)}</td>
      <td class="name">${escapeHtml(item.name)}</td>
      <td class="amount">${currency(item.subtotal)}</td>
    </tr>
  `).join('');

  const paymentLines = Array.isArray(receipt.paymentLines) ? receipt.paymentLines : [];
  const paymentHtml = paymentLines.map((line) => `
    <tr>
      <td>${escapeHtml(line.label || '')}:</td>
      <td>${currency(line.amount)}</td>
    </tr>
  `).join('');
  const separator = '='.repeat(32);
  const showCustomerLine = Boolean(receipt.customerName && receipt.customerName !== 'Guest' && receipt.customerName !== '-');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Receipt</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          html, body {
            margin: 0;
            padding: 0;
            font-family: Arial, "Helvetica Neue", "Segoe UI", sans-serif;
            color: #000;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            width: 72mm;
            padding: 4mm 3mm 5mm;
            font-size: 14px;
            line-height: 1.14;
            font-weight: 800;
            letter-spacing: 0;
          }
          * { box-sizing: border-box; }
          .center { text-align: center; }
          .venue {
            font-size: 22px;
            font-weight: 900;
            margin-top: 1mm;
            margin-bottom: 16mm;
            font-family: "Arial Black", Arial, sans-serif;
          }
          .subhead div { margin-top: 1.1mm; }
          .subhead .thanks { font-size: 14px; font-weight: 800; }
          .meta, .items, .totals, .summary-line {
            width: 100%;
            border-collapse: collapse;
            color: #000;
          }
          .meta td {
            padding: 0.35mm 0;
            vertical-align: top;
            font-size: 13px;
          }
          .meta td.label {
            width: 30%;
            font-weight: 900;
            white-space: nowrap;
          }
          .meta td.value {
            width: 70%;
            padding-left: 2mm;
          }
          .summary-line td {
            padding: 0.35mm 0;
            font-size: 13px;
            font-weight: 900;
          }
          .summary-line td:nth-child(1) { width: 18%; }
          .summary-line td:nth-child(2) { width: 34%; padding-left: 1mm; }
          .summary-line td:nth-child(3) { width: 20%; text-align: right; }
          .summary-line td:nth-child(4) { width: 28%; text-align: right; padding-right: 1mm; }
          .divider {
            margin: 2.1mm 0 1.8mm;
            text-align: center;
            font-family: "Courier New", monospace;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: -0.4px;
            white-space: nowrap;
          }
          .items td {
            padding: 0.35mm 0;
            vertical-align: top;
            font-size: 13px;
            font-weight: 800;
          }
          .items .qty { width: 12%; }
          .items .name { width: 58%; padding-left: 2mm; }
          .items .amount { width: 30%; text-align: right; padding-right: 1mm; }
          .totals td {
            padding: 0.35mm 0;
            font-size: 13px;
            vertical-align: top;
            font-weight: 900;
          }
          .totals td:first-child {
            width: 68%;
            padding-left: 18%;
            white-space: nowrap;
          }
          .totals td:last-child {
            width: 32%;
            text-align: right;
            padding-right: 1mm;
          }
          .totals .grand td {
            font-size: 15px;
            font-weight: 900;
          }
          .footer-meta {
            margin-top: 0.8mm;
            font-size: 13px;
            line-height: 1.18;
            font-weight: 800;
          }
          .footer-meta div { margin-top: 0.4mm; }
          .footer {
            margin-top: 1.8mm;
            text-align: center;
            font-size: 17px;
            font-weight: 900;
            font-family: "Arial Black", Arial, sans-serif;
          }
        </style>
      </head>
      <body>
        <div class="center venue">${escapeHtml(receipt.venueName || '1383 Karaoke Bar')}</div>
        <div class="center subhead">
          <div class="thanks">Thank you for coming!</div>
          <div>${escapeHtml(receipt.venueAddress || '1383 Clyde Ave')}</div>
          <div>${escapeHtml(receipt.venuePhone || '(613) 867-1383')}</div>
        </div>
        <table class="meta">
          <tr><td class="label">Waiter:</td><td class="value">${escapeHtml(receipt.waiter || '-')}</td></tr>
          ${showCustomerLine ? `<tr><td class="label">Guest:</td><td class="value">${escapeHtml(receipt.customerName || '-')}</td></tr>` : ''}
          <tr><td class="label">Serial:</td><td class="value">${escapeHtml(receipt.serial || '-')}</td></tr>
          <tr><td class="label">CHK:</td><td class="value">${escapeHtml(receipt.chk || '-')}</td></tr>
          <tr><td class="label">Open at:</td><td class="value">${escapeHtml(formatReceiptDateTime(receipt.openAt || '-'))}</td></tr>
        </table>
        <div class="divider">${separator}</div>
        <table class="summary-line">
          <tr>
            <td>TBL:</td>
            <td>${escapeHtml(receipt.zoneLabel || '-')}</td>
            <td>GST:</td>
            <td>0</td>
          </tr>
        </table>
        <div class="divider">${separator}</div>
        <table class="items">
          ${itemsHtml}
        </table>
        <div class="divider">${separator}</div>
        <table class="totals">
          <tr><td>Subtotal:</td><td>${currency(receipt.subtotal)}</td></tr>
          <tr><td>Service Charge:</td><td>${currency(receipt.serviceCharge)}</td></tr>
          <tr><td>Tax:</td><td>${currency(receipt.tax)}</td></tr>
          <tr class="grand"><td>Total:</td><td>${currency(receipt.total)}</td></tr>
          ${paymentHtml}
        </table>
        <div class="divider">${separator}</div>
        <div class="footer-meta">
          <div>Printed at:&nbsp;&nbsp;&nbsp;&nbsp;${escapeHtml(formatReceiptDateTime(receipt.printedAt || '-'))}</div>
          <div>Times of Printing: 1</div>
        </div>
        <div class="footer">THANK YOU!</div>
      </body>
    </html>
  `;
}

async function getPrinters() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: printer.isDefault === true,
    status: printer.status,
  }));
}

async function printReceipt(payload = {}) {
  const receipt = payload.receipt || {};
  const printerName = typeof payload.printerName === 'string' ? payload.printerName.trim() : '';
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildReceiptHtml(receipt))}`);
    await new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName || undefined,
          margins: { marginType: 'none' },
          dpi: { horizontal: 203, vertical: 203 },
        },
        (success, failureReason) => {
          if (success) {
            resolve();
            return;
          }
          reject(new Error(failureReason || '打印失败'));
        },
      );
    });
    return { ok: true };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}

function nodeRequest(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        const contentType = res.headers['content-type'] || '';
        const isJson = String(contentType).includes('application/json');
        let data = { raw: text };

        if (isJson) {
          try {
            data = JSON.parse(text);
          } catch {
            data = {};
          }
        }

        resolve({
          ok: Number(res.statusCode || 0) >= 200 && Number(res.statusCode || 0) < 300,
          status: Number(res.statusCode || 0),
          data,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function requestRemote({ pathName, method = 'GET', headers = {}, body }) {
  const { baseUrl } = readConfig();
  const url = new URL(pathName, `${baseUrl}/`);
  return nodeRequest(url, { method, headers, body });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f4f1ea',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('config:get', async () => readConfig());
  ipcMain.handle('config:set', async (_event, nextConfig) => writeConfig(nextConfig || {}));
  ipcMain.handle('printer:list', async () => getPrinters());
  ipcMain.handle('printer:printReceipt', async (_event, payload) => printReceipt(payload || {}));
  ipcMain.handle('printer:getWorkerId', async () => ({ workerId: PRINT_WORKER_ID }));

  ipcMain.handle('remote:request', async (_event, request) => {
    return requestRemote(request || {});
  });

  ipcMain.handle('shell:openExternal', async (_event, targetUrl) => {
    if (typeof targetUrl === 'string' && targetUrl.trim()) {
      await shell.openExternal(targetUrl);
    }
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
