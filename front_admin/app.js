const ordersWrapEl = document.getElementById('ordersWrap');
const zoneTodoWrapEl = document.getElementById('zoneTodoWrap');
const statusFilterEl = document.getElementById('statusFilter');
const refreshBtnEl = document.getElementById('refreshBtn');
const lastUpdatedEl = document.getElementById('lastUpdated');
const soundToggleBtnEl = document.getElementById('soundToggleBtn');
const employeeLoginCardEl = document.getElementById('employeeLoginCard');
const employeeUsernameInputEl = document.getElementById('employeeUsernameInput');
const employeePasswordInputEl = document.getElementById('employeePasswordInput');
const employeeLoginBtnEl = document.getElementById('employeeLoginBtn');
const employeeLoginMsgEl = document.getElementById('employeeLoginMsg');
const currentEmployeeLabelEl = document.getElementById('currentEmployeeLabel');
const employeeLogoutBtnEl = document.getElementById('employeeLogoutBtn');
const zoneSessionDrawerEl = document.getElementById('zoneSessionDrawer');
const zoneSessionDrawerBackdropEl = document.getElementById('zoneSessionDrawerBackdrop');
const zoneSessionTitleEl = document.getElementById('zoneSessionTitle');
const zoneSessionMetaEl = document.getElementById('zoneSessionMeta');
const zoneSessionOrdersWrapEl = document.getElementById('zoneSessionOrdersWrap');
const zoneSessionCloseBtnEl = document.getElementById('zoneSessionCloseBtn');
const zoneSessionCheckoutBtnEl = document.getElementById('zoneSessionCheckoutBtn');
const writeQueueStatusEl = document.getElementById('writeQueueStatus');
const orderItemMenuModalEl = document.getElementById('orderItemMenuModal');
const orderItemMenuBackdropEl = document.getElementById('orderItemMenuBackdrop');
const orderItemMenuTitleEl = document.getElementById('orderItemMenuTitle');
const orderItemMenuListEl = document.getElementById('orderItemMenuList');
const orderItemMenuCloseBtnEl = document.getElementById('orderItemMenuCloseBtn');

const statusText = {
  new: '新单',
  preparing: '制作中',
  ready: '待上桌',
  served: '已完成',
  cancelled: '已取消',
};

const adminState = {
  zones: [],
  selectedZoneId: '',
  soundEnabled: false,
  audioCtx: null,
  lastNewCount: null,
  employeeToken: localStorage.getItem('employee_session_token') || '',
  employeeUsername: localStorage.getItem('employee_session_username') || '',
  writeQueue: null,
  zoneCustomerSettlements: {},
  menu: [],
  addItemOrderId: '',
};

function getEmployeeAuthHeaders() {
  if (!adminState.employeeToken) return {};
  return { 'X-Employee-Session': adminState.employeeToken };
}

async function employeeApiFetch(url, options = {}) {
  const merged = {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...getEmployeeAuthHeaders(),
    },
  };
  const res = await fetch(url, merged);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.requiresEmployeeLogin = data.requiresEmployeeLogin === true;
    throw err;
  }
  return data;
}

