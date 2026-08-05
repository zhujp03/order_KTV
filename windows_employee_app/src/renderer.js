const statusText = {
  new: '新单',
  preparing: '制作中',
  ready: '待上桌',
  served: '已完成',
  cancelled: '已取消',
};

const configSavedMsgEl = document.getElementById('configSavedMsg');
const baseUrlInputEl = document.getElementById('baseUrlInput');
const saveConfigBtnEl = document.getElementById('saveConfigBtn');
const testConfigBtnEl = document.getElementById('testConfigBtn');
const printerSelectEl = document.getElementById('printerSelect');
const refreshPrintersBtnEl = document.getElementById('refreshPrintersBtn');
const printerStatusEl = document.getElementById('printerStatus');
const openSiteBtnEl = document.getElementById('openSiteBtn');
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
const newOrderAudioEl = document.getElementById('newOrderAudio');

const storage = {
  get employeeToken() {
    return localStorage.getItem('employee_session_token') || '';
  },
  set employeeToken(value) {
    if (value) {
      localStorage.setItem('employee_session_token', value);
    } else {
      localStorage.removeItem('employee_session_token');
    }
  },
  get employeeUsername() {
    return localStorage.getItem('employee_session_username') || '';
  },
  set employeeUsername(value) {
    if (value) {
      localStorage.setItem('employee_session_username', value);
    } else {
      localStorage.removeItem('employee_session_username');
    }
  },
  get employeeDisplayName() {
    return localStorage.getItem('employee_session_display_name') || '';
  },
  set employeeDisplayName(value) {
    if (value) {
      localStorage.setItem('employee_session_display_name', value);
    } else {
      localStorage.removeItem('employee_session_display_name');
    }
  },
};

const state = {
  zones: [],
  selectedZoneId: '',
  soundEnabled: false,
  lastNewCount: null,
  employeeToken: storage.employeeToken,
  employeeUsername: storage.employeeUsername,
  employeeDisplayName: storage.employeeDisplayName,
  writeQueue: null,
  zoneCustomerSettlements: {},
  zoneCheckoutStatus: null,
  menu: [],
  addItemOrderId: '',
  baseUrl: '',
  printerName: '',
  printers: [],
  printWorkerId: '',
  processingRemotePrintJobs: false,
};

function setSavedMessage(message) {
  configSavedMsgEl.textContent = message;
  if (message) {
    window.setTimeout(() => {
      if (configSavedMsgEl.textContent === message) {
        configSavedMsgEl.textContent = '';
      }
    }, 2400);
  }
}

function getEmployeeAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (state.employeeToken) {
    headers['X-Employee-Session'] = state.employeeToken;
  }
  return headers;
}

async function apiFetch(pathName, options = {}) {
  const response = await window.desktopApi.request({
    pathName,
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
  });
  if (!response.ok) {
    const err = new Error(response?.data?.error || `HTTP ${response.status}`);
    err.requiresEmployeeLogin = response?.data?.requiresEmployeeLogin === true || response.status === 401;
    throw err;
  }
  return response.data || {};
}

async function employeeApiFetch(pathName, options = {}) {
  return apiFetch(pathName, {
    ...options,
    headers: getEmployeeAuthHeaders(options.headers || {}),
  });
}

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function encodeAttr(value) {
  return encodeURIComponent(String(value || ''));
}

function canEditOrder(order) {
  return Boolean(order && !['served', 'cancelled'].includes(order.status));
}

function orderCreatedAtMs(order) {
  const createdMs = Date.parse(order?.createdAt || '');
  return Number.isNaN(createdMs) ? 0 : createdMs;
}