function updateEmployeeUiState() {
  const loggedIn = Boolean(adminState.employeeToken && adminState.employeeUsername);
  employeeLoginCardEl.hidden = loggedIn;
  currentEmployeeLabelEl.textContent = loggedIn
    ? `当前员工：${adminState.employeeUsername}`
    : '当前员工：未登录';
  employeeLogoutBtnEl.hidden = !loggedIn;
  if (!loggedIn) {
    ordersWrapEl.innerHTML = '<div class="card muted">请先员工登录。</div>';
    zoneTodoWrapEl.innerHTML = '<div class="muted">请先员工登录。</div>';
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function currency(value) {
  return `$${Number(value).toFixed(2)}`;
}

function encodeAttr(value) {
  return encodeURIComponent(String(value || ''));
}

function decodeAttr(value) {
  return decodeURIComponent(String(value || ''));
}

function canEditOrder(order) {
  return Boolean(order && !['served', 'cancelled'].includes(order.status));
}

function renderOrderItems(order, { inDrawer = false } = {}) {
  const editable = canEditOrder(order);
  return order.items
    .map((item) => `
      <li class="order-item-row ${item.served ? 'item-served-row' : ''}">
        <div class="order-item-main">
          <span>${item.name} x ${item.quantity}</span>
          <span class="muted">(${currency(item.subtotal)})</span>
        </div>
        <div class="row wrap order-item-actions">
          <button
            type="button"
            class="${item.served ? 'light' : 'secondary'}"
            data-order-item-action="served"
            data-order-id="${order.id}"
            data-item-id="${item.itemId}"
            data-served-next="${item.served ? 'false' : 'true'}"
            ${editable ? '' : 'disabled'}
          >${item.served ? '改成未送' : '已送'}</button>
          <button
            type="button"
            class="light"
            data-order-item-action="quantity"
            data-order-id="${order.id}"
            data-item-id="${item.itemId}"
            data-delta="-1"
            ${editable && !item.served ? '' : 'disabled'}
          >-</button>
          <button
            type="button"
            class="light"
            data-order-item-action="quantity"
            data-order-id="${order.id}"
            data-item-id="${item.itemId}"
            data-delta="1"
            ${editable && !item.served ? '' : 'disabled'}
          >+</button>
        </div>
      </li>
    `)
    .join('');
}

function renderOrders(orders) {
  const visibleOrders = (orders || []).filter((order) => order.status !== 'served');

  if (!visibleOrders.length) {
    ordersWrapEl.innerHTML = '<div class="card muted">当前没有订单。</div>';
    return;
  }

  ordersWrapEl.innerHTML = visibleOrders
    .map((order) => {
      const statusClass = `status-${order.status}`;
      const editable = canEditOrder(order);
      const items = renderOrderItems(order);

      return `
        <article class="order-card">
          <div class="order-head">
            <strong>${order.zoneLabel}</strong>
            <span class="badge ${statusClass}">${statusText[order.status] || order.status}</span>
          </div>
          <div class="small muted">下单人：${order.customerName || 'Guest'}</div>
          <div class="small muted">接单员工：${order.handledByEmployeeUsername || '-'}</div>
          <div class="small muted">订单 ${order.id.slice(0, 8)} · ${formatTime(order.createdAt)}</div>
          <ul class="order-item-list">${items}</ul>
          <div><strong>合计 ${currency(order.total)}</strong></div>
          <div class="small">备注：${order.note || '无'}</div>
          <div class="row wrap" style="margin-top: 8px">
            <button data-order-action="status" data-id="${order.id}" data-status="preparing" class="secondary">制作中</button>
            <button data-order-action="status" data-id="${order.id}" data-status="ready">待上桌</button>
            <button data-order-action="status" data-id="${order.id}" data-status="served" class="light">完成</button>
            <button data-order-action="status" data-id="${order.id}" data-status="cancelled" class="warn">取消</button>
            <button data-order-action="add-item" data-id="${order.id}" class="light" ${editable ? '' : 'disabled'}>加菜</button>
          </div>
        </article>`;
    })
    .join('');
}

function renderZones(zones) {
  if (!zones.length) {
    zoneTodoWrapEl.innerHTML = '<div class="muted">还没有桌号/包厢，请去菜单管理页创建。</div>';
    return;
  }

  zoneTodoWrapEl.innerHTML = zones
    .map((zone) => {
      return `
      <div class="order-card zone-card-clickable" data-zone-open="${zone.id}">
        <div class="order-head">
          <strong class="zone-title">${zone.label}</strong>
          <span class="badge">${zone.activeOrderCount} 单</span>
        </div>
        <div class="zone-meta">访问码：${zone.accessCode || '----'}</div>
        <div class="zone-meta">当前未结金额：${currency(zone.activeOrderTotal || 0)}</div>
        <div class="row wrap" style="margin-top: 8px">
          <button class="warn" data-zone-action="checkout" data-id="${zone.id}">结单清零</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderWriteQueue(info) {
  if (!writeQueueStatusEl) return;
  if (!info || typeof info !== 'object') {
    writeQueueStatusEl.textContent = '写入队列：-';
    return;
  }
  const pending = Number(info.pending || 0);
  const processing = Boolean(info.processing);
  writeQueueStatusEl.textContent = `写入队列：待处理 ${pending} · ${processing ? '写入中' : '空闲'}`;
}

function renderAddItemMenu() {
  if (!orderItemMenuListEl) return;
  if (!adminState.menu.length) {
    orderItemMenuListEl.innerHTML = '<div class="card muted">当前没有可加的菜品。</div>';
    return;
  }

  orderItemMenuListEl.innerHTML = adminState.menu
    .map((item) => `
      <article class="order-card">
        <div class="order-head">
          <strong>${item.name}</strong>
          <span class="badge">${currency(item.price)}</span>
        </div>
        <div class="small muted">${item.category || 'Uncategorized'}</div>
        <div class="small muted">${item.description || '无描述'}</div>
        <div class="row wrap" style="margin-top:8px;">
          <button
            type="button"
            class="secondary"
            data-order-menu-action="add"
            data-menu-id="${item.id}"
          >加入订单</button>
        </div>
      </article>
    `)
    .join('');
}

async function openAddItemMenu(orderId) {
  adminState.addItemOrderId = orderId;
  if (!adminState.menu.length) {
    await loadEmployeeMenu();
  }
  const order = (await fetchAllActiveOrders()).find((item) => item.id === orderId);
  orderItemMenuTitleEl.textContent = order ? `给 ${order.customerName || order.zoneLabel} 加菜` : '选择加菜';
  renderAddItemMenu();
  orderItemMenuBackdropEl.hidden = false;
  orderItemMenuModalEl.classList.add('open');
  orderItemMenuModalEl.setAttribute('aria-hidden', 'false');
}

function closeAddItemMenu() {
  adminState.addItemOrderId = '';
  orderItemMenuModalEl.classList.remove('open');
  orderItemMenuModalEl.setAttribute('aria-hidden', 'true');
  orderItemMenuBackdropEl.hidden = true;
}

async function updateOrderStatus(orderId, status) {
  await employeeApiFetch(`/api/employee/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

async function updateOrderItemServed(orderId, itemId, served) {
  await employeeApiFetch(`/api/employee/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/served`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ served }),
  });
}

async function updateOrderItemQuantity(orderId, itemId, delta) {
  await employeeApiFetch(`/api/employee/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/quantity`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta }),
  });
}