function sortOrdersFifo(orders = []) {
  return [...orders].sort((a, b) => {
    const createdDiff = orderCreatedAtMs(a) - orderCreatedAtMs(b);
    if (createdDiff !== 0) return createdDiff;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function renderWriteQueue(info) {
  if (!info || typeof info !== 'object') {
    writeQueueStatusEl.textContent = '写入队列：-';
    return;
  }
  const pending = Number(info.pending || 0);
  writeQueueStatusEl.textContent = `写入队列：待处理 ${pending} · ${info.processing ? '写入中' : '空闲'}`;
}

function renderOrderItems(order) {
  const editable = canEditOrder(order);
  return (order.items || [])
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
  const requestedStatus = String(statusFilterEl?.value || '');
  const showTerminalOnly = requestedStatus === 'served' || requestedStatus === 'cancelled';
  const visibleOrders = sortOrdersFifo((orders || []).filter((order) => (
    showTerminalOnly ? order.status === requestedStatus : !['served', 'cancelled'].includes(order.status)
  )));
  if (!visibleOrders.length) {
    ordersWrapEl.innerHTML = '<div class="order-card muted">当前没有活动订单。</div>';
    return;
  }

  ordersWrapEl.innerHTML = visibleOrders.map((order, index) => `
    <article class="order-card">
      <div class="order-head">
        <strong>${order.zoneLabel}${showTerminalOnly ? '' : ` · 优先级 ${index + 1}`}</strong>
        <span class="badge status-${order.status}">${statusText[order.status] || order.status}</span>
      </div>
      <div class="small muted">下单人：${order.customerName || 'Guest'}</div>
      <div class="small muted">接单员工：${order.handledByEmployeeUsername || '-'}</div>
      <div class="small muted">订单 ${order.id.slice(0, 8)} · ${formatTime(order.createdAt)}</div>
      <ul class="order-item-list">${renderOrderItems(order)}</ul>
      <div><strong>合计 ${currency(order.total)}</strong></div>
      <div class="small">备注：${order.note || '无'}</div>
      <div class="row wrap" style="margin-top: 8px">
        <button data-order-action="status" data-id="${order.id}" data-status="preparing" class="secondary">制作中</button>
        <button data-order-action="status" data-id="${order.id}" data-status="ready">待上桌</button>
        <button data-order-action="status" data-id="${order.id}" data-status="served" class="light">完成</button>
        <button data-order-action="status" data-id="${order.id}" data-status="cancelled" class="warn">取消</button>
        <button data-order-action="add-item" data-id="${order.id}" class="light" ${canEditOrder(order) ? '' : 'disabled'}>加菜</button>
      </div>
    </article>
  `).join('');
}

function renderZones(zones) {
  if (!zones.length) {
    zoneTodoWrapEl.innerHTML = '<div class="order-card muted">还没有包厢或桌号。</div>';
    return;
  }

  zoneTodoWrapEl.innerHTML = zones.map((zone) => {
    const unsettledCount = Number(zone.unsettledCustomerCount || 0);
    const canCheckout = zone.canCheckout !== false;
    const billingMode = zone.billingMode === 'merged' ? 'merged' : 'split';
    const sessionOpen = zone.sessionOpen === true;
    const checkoutHint = !sessionOpen
      ? '当前未开台，顾客扫码后暂不可点单'
      : (canCheckout
        ? (billingMode === 'merged' ? '合单模式，可直接整桌结单' : '所有顾客已结，可结单清零')
        : `还有 ${unsettledCount} 人未结，暂不可结单`);
    return `
      <div class="order-card zone-card-clickable" data-zone-open="${zone.id}">
        <div class="order-head">
          <strong class="zone-title">${zone.label}</strong>
          <span class="badge">${zone.activeOrderCount} 单</span>
        </div>
        <div class="zone-meta">访问码：${zone.accessCode || '----'}</div>
        <div class="zone-meta">当前未结金额：${currency(zone.activeOrderTotal || 0)}</div>
        <div class="zone-meta">当前状态：${sessionOpen ? '已开台' : '未开台'}</div>
        <div class="zone-meta">当前结账模式：${billingMode === 'merged' ? '合单' : '分单'}</div>
        <div class="zone-meta">${checkoutHint}</div>
        <div class="row wrap" style="margin-top: 8px">
          <button class="${sessionOpen ? 'warn' : 'secondary'}" data-zone-action="${sessionOpen ? 'checkout' : 'open-session'}" data-id="${zone.id}" ${sessionOpen && !canCheckout ? 'disabled' : ''}>${sessionOpen ? '结单清零' : '开台'}</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAddItemMenu() {
  if (!state.menu.length) {
    orderItemMenuListEl.innerHTML = '<div class="order-card muted">当前没有可加菜品。</div>';
    return;
  }

  orderItemMenuListEl.innerHTML = state.menu.map((item) => `
    <article class="order-card">
      <div class="order-head">
        <strong>${item.name}</strong>
        <span class="badge">${currency(item.price)}</span>
      </div>
      <div class="small muted">${item.category || 'Uncategorized'}</div>
      <div class="small muted">${item.description || '无描述'}</div>
      <div class="row wrap" style="margin-top:8px;">
        <button type="button" class="secondary" data-order-menu-action="add" data-menu-id="${item.id}">加入订单</button>
      </div>
    </article>
  `).join('');
}

function getZoneById(zoneId) {
  return state.zones.find((zone) => zone.id === zoneId) || null;
}

function billingModeLabel(mode) {
  return mode === 'merged' ? '合单' : '分单';
}

function buildZoneMetaText(zone, checkoutStatus) {
  const billingMode = checkoutStatus?.billingMode === 'merged' ? 'merged' : 'split';
  const sessionOpen = checkoutStatus?.sessionOpen === true;
  const base = `访问码：${zone?.accessCode || '----'} · ${sessionOpen ? '已开台' : '未开台'} · 当前模式：${billingModeLabel(billingMode)}`;
  if (!sessionOpen) {
    return `${base} · 顾客需等待员工开台后才能扫码点单`;
  }
  if (billingMode === 'merged') {
    return `${base} · 整桌统一结账`;
  }
  const unsettledNames = Array.isArray(checkoutStatus?.unsettledCustomerNames)
    ? checkoutStatus.unsettledCustomerNames.filter(Boolean)
    : [];
  return unsettledNames.length ? `${base} · 未结：${unsettledNames.join('、')}` : `${base} · 所有人已结`;
}

function updateEmployeeUiState() {
  const loggedIn = Boolean(state.employeeToken && state.employeeUsername);
  employeeLoginCardEl.hidden = loggedIn;
  currentEmployeeLabelEl.textContent = loggedIn
    ? `当前员工：${state.employeeDisplayName || state.employeeUsername}`
    : '当前员工：未登录';
  employeeLogoutBtnEl.hidden = !loggedIn;
  if (!loggedIn) {
    ordersWrapEl.innerHTML = '<div class="order-card muted">请先登录员工账号。</div>';
    zoneTodoWrapEl.innerHTML = '<div class="order-card muted">请先登录员工账号。</div>';
  }
}

function clearEmployeeSession() {
  state.employeeToken = '';
  state.employeeUsername = '';
  state.employeeDisplayName = '';
  storage.employeeToken = '';
  storage.employeeUsername = '';
  storage.employeeDisplayName = '';
  state.selectedZoneId = '';
  state.zoneCustomerSettlements = {};
  state.zoneCheckoutStatus = null;
  state.lastNewCount = null;
  closeZoneSessionDrawer();
  closeAddItemMenu();
  updateEmployeeUiState();
}

function renderPrinterOptions() {
  const printers = Array.isArray(state.printers) ? state.printers : [];
  const current = state.printerName || '';
  const options = [
    '<option value="">系统默认打印机</option>',
    ...printers.map((printer) => `
      <option value="${printer.name}" ${printer.name === current ? 'selected' : ''}>
        ${printer.displayName || printer.name}${printer.isDefault ? '（默认）' : ''}
      </option>
    `),
  ];
  printerSelectEl.innerHTML = options.join('');
  printerStatusEl.textContent = printers.length
    ? `打印机：已加载 ${printers.length} 台`
    : '打印机：未发现设备';
}

function applyZoneCheckoutStatus(zoneId, checkoutStatus) {
  state.zones = state.zones.map((zone) => {
    if (zone.id !== zoneId) return zone;
    return {
      ...zone,
      billingMode: checkoutStatus.billingMode === 'merged' ? 'merged' : 'split',
      sessionOpen: checkoutStatus.sessionOpen === true,
      canCheckout: checkoutStatus.canCheckout !== false,
      unsettledCustomerCount: Number(checkoutStatus.unsettledCustomerCount || 0),
    };
  });
  renderZones(state.zones);
}

function formatSessionOrders(zone, orders, periodStartAt = '') {
  const periodStartMs = Date.parse(periodStartAt || zone?.accessCodeUpdatedAt || zone?.createdAt || '');
  const safeStart = Number.isNaN(periodStartMs) ? 0 : periodStartMs;
  return sortOrdersFifo((orders || [])
    .filter((order) => order.zoneId === zone.id)
    .filter((order) => {
      const createdMs = Date.parse(order.createdAt || '');
      return !Number.isNaN(createdMs) && createdMs >= safeStart;
    }));
}

function renderZoneSessionOrders(zone, orders, settlements = {}, checkoutStatus = null) {
  const billingMode = checkoutStatus?.billingMode === 'merged' ? 'merged' : 'split';
  const sessionOpen = checkoutStatus?.sessionOpen === true;
  const modeCard = `
    <section class="order-card">
      <div class="section-head">
        <div>
          <h3>当前状态：${sessionOpen ? '已开台' : '未开台'}</h3>
          <div class="small muted">${sessionOpen ? (billingMode === 'merged' ? '整桌统一结账，打印整桌合单。' : '按顾客分单，全部已结后才可结单。') : '顾客扫码后会先看到“未开台”，员工点击开台后才可进入当前 session。'}</div>
        </div>
        <div class="row wrap">
          ${sessionOpen && billingMode === 'merged' ? '<button type="button" class="light" data-zone-session-action="print-merged-receipt">打印整桌小票</button>' : ''}
          ${sessionOpen ? `
            <button
              type="button"
              class="light"
              data-zone-session-action="toggle-billing-mode"
              data-billing-mode-next="${billingMode === 'merged' ? 'split' : 'merged'}"
            >${billingMode === 'merged' ? '改成分单' : '改成合单'}</button>
          ` : `
            <button
              type="button"
              class="secondary"
              data-zone-session-action="open-session"
            >开台</button>
          `}
        </div>
      </div>
    </section>
  `;
  if (!orders.length) {
    zoneSessionOrdersWrapEl.innerHTML = `${modeCard}<div class="order-card muted">该包厢当前 session 暂无订单。</div>`;
    return;
  }
  if (billingMode === 'merged') {
    const ordersHtml = orders.map((order) => `
      <article class="order-card">
        <div class="order-head">
          <strong>${order.customerName || 'Guest'} · #${order.id.slice(0, 8)}</strong>
          <span class="badge status-${order.status}">${statusText[order.status] || order.status}</span>
        </div>
        <div class="small muted">${formatTime(order.createdAt)}</div>
        <ul class="order-item-list">${renderOrderItems(order)}</ul>
        <div><strong>合计 ${currency(order.total)}</strong></div>
        <div class="small">备注：${order.note || '无'}</div>
        <div class="row wrap" style="margin-top:8px;">
          <button type="button" class="light" data-order-action="add-item" data-id="${order.id}" ${canEditOrder(order) ? '' : 'disabled'}>加菜</button>
        </div>
      </article>
    `).join('');
    zoneSessionOrdersWrapEl.innerHTML = `${modeCard}<section class="order-card"><div class="grid">${ordersHtml}</div></section>`;
    return;
  }

  const groups = new Map();
  for (const order of orders) {
    const customerKey = (order.customerName || '').trim() || 'Guest';
    const existing = groups.get(customerKey) || {
      customerName: customerKey,
      customerLabel: (order.customerName || '').trim() || '未填写',
      orders: [],
    };
    existing.orders.push(order);
    groups.set(customerKey, existing);
  }

  zoneSessionOrdersWrapEl.innerHTML = modeCard + Array.from(groups.values()).map(({ customerName, customerLabel, orders: customerOrders }) => {
    const settleInfo = settlements[customerName] || null;
    const isSettled = Boolean(settleInfo?.settled);
    const settledBy = isSettled && settleInfo?.updatedByEmployeeUsername ? `（${settleInfo.updatedByEmployeeUsername}）` : '';
    const ordersHtml = customerOrders.map((order) => `
      <article class="order-card">
        <div class="order-head">
          <strong>#${order.id.slice(0, 8)}</strong>
          <span class="badge status-${order.status}">${statusText[order.status] || order.status}</span>
        </div>
        <div class="small muted">${formatTime(order.createdAt)}</div>
        <ul class="order-item-list">${renderOrderItems(order)}</ul>
        <div><strong>合计 ${currency(order.total)}</strong></div>
        <div class="small">备注：${order.note || '无'}</div>
        <div class="row wrap" style="margin-top:8px;">
          <button type="button" class="light" data-order-action="add-item" data-id="${order.id}" ${canEditOrder(order) ? '' : 'disabled'}>加菜</button>
        </div>
      </article>
    `).join('');

    return `
      <section class="order-card">
        <div class="section-head">
          <h3>${customerLabel}</h3>
          <div class="row wrap">
            <span class="small ${isSettled ? '' : 'muted'}">${isSettled ? '已结' : '未结'}${settledBy}</span>
            <button
              type="button"
              class="light"
              data-zone-session-action="print-receipt"
              data-customer-name-encoded="${encodeAttr(customerName)}"
            >打印小票</button>
            <button
              type="button"
              class="${isSettled ? 'light' : 'secondary'}"
              data-zone-session-action="toggle-settlement"
              data-customer-name-encoded="${encodeAttr(customerName)}"
              data-settled-next="${isSettled ? 'false' : 'true'}"
            >${isSettled ? '改成未结' : '已结账'}</button>
          </div>
        </div>
        <div class="grid">${ordersHtml}</div>
      </section>
    `;
  }).join('');
}

async function loadEmployeeMenu() {
  const data = await employeeApiFetch('/api/employee/menu');
  state.menu = Array.isArray(data.menu) ? data.menu : [];
}

async function fetchAllActiveOrders() {
  const data = await employeeApiFetch('/api/employee/orders');
  state.writeQueue = data.writeQueue || null;
  renderWriteQueue(state.writeQueue);
  return Array.isArray(data.orders) ? data.orders : [];
}

async function openAddItemMenu(orderId) {
  state.addItemOrderId = orderId;
  if (!state.menu.length) {
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
  state.addItemOrderId = '';
  orderItemMenuModalEl.classList.remove('open');
  orderItemMenuModalEl.setAttribute('aria-hidden', 'true');
  orderItemMenuBackdropEl.hidden = true;
}

function openZoneSessionDrawer(zone) {
  state.selectedZoneId = zone.id;
  zoneSessionTitleEl.textContent = `${zone.label} 当前 Session`;
  zoneSessionMetaEl.textContent = `访问码：${zone.accessCode || '----'}`;
  zoneSessionOrdersWrapEl.innerHTML = '<div class="order-card muted">加载中...</div>';
  zoneSessionCheckoutBtnEl.disabled = true;
  zoneSessionDrawerBackdropEl.hidden = false;
  zoneSessionDrawerEl.classList.add('open');
  zoneSessionDrawerEl.setAttribute('aria-hidden', 'false');
  refreshZoneSessionDrawer().catch((error) => {
    zoneSessionOrdersWrapEl.innerHTML = `<div class="order-card">加载失败：${error.message}</div>`;
  });
}

function closeZoneSessionDrawer() {
  state.selectedZoneId = '';
  state.zoneCustomerSettlements = {};
  state.zoneCheckoutStatus = null;
  zoneSessionDrawerEl.classList.remove('open');
  zoneSessionDrawerEl.setAttribute('aria-hidden', 'true');
  zoneSessionDrawerBackdropEl.hidden = true;
}

async function refreshZoneSessionDrawer() {
  if (!state.selectedZoneId) return;
  const zone = getZoneById(state.selectedZoneId);
  if (!zone) {
    closeZoneSessionDrawer();
    return;
  }
  const [orders, checkoutStatus] = await Promise.all([
    fetchAllActiveOrders(),
    employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zone.id)}/customer-settlements`),
  ]);
  const settlements = checkoutStatus?.settlements && typeof checkoutStatus.settlements === 'object'
    ? checkoutStatus.settlements
    : {};
  const unsettledNames = Array.isArray(checkoutStatus?.unsettledCustomerNames)
    ? checkoutStatus.unsettledCustomerNames.filter(Boolean)
    : [];
  state.zoneCustomerSettlements = settlements;
  state.zoneCheckoutStatus = {
    ...checkoutStatus,
    settlements,
    unsettledCustomerNames: unsettledNames,
    canCheckout: checkoutStatus?.canCheckout !== false,
  };
  applyZoneCheckoutStatus(zone.id, state.zoneCheckoutStatus);
  zoneSessionMetaEl.textContent = buildZoneMetaText(zone, state.zoneCheckoutStatus);
  zoneSessionCheckoutBtnEl.textContent = state.zoneCheckoutStatus.sessionOpen === true ? '结单清零' : '开台';
  zoneSessionCheckoutBtnEl.className = state.zoneCheckoutStatus.sessionOpen === true ? 'warn' : 'secondary';
  zoneSessionCheckoutBtnEl.disabled = state.zoneCheckoutStatus.sessionOpen === true ? state.zoneCheckoutStatus.canCheckout === false : false;
  renderZoneSessionOrders(zone, formatSessionOrders(zone, orders, state.zoneCheckoutStatus.periodStartAt), settlements, state.zoneCheckoutStatus);
}

async function loadOrders() {
  const status = statusFilterEl.value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await employeeApiFetch(`/api/employee/orders${query}`);
  state.writeQueue = data.writeQueue || null;
  renderWriteQueue(state.writeQueue);
  renderOrders(Array.isArray(data.orders) ? data.orders : []);
}

async function loadZones() {
  const data = await employeeApiFetch('/api/employee/zones');
  state.zones = Array.isArray(data.zones) ? data.zones : [];
  renderZones(state.zones);
}

async function checkNewOrderAlert() {
  const data = await employeeApiFetch('/api/employee/orders?status=new');
  const count = Array.isArray(data.orders) ? data.orders.length : 0;
  if (state.lastNewCount === null) {
    state.lastNewCount = count;
    return;
  }
  if (count > state.lastNewCount && state.soundEnabled) {
    try {
      newOrderAudioEl.currentTime = 0;
      await newOrderAudioEl.play();
    } catch {
      // ignore audio playback failure
    }
  }
  state.lastNewCount = count;
}

async function loadAll() {
  if (!state.employeeToken) {
    updateEmployeeUiState();
    return;
  }
  try {
    await Promise.all([loadOrders(), loadZones()]);
    await checkNewOrderAlert();
    await refreshZoneSessionDrawer();
    await processRemotePrintJobs();
    lastUpdatedEl.textContent = `最近刷新: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (error.requiresEmployeeLogin) {
      clearEmployeeSession();
      employeeLoginMsgEl.textContent = '登录已过期，请重新登录。';
      return;
    }
    ordersWrapEl.innerHTML = `<div class="order-card">加载失败：${error.message}</div>`;
  }
}

async function updateOrderStatus(orderId, status) {
  await employeeApiFetch(`/api/employee/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: getEmployeeAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  });
}

async function updateOrderItemServed(orderId, itemId, served) {
  await employeeApiFetch(`/api/employee/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/served`, {
    method: 'PATCH',
    headers: getEmployeeAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ served }),
  });
}