async function addOrderMenuItem(orderId, menuId) {
  await employeeApiFetch(`/api/employee/orders/${encodeURIComponent(orderId)}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menuId }),
  });
}

async function updateZoneCompleted(zoneId, completed) {
  const res = await fetch(`/api/admin/zones/${encodeURIComponent(zoneId)}/completion`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '更新完成状态失败');
  }
}

async function checkoutZone(zoneId) {
  const res = await fetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/checkout`, {
    method: 'POST',
    headers: getEmployeeAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '结单失败');
  }
  return data;
}

async function fetchZoneCustomerSettlements(zoneId) {
  const data = await employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/customer-settlements`);
  return data?.settlements && typeof data.settlements === 'object' ? data.settlements : {};
}

async function setCustomerSettlement(zoneId, customerName, settled) {
  const data = await employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/customer-settlements`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName, settled }),
  });
  return data?.settlements && typeof data.settlements === 'object' ? data.settlements : {};
}

async function loadOrders() {
  const status = statusFilterEl.value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';

  const data = await employeeApiFetch(`/api/employee/orders${query}`);
  adminState.writeQueue = data.writeQueue || null;
  renderWriteQueue(adminState.writeQueue);

  renderOrders(Array.isArray(data.orders) ? data.orders : []);
}

async function loadZones() {
  const data = await employeeApiFetch('/api/employee/zones');

  adminState.zones = Array.isArray(data.zones) ? data.zones : [];
  renderZones(adminState.zones);
}

async function loadEmployeeMenu() {
  const data = await employeeApiFetch('/api/employee/menu');
  adminState.menu = Array.isArray(data.menu) ? data.menu : [];
}

async function fetchAllActiveOrders() {
  const data = await employeeApiFetch('/api/employee/orders');
  adminState.writeQueue = data.writeQueue || null;
  renderWriteQueue(adminState.writeQueue);
  return Array.isArray(data.orders) ? data.orders : [];
}

function updateSoundButton() {
  soundToggleBtnEl.textContent = adminState.soundEnabled ? 'Sound On' : 'Sound Off';
}

async function ensureAudioContextReady() {
  if (!adminState.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Browser does not support audio context.');
    adminState.audioCtx = new Ctx();
  }
  if (adminState.audioCtx.state !== 'running') {
    await adminState.audioCtx.resume();
  }
}

function playNewOrderBeep() {
  if (!adminState.soundEnabled || !adminState.audioCtx) return;
  const ctx = adminState.audioCtx;
  const now = ctx.currentTime;

  const tone = (at) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.18);
  };

  tone(now);
  tone(now + 0.22);
}

async function checkNewOrderAlert() {
  const data = await employeeApiFetch('/api/employee/orders?status=new');
  const count = Array.isArray(data.orders) ? data.orders.length : 0;

  if (adminState.lastNewCount === null) {
    adminState.lastNewCount = count;
    return;
  }

  if (count > adminState.lastNewCount) {
    playNewOrderBeep();
  }
  adminState.lastNewCount = count;
}

function getZoneById(zoneId) {
  return adminState.zones.find((z) => z.id === zoneId) || null;
}

function formatSessionOrders(zone, orders) {
  const periodStartMs = Date.parse(zone?.accessCodeUpdatedAt || zone?.createdAt || '');
  const safeStart = Number.isNaN(periodStartMs) ? 0 : periodStartMs;
  return orders
    .filter((order) => order.zoneId === zone.id)
    .filter((order) => {
      const createdMs = Date.parse(order.createdAt || '');
      return !Number.isNaN(createdMs) && createdMs >= safeStart;
    })
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
}

function renderZoneSessionOrders(zone, orders, settlements = {}) {
  if (!orders.length) {
    zoneSessionOrdersWrapEl.innerHTML = '<div class="card muted">该包厢当前 session 暂无订单。</div>';
    return;
  }
  const groups = new Map();
  for (const order of orders) {
    const key = order.customerName || 'Guest';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  }

  zoneSessionOrdersWrapEl.innerHTML = [...groups.entries()]
    .map(([customerName, customerOrders]) => {
      const settleInfo = settlements[customerName] || null;
      const isSettled = Boolean(settleInfo?.settled);
      const settledText = isSettled ? '已结' : '未结';
      const settledBy = isSettled && settleInfo?.updatedByEmployeeUsername ? `（${settleInfo.updatedByEmployeeUsername}）` : '';
      const settleButtonText = isSettled ? '改成未结' : '已结账';
      const ordersHtml = customerOrders
        .map((order) => {
          const items = renderOrderItems(order, { inDrawer: true });
          const editable = canEditOrder(order);
          return `
            <article class="order-card">
              <div class="order-head">
                <strong>#${order.id.slice(0, 8)}</strong>
                <span class="badge status-${order.status}">${statusText[order.status] || order.status}</span>
              </div>
              <div class="small muted">${formatTime(order.createdAt)}</div>
              <ul class="order-item-list">${items}</ul>
              <div><strong>合计 ${currency(order.total)}</strong></div>
              <div class="small">备注：${order.note || '无'}</div>
              <div class="row wrap" style="margin-top:8px;">
                <button type="button" class="light" data-order-action="add-item" data-id="${order.id}" ${editable ? '' : 'disabled'}>加菜</button>
              </div>
            </article>
          `;
        })
        .join('');

      return `
        <section class="card">
          <div class="row wrap" style="justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
            <h3 style="margin:0;">${customerName}</h3>
            <div class="row wrap" style="gap:8px;align-items:center;">
              <span class="small ${isSettled ? '' : 'muted'}">${settledText}${settledBy}</span>
              <button
                type="button"
                class="${isSettled ? 'light' : 'secondary'}"
                data-zone-session-action="toggle-settlement"
                data-customer-name-encoded="${encodeAttr(customerName)}"
                data-settled-next="${isSettled ? 'false' : 'true'}"
              >${settleButtonText}</button>
            </div>
          </div>
          <div class="grid" style="margin-top:0;">${ordersHtml}</div>
        </section>
      `;
    })
    .join('');
}