async function updateOrderItemQuantity(orderId, itemId, delta) {
  await employeeApiFetch(`/api/employee/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/quantity`, {
    method: 'PATCH',
    headers: getEmployeeAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ delta }),
  });
}

async function addOrderMenuItem(orderId, menuId) {
  await employeeApiFetch(`/api/employee/orders/${encodeURIComponent(orderId)}/items`, {
    method: 'POST',
    headers: getEmployeeAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ menuId }),
  });
}

async function checkoutZone(zoneId) {
  return employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/checkout`, {
    method: 'POST',
    headers: getEmployeeAuthHeaders(),
  });
}

async function setCustomerSettlement(zoneId, customerName, settled) {
  return employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/customer-settlements`, {
    method: 'PATCH',
    headers: getEmployeeAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ customerName, settled }),
  });
}

async function setZoneBillingMode(zoneId, billingMode) {
  return employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/billing-mode`, {
    method: 'PATCH',
    headers: getEmployeeAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ billingMode }),
  });
}

async function startZoneSession(zoneId) {
  return employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/open-session`, {
    method: 'POST',
    headers: getEmployeeAuthHeaders(),
  });
}

async function loadPrinters() {
  state.printers = await window.desktopApi.getPrinters();
  renderPrinterOptions();
}