function openZoneSessionDrawer(zone) {
  adminState.selectedZoneId = zone.id;
  zoneSessionTitleEl.textContent = `${zone.label} 当前 Session`;
  zoneSessionMetaEl.textContent = `访问码：${zone.accessCode || '----'}`;
  zoneSessionOrdersWrapEl.innerHTML = '<div class="card muted">加载中...</div>';
  zoneSessionDrawerBackdropEl.hidden = false;
  zoneSessionDrawerEl.classList.add('open');
  zoneSessionDrawerEl.setAttribute('aria-hidden', 'false');
  refreshZoneSessionDrawer().catch((error) => {
    zoneSessionOrdersWrapEl.innerHTML = `<div class="card">加载失败：${error.message}</div>`;
  });
}

function closeZoneSessionDrawer() {
  adminState.selectedZoneId = '';
  zoneSessionDrawerEl.classList.remove('open');
  zoneSessionDrawerEl.setAttribute('aria-hidden', 'true');
  zoneSessionDrawerBackdropEl.hidden = true;
}

async function refreshZoneSessionDrawer() {
  if (!adminState.selectedZoneId) return;
  const zone = getZoneById(adminState.selectedZoneId);
  if (!zone) {
    closeZoneSessionDrawer();
    return;
  }
  zoneSessionTitleEl.textContent = `${zone.label} 当前 Session`;
  zoneSessionMetaEl.textContent = `访问码：${zone.accessCode || '----'}`;
  const [orders, settlements] = await Promise.all([
    fetchAllActiveOrders(),
    fetchZoneCustomerSettlements(zone.id),
  ]);
  adminState.zoneCustomerSettlements = settlements;
  const sessionOrders = formatSessionOrders(zone, orders);
  renderZoneSessionOrders(zone, sessionOrders, settlements);
}