async function savePrinterName(printerName) {
  const saved = await window.desktopApi.saveConfig({
    baseUrl: state.baseUrl,
    printerName,
  });
  state.baseUrl = saved.baseUrl || state.baseUrl;
  state.printerName = saved.printerName || '';
  baseUrlInputEl.value = state.baseUrl;
  renderPrinterOptions();
}

async function printCustomerReceipt(zoneId, customerName) {
  const data = await employeeApiFetch(
    `/api/employee/zones/${encodeURIComponent(zoneId)}/receipt?customerName=${encodeURIComponent(customerName)}`,
  );
  await window.desktopApi.printReceipt({
    receipt: data.receipt,
    printerName: state.printerName,
  });
}

async function claimRemotePrintJob() {
  return employeeApiFetch('/api/employee/print-jobs/claim', {
    method: 'POST',
    headers: getEmployeeAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ workerId: state.printWorkerId }),
  });
}

async function updateRemotePrintJob(jobId, status, errorMessage = '') {
  return employeeApiFetch(`/api/employee/print-jobs/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: getEmployeeAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ workerId: state.printWorkerId, status, errorMessage }),
  });
}

async function processRemotePrintJobs() {
  if (!state.employeeToken || !state.printWorkerId || state.processingRemotePrintJobs) return;
  state.processingRemotePrintJobs = true;
  try {
    while (state.employeeToken) {
      const claimed = await claimRemotePrintJob();
      const job = claimed?.job || null;
      if (!job) break;
      try {
        await window.desktopApi.printReceipt({
          receipt: job.receipt,
          printerName: state.printerName,
        });
        await updateRemotePrintJob(job.id, 'completed');
      } catch (error) {
        await updateRemotePrintJob(job.id, 'failed', error.message);
        printerStatusEl.textContent = `远程打印失败：${error.message}`;
        break;
      }
    }
  } finally {
    state.processingRemotePrintJobs = false;
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
    const data = await apiFetch('/api/employee/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    state.employeeToken = data.token || '';
    state.employeeUsername = data.employee?.username || username;
    state.employeeDisplayName = data.employee?.displayName || state.employeeUsername;
    storage.employeeToken = state.employeeToken;
    storage.employeeUsername = state.employeeUsername;
    storage.employeeDisplayName = state.employeeDisplayName;
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
    if (state.employeeToken) {
      await employeeApiFetch('/api/employee/auth/logout', { method: 'POST' });
    }
  } catch {
    // ignore
  }
  clearEmployeeSession();
}

async function saveBaseUrl() {
  const baseUrl = String(baseUrlInputEl.value || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    setSavedMessage('请输入服务地址');
    return;
  }
  const saved = await window.desktopApi.saveConfig({ baseUrl, printerName: state.printerName });
  state.baseUrl = saved.baseUrl;
  state.printerName = saved.printerName || state.printerName;
  baseUrlInputEl.value = saved.baseUrl;
  setSavedMessage('服务地址已保存');
}

async function testConnection() {
  testConfigBtnEl.disabled = true;
  try {
    await saveBaseUrl();
    const data = await apiFetch('/api/employee/menu');
    const menuCount = Array.isArray(data.menu) ? data.menu.length : 0;
    setSavedMessage(`连接成功，菜单 ${menuCount} 项`);
  } catch (error) {
    setSavedMessage(`连接失败：${error.message}`);
  } finally {
    testConfigBtnEl.disabled = false;
  }
}

ordersWrapEl.addEventListener('click', async (event) => {
  const itemButton = event.target.closest('button[data-order-item-action]');
  if (itemButton) {
    try {
      if (itemButton.dataset.orderItemAction === 'served') {
        await updateOrderItemServed(itemButton.dataset.orderId, itemButton.dataset.itemId, itemButton.dataset.servedNext === 'true');
      }
      if (itemButton.dataset.orderItemAction === 'quantity') {
        await updateOrderItemQuantity(itemButton.dataset.orderId, itemButton.dataset.itemId, Number(itemButton.dataset.delta));
      }
      await loadAll();
    } catch (error) {
      alert(`更新失败：${error.message}`);
    }
    return;
  }

  const button = event.target.closest('button[data-order-action]');
  if (!button) return;
  try {
    if (button.dataset.orderAction === 'add-item') {
      await openAddItemMenu(button.dataset.id);
      return;
    }
    await updateOrderStatus(button.dataset.id, button.dataset.status);
    await loadAll();
  } catch (error) {
    alert(`更新失败：${error.message}`);
  }
});

zoneTodoWrapEl.addEventListener('click', async (event) => {
  const zoneCard = event.target.closest('[data-zone-open]');
  if (zoneCard && !event.target.closest('button[data-zone-action]')) {
    const zone = getZoneById(zoneCard.dataset.zoneOpen);
    if (zone) openZoneSessionDrawer(zone);
    return;
  }
  const button = event.target.closest('button[data-zone-action]');
  if (!button) return;
  try {
    if (button.dataset.zoneAction === 'checkout') {
      const ok = confirm('结单后该包厢当前 session 的订单会被清空，确认吗？');
      if (!ok) return;
      const result = await checkoutZone(button.dataset.id);
      alert(`结单完成，已清空 ${result.clearedOrders} 笔订单。`);
      await loadAll();
      return;
    }
    if (button.dataset.zoneAction === 'open-session') {
      await startZoneSession(button.dataset.id);
      alert('已开台，顾客现在可以用现有二维码扫码进入。');
      await loadAll();
    }
  } catch (error) {
    alert(`操作失败：${error.message}`);
  }
});

zoneSessionOrdersWrapEl.addEventListener('click', async (event) => {
  const itemButton = event.target.closest('button[data-order-item-action]');
  if (itemButton) {
    try {
      if (itemButton.dataset.orderItemAction === 'served') {
        await updateOrderItemServed(itemButton.dataset.orderId, itemButton.dataset.itemId, itemButton.dataset.servedNext === 'true');
      }
      if (itemButton.dataset.orderItemAction === 'quantity') {
        await updateOrderItemQuantity(itemButton.dataset.orderId, itemButton.dataset.itemId, Number(itemButton.dataset.delta));
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

  const printButton = event.target.closest('button[data-zone-session-action="print-receipt"]');
  if (printButton && state.selectedZoneId) {
    try {
      const customerName = decodeURIComponent(String(printButton.dataset.customerNameEncoded || '')).trim();
      await printCustomerReceipt(state.selectedZoneId, customerName);
      alert(`已发送到打印机：${customerName} 的小票。`);
    } catch (error) {
      alert(`打印失败：${error.message}`);
    }
    return;
  }

  const mergedPrintButton = event.target.closest('button[data-zone-session-action="print-merged-receipt"]');
  if (mergedPrintButton && state.selectedZoneId) {
    try {
      await printCustomerReceipt(state.selectedZoneId, '');
      alert('已发送到打印机：整桌合单小票。');
    } catch (error) {
      alert(`打印失败：${error.message}`);
    }
    return;
  }

  const modeButton = event.target.closest('button[data-zone-session-action="toggle-billing-mode"]');
  if (modeButton && state.selectedZoneId) {
    try {
      const checkoutStatus = await setZoneBillingMode(state.selectedZoneId, modeButton.dataset.billingModeNext);
      const settlements = checkoutStatus?.settlements && typeof checkoutStatus.settlements === 'object'
        ? checkoutStatus.settlements
        : {};
      state.zoneCustomerSettlements = settlements;
      state.zoneCheckoutStatus = {
        ...checkoutStatus,
        settlements,
        unsettledCustomerNames: Array.isArray(checkoutStatus?.unsettledCustomerNames)
          ? checkoutStatus.unsettledCustomerNames.filter(Boolean)
          : [],
        canCheckout: checkoutStatus?.canCheckout !== false,
      };
      const zone = getZoneById(state.selectedZoneId);
      applyZoneCheckoutStatus(state.selectedZoneId, state.zoneCheckoutStatus);
      if (zone) {
        zoneSessionMetaEl.textContent = buildZoneMetaText(zone, state.zoneCheckoutStatus);
        zoneSessionCheckoutBtnEl.disabled = state.zoneCheckoutStatus.canCheckout === false;
        renderZoneSessionOrders(
          zone,
          formatSessionOrders(zone, await fetchAllActiveOrders(), state.zoneCheckoutStatus.periodStartAt),
          settlements,
          state.zoneCheckoutStatus,
        );
      }
    } catch (error) {
      alert(`切换结账模式失败：${error.message}`);
    }
    return;
  }

  const openButton = event.target.closest('button[data-zone-session-action="open-session"]');
  if (openButton && state.selectedZoneId) {
    try {
      await startZoneSession(state.selectedZoneId);
      alert('已开台，顾客现在可以用现有二维码扫码进入。');
      await refreshZoneSessionDrawer();
      await loadAll();
    } catch (error) {
      alert(`开台失败：${error.message}`);
    }
    return;
  }

  const settlementButton = event.target.closest('button[data-zone-session-action="toggle-settlement"]');
  if (!settlementButton || !state.selectedZoneId) return;
  try {
    const customerName = decodeURIComponent(String(settlementButton.dataset.customerNameEncoded || '')).trim();
    const checkoutStatus = await setCustomerSettlement(
      state.selectedZoneId,
      customerName,
      settlementButton.dataset.settledNext === 'true',
    );
    const settlements = checkoutStatus?.settlements && typeof checkoutStatus.settlements === 'object'
      ? checkoutStatus.settlements
      : {};
    state.zoneCustomerSettlements = settlements;
    state.zoneCheckoutStatus = {
      ...checkoutStatus,
      settlements,
      unsettledCustomerNames: Array.isArray(checkoutStatus?.unsettledCustomerNames)
        ? checkoutStatus.unsettledCustomerNames.filter(Boolean)
        : [],
      canCheckout: checkoutStatus?.canCheckout !== false,
    };
    const zone = getZoneById(state.selectedZoneId);
    applyZoneCheckoutStatus(state.selectedZoneId, state.zoneCheckoutStatus);
    if (zone) {
      zoneSessionMetaEl.textContent = buildZoneMetaText(zone, state.zoneCheckoutStatus);
      zoneSessionCheckoutBtnEl.disabled = state.zoneCheckoutStatus.canCheckout === false;
      renderZoneSessionOrders(
        zone,
        formatSessionOrders(zone, await fetchAllActiveOrders(), state.zoneCheckoutStatus.periodStartAt),
        settlements,
        state.zoneCheckoutStatus,
      );
    }
  } catch (error) {
    alert(`更新结账状态失败：${error.message}`);
  }
});

orderItemMenuListEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-order-menu-action="add"]');
  if (!button || !state.addItemOrderId) return;
  try {
    await addOrderMenuItem(state.addItemOrderId, button.dataset.menuId);
    closeAddItemMenu();
    await loadAll();
  } catch (error) {
    alert(`加菜失败：${error.message}`);
  }
});

zoneSessionCheckoutBtnEl.addEventListener('click', async () => {
  if (!state.selectedZoneId) return;
  try {
    const zone = getZoneById(state.selectedZoneId);
    if (zone?.sessionOpen === true) {
      const ok = confirm('结单后该包厢当前 session 的订单会被清空，确认吗？');
      if (!ok) return;
      const result = await checkoutZone(state.selectedZoneId);
      alert(`结单完成，已清空 ${result.clearedOrders} 笔订单。`);
      closeZoneSessionDrawer();
    } else {
      await startZoneSession(state.selectedZoneId);
      alert('已开台，顾客现在可以用现有二维码扫码进入。');
    }
    await loadAll();
  } catch (error) {
    alert(`操作失败：${error.message}`);
  }
});

saveConfigBtnEl.addEventListener('click', saveBaseUrl);
testConfigBtnEl.addEventListener('click', testConnection);
refreshPrintersBtnEl.addEventListener('click', async () => {
  try {
    await loadPrinters();
  } catch (error) {
    printerStatusEl.textContent = `打印机加载失败：${error.message}`;
  }
});
printerSelectEl.addEventListener('change', async () => {
  try {
    await savePrinterName(printerSelectEl.value);
    setSavedMessage(state.printerName ? '打印机已保存' : '已切换为系统默认打印机');
  } catch (error) {
    printerStatusEl.textContent = `打印机保存失败：${error.message}`;
  }
});
openSiteBtnEl.addEventListener('click', async () => {
  const config = await window.desktopApi.getConfig();
  await window.desktopApi.openExternal(config.baseUrl || state.baseUrl);
});
refreshBtnEl.addEventListener('click', loadAll);
statusFilterEl.addEventListener('change', loadAll);
soundToggleBtnEl.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  soundToggleBtnEl.textContent = state.soundEnabled ? '提示音开启' : '提示音关闭';
});
employeeLoginBtnEl.addEventListener('click', employeeLogin);
employeeLogoutBtnEl.addEventListener('click', employeeLogout);
employeePasswordInputEl.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    await employeeLogin();
  }
});
zoneSessionCloseBtnEl.addEventListener('click', closeZoneSessionDrawer);
zoneSessionDrawerBackdropEl.addEventListener('click', closeZoneSessionDrawer);
orderItemMenuCloseBtnEl.addEventListener('click', closeAddItemMenu);
orderItemMenuBackdropEl.addEventListener('click', closeAddItemMenu);

(async () => {
  const config = await window.desktopApi.getConfig();
  const worker = await window.desktopApi.getPrintWorkerId();
  state.baseUrl = config.baseUrl || '';
  state.printerName = config.printerName || '';
  state.printWorkerId = worker?.workerId || '';
  baseUrlInputEl.value = state.baseUrl;
  try {
    await loadPrinters();
  } catch (error) {
    printerStatusEl.textContent = `打印机加载失败：${error.message}`;
  }
  updateEmployeeUiState();
  if (state.employeeToken) {
    try {
      const data = await employeeApiFetch('/api/employee/auth/me');
      state.employeeUsername = data.employee?.username || state.employeeUsername;
      state.employeeDisplayName = data.employee?.displayName || state.employeeDisplayName || state.employeeUsername;
      storage.employeeUsername = state.employeeUsername;
      storage.employeeDisplayName = state.employeeDisplayName;
      updateEmployeeUiState();
      await loadAll();
    } catch {
      clearEmployeeSession();
    }
  }
})();

window.setInterval(loadAll, 5000);