async function loadAll() {
  if (!adminState.employeeToken) {
    updateEmployeeUiState();
    return;
  }
  try {
    await Promise.all([loadOrders(), loadZones()]);
    await checkNewOrderAlert();
    await refreshZoneSessionDrawer();
    lastUpdatedEl.textContent = `最近刷新: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (error.requiresEmployeeLogin) {
      adminState.employeeToken = '';
      adminState.employeeUsername = '';
      localStorage.removeItem('employee_session_token');
      localStorage.removeItem('employee_session_username');
      updateEmployeeUiState();
      return;
    }
    ordersWrapEl.innerHTML = `<div class="card">加载失败：${error.message}</div>`;
  }
}

async function employeeLogin() {
  const username = String(employeeUsernameInputEl.value || '').trim();
  const password = String(employeePasswordInputEl.value || '').trim();
  if (!username || !password) {
    employeeLoginMsgEl.textContent = '请输入用户名和密码。';
    return;
  }
  employeeLoginBtnEl.disabled = true;
  employeeLoginMsgEl.textContent = '登录中...';
  try {
    const data = await employeeApiFetch('/api/employee/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    adminState.employeeToken = data.token || '';
    adminState.employeeUsername = data.employee?.username || username;
    localStorage.setItem('employee_session_token', adminState.employeeToken);
    localStorage.setItem('employee_session_username', adminState.employeeUsername);
    employeePasswordInputEl.value = '';
    employeeLoginMsgEl.textContent = '登录成功。';
    updateEmployeeUiState();
    await loadAll();
  } catch (error) {
    employeeLoginMsgEl.textContent = `登录失败：${error.message}`;
  } finally {
    employeeLoginBtnEl.disabled = false;
  }
}

async function employeeLogout() {
  try {
    if (adminState.employeeToken) {
      await employeeApiFetch('/api/employee/auth/logout', { method: 'POST' });
    }
  } catch {
    // ignore
  }
  adminState.employeeToken = '';
  adminState.employeeUsername = '';
  localStorage.removeItem('employee_session_token');
  localStorage.removeItem('employee_session_username');
  updateEmployeeUiState();
}

ordersWrapEl.addEventListener('click', async (event) => {
  const itemButton = event.target.closest('button[data-order-item-action]');
  if (itemButton) {
    const orderId = itemButton.dataset.orderId;
    const itemId = itemButton.dataset.itemId;
    try {
      if (itemButton.dataset.orderItemAction === 'served') {
        await updateOrderItemServed(orderId, itemId, itemButton.dataset.servedNext === 'true');
      }
      if (itemButton.dataset.orderItemAction === 'quantity') {
        await updateOrderItemQuantity(orderId, itemId, Number(itemButton.dataset.delta));
      }
      await loadAll();
    } catch (error) {
      alert(`更新失败：${error.message}`);
    }
    return;
  }

  const button = event.target.closest('button[data-order-action]');
  if (!button) return;

  const orderId = button.dataset.id;
  const status = button.dataset.status;

  try {
    if (button.dataset.orderAction === 'add-item') {
      await openAddItemMenu(orderId);
      return;
    }
    await updateOrderStatus(orderId, status);
    await loadAll();
  } catch (error) {
    alert(`更新失败：${error.message}`);
  }
});

zoneTodoWrapEl.addEventListener('click', async (event) => {
  const zoneCard = event.target.closest('[data-zone-open]');
  if (zoneCard && !event.target.closest('button[data-zone-action]')) {
    const zoneId = zoneCard.dataset.zoneOpen;
    const zone = getZoneById(zoneId);
    if (zone) openZoneSessionDrawer(zone);
    return;
  }

  const button = event.target.closest('button[data-zone-action]');
  if (!button) return;

  const action = button.dataset.zoneAction;
  const zoneId = button.dataset.id;

  try {
    if (action === 'checkout') {
      const ok = confirm('结单后该桌/包厢的订单会自动删除清零，确认吗？');
      if (!ok) return;
      const result = await checkoutZone(zoneId);
      alert(`结单完成，已清空 ${result.clearedOrders} 笔订单。`);
      await loadAll();
    }
  } catch (error) {
    alert(`操作失败：${error.message}`);
  }
});

zoneSessionCloseBtnEl.addEventListener('click', closeZoneSessionDrawer);
zoneSessionDrawerBackdropEl.addEventListener('click', closeZoneSessionDrawer);
orderItemMenuCloseBtnEl.addEventListener('click', closeAddItemMenu);
orderItemMenuBackdropEl.addEventListener('click', closeAddItemMenu);

zoneSessionOrdersWrapEl.addEventListener('click', async (event) => {
  const itemButton = event.target.closest('button[data-order-item-action]');
  if (itemButton) {
    const orderId = itemButton.dataset.orderId;
    const itemId = itemButton.dataset.itemId;
    try {
      if (itemButton.dataset.orderItemAction === 'served') {
        await updateOrderItemServed(orderId, itemId, itemButton.dataset.servedNext === 'true');
      }
      if (itemButton.dataset.orderItemAction === 'quantity') {
        await updateOrderItemQuantity(orderId, itemId, Number(itemButton.dataset.delta));
      }
      await loadAll();
    } catch (error) {
      alert(`更新失败：${error.message}`);
    }
    return;
  }

  const addItemButton = event.target.closest('button[data-order-action="add-item"]');
  if (addItemButton) {
    try {
      await openAddItemMenu(addItemButton.dataset.id);
    } catch (error) {
      alert(`打开加菜失败：${error.message}`);
    }
    return;
  }

  const button = event.target.closest('button[data-zone-session-action="toggle-settlement"]');
  if (!button) return;
  const zoneId = adminState.selectedZoneId;
  if (!zoneId) return;

  const customerName = decodeURIComponent(String(button.dataset.customerNameEncoded || '')).trim();
  const settledNext = button.dataset.settledNext === 'true';
  if (!customerName) return;

  button.disabled = true;
  try {
    const settlements = await setCustomerSettlement(zoneId, customerName, settledNext);
    adminState.zoneCustomerSettlements = settlements;
    const zone = getZoneById(zoneId);
    if (!zone) return;
    const orders = await fetchAllActiveOrders();
    const sessionOrders = formatSessionOrders(zone, orders);
    renderZoneSessionOrders(zone, sessionOrders, settlements);
  } catch (error) {
    alert(`更新结账状态失败：${error.message}`);
    button.disabled = false;
  }
});

orderItemMenuListEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-order-menu-action="add"]');
  if (!button) return;
  if (!adminState.addItemOrderId) return;

  try {
    await addOrderMenuItem(adminState.addItemOrderId, button.dataset.menuId);
    closeAddItemMenu();
    await loadAll();
  } catch (error) {
    alert(`加菜失败：${error.message}`);
  }
});

zoneSessionCheckoutBtnEl.addEventListener('click', async () => {
  const zoneId = adminState.selectedZoneId;
  if (!zoneId) return;
  const ok = confirm('结单后该桌/包厢的订单会自动删除清零，确认吗？');
  if (!ok) return;
  try {
    const result = await checkoutZone(zoneId);
    alert(`结单完成，已清空 ${result.clearedOrders} 笔订单。`);
    closeZoneSessionDrawer();
    await loadAll();
  } catch (error) {
    alert(`操作失败：${error.message}`);
  }
});

refreshBtnEl.addEventListener('click', loadAll);
statusFilterEl.addEventListener('change', loadAll);
soundToggleBtnEl.addEventListener('click', async () => {
  try {
    if (!adminState.soundEnabled) {
      await ensureAudioContextReady();
      adminState.soundEnabled = true;
      playNewOrderBeep();
    } else {
      adminState.soundEnabled = false;
    }
    updateSoundButton();
  } catch (error) {
    alert(`无法启用提示音：${error.message}`);
  }
});

updateSoundButton();
employeeLoginBtnEl.addEventListener('click', employeeLogin);
employeePasswordInputEl.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    await employeeLogin();
  }
});
employeeLogoutBtnEl.addEventListener('click', employeeLogout);

updateEmployeeUiState();
(async () => {
  if (adminState.employeeToken) {
    try {
      const data = await employeeApiFetch('/api/employee/auth/me');
      adminState.employeeUsername = data.employee?.username || adminState.employeeUsername;
      localStorage.setItem('employee_session_username', adminState.employeeUsername);
      updateEmployeeUiState();
      await loadAll();
    } catch {
      await employeeLogout();
    }
  } else {
    updateEmployeeUiState();
  }
})();
setInterval(loadAll, 5000);
