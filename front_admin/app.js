const ordersWrapEl = document.getElementById('ordersWrap');
const zoneTodoWrapEl = document.getElementById('zoneTodoWrap');
const statusFilterEl = document.getElementById('statusFilter');
const refreshBtnEl = document.getElementById('refreshBtn');
const lastUpdatedEl = document.getElementById('lastUpdated');
const soundToggleBtnEl = document.getElementById('soundToggleBtn');
const langToggleBtnEl = document.getElementById('langToggleBtn');
const employeeLoginCardEl = document.getElementById('employeeLoginCard');
const heroTitleEl = document.getElementById('heroTitle');
const heroSubtitleEl = document.getElementById('heroSubtitle');
const employeeLoginTitleEl = document.getElementById('employeeLoginTitle');
const employeeUsernameInputEl = document.getElementById('employeeUsernameInput');
const employeePasswordInputEl = document.getElementById('employeePasswordInput');
const employeeLoginBtnEl = document.getElementById('employeeLoginBtn');
const employeeLoginMsgEl = document.getElementById('employeeLoginMsg');
const currentEmployeeLabelEl = document.getElementById('currentEmployeeLabel');
const employeeLogoutBtnEl = document.getElementById('employeeLogoutBtn');
const zoneTodoTitleEl = document.getElementById('zoneTodoTitle');
const zoneTodoSubtitleEl = document.getElementById('zoneTodoSubtitle');
const ordersTitleEl = document.getElementById('ordersTitle');
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
const orderItemMenuSubtitleEl = document.getElementById('orderItemMenuSubtitle');
const orderItemMenuListEl = document.getElementById('orderItemMenuList');
const orderItemMenuCloseBtnEl = document.getElementById('orderItemMenuCloseBtn');

const LANG_STORAGE_KEY = 'employee_ui_language';

const I18N = {
  zh: {
    docTitle: 'Admin 接单',
    heroTitle: 'Admin 接单看板',
    heroSubtitle: '按照桌号/包厢实时接收订单，支持状态流转（新单 -> 制作中 -> 待上桌 -> 已完成）。',
    employeeLoginTitle: '员工登录',
    usernamePlaceholder: '用户名',
    passwordPlaceholder: '密码',
    loginBtn: '登录',
    currentEmployeeLoggedOut: '当前员工：未登录',
    currentEmployeePrefix: '当前员工：',
    statusFilter: '状态筛选',
    all: '全部',
    orderCountUnit: '单',
    new: '新单',
    preparing: '制作中',
    ready: '待上桌',
    served: '已完成',
    cancelled: '已取消',
    logout: '退出登录',
    close: '关闭',
    soundOff: 'Sound Off',
    soundOn: 'Sound On',
    refresh: '立即刷新',
    refreshed: '未刷新',
    zoneTodoTitle: '桌号 / 包厢待办',
    zoneTodoSubtitle: '显示当前包厢状态与访问码，可直接“结单清零”。',
    ordersTitle: '来单信息',
    writeQueuePrefix: '写入队列：',
    queueIdle: '空闲',
    queueWriting: '写入中',
    queuePending: '待处理',
    noOrders: '当前没有订单。',
    loginRequired: '请先员工登录。',
    accessCode: '访问码：',
    currentUnpaid: '当前未结金额：',
    currentState: '当前状态：',
    opened: '已开台',
    closed: '未开台',
    currentMode: '当前结账模式：',
    split: '分单',
    merged: '合单',
    canCheckoutMerged: '合单模式，可直接整桌结单',
    canCheckoutSplit: '所有顾客已结，可结单清零',
    notOpenedCheckout: '当前未开台，顾客扫码后暂不可点单',
    notOpenedSession: '当前未开台，请先开台',
    unsettledPrefix: '还有 {count} 人未结，暂不可结单',
    openSession: '开台',
    checkoutClear: '结单清零',
    sessionTitle: '当前 Session',
    loading: '加载中...',
    addDish: '加菜',
    chooseAddDish: '选择加菜',
    addDishHint: '点击菜品后会直接加到当前订单',
    noAddDish: '当前没有可加的菜品。',
    itemDescriptionNone: '无描述',
    noOrderNote: '无',
    notes: '备注：',
    customer: '下单人：',
    employee: '接单员工：',
    orderStatusNew: '新单',
    orderStatusPreparing: '制作中',
    orderStatusReady: '待上桌',
    orderStatusServed: '已完成',
    orderStatusCancelled: '已取消',
    serve: '已送',
    unserve: '改成未送',
    completeAction: '完成',
    cancelAction: '取消',
    addToOrder: '加入订单',
    guest: 'Guest',
    uncategorized: '未分类',
    loadingFailed: '加载失败：{msg}',
    currentSessionRoom: '{label} 当前 Session',
    accessCodeLabel: '访问码：{code}',
    customerLabel: '下单人：{name}',
    employeeLabel: '接单员工：{name}',
    orderLabel: '订单 {id} · {time}',
    noteLabel: '备注：{note}',
    totalLabel: '合计 {amount}',
    loadingText: '加载中...',
    addDishFor: '给 {name} 加菜',
    chooseDishForAdd: '选择加菜',
    noZones: '还没有桌号/包厢，请去菜单管理页创建。',
    currentSessionEmpty: '该包厢当前 session 暂无订单。',
    noCustomersToSettle: '未结名单：无，所有顾客已结',
    allSettled: '所有顾客已结',
    settledStatus: '已结',
    unsettledStatus: '未结',
    unsettledList: '未结名单：{names}',
    sessionStatusOpened: '已开台',
    sessionStatusClosed: '未开台',
    sessionOpenHelp: '顾客扫码后会先看到“未开台”，员工点击开台后才可进入当前 session。',
    mergedViewTitle: '整桌合单视图',
    printMergedReceipt: '打印整桌小票',
    printCustomerReceipt: '打印小票',
    addItemToOrder: '加菜',
    loginInProgress: '登录中...',
    loginSuccess: '登录成功。',
    loginFailed: '登录失败：{msg}',
    sessionExpired: '登录已过期，请重新登录',
    openSessionSuccess: '已开台，顾客现在可以用现有二维码扫码进入。',
    submitSuccess: '已提交',
    submitSuccessMerged: '整桌合单小票已发送到 Windows 打印队列。',
    submitSuccessCustomer: '{name} 的小票已发送到 Windows 打印队列。',
    printFailed: '打印失败',
    orderError: '订单列表',
    addItemFailed: '加菜失败',
    checkoutConfirm: '结单后该桌/包厢的订单会自动删除清零，确认吗？',
    checkoutDone: '结单完成，已清空 {count} 笔订单。',
    checkoutFailed: '结单失败',
    openSessionDone: '已开台，顾客现在可以用现有二维码扫码进入。',
    openSessionFailed: '开台失败：{msg}',
    settleFailed: '更新结账状态失败',
    modeFailed: '切换结账模式失败',
    loadMenuFailed: '读取菜单失败',
    loadStatusFailed: '读取结账状态失败',
    loadOrdersFailed: '当前没有订单。',
    openSessionBtn: '开台',
    toggleLang: '中文 / EN',
    checkoutButton: '结单清零',
    openSessionButton: '开台',
    sessionOpenModeHelp: '顾客扫码后会先看到“未开台”，员工点击开台后才可进入当前 session。',
    markUnsettled: '改成未结',
    markSettled: '已结账',
    printTaskSubmitted: '已提交',
    printTaskMerged: '整桌合单小票已发送到 Windows 打印队列。',
    printTaskCustomer: '{name} 的小票已发送到 Windows 打印队列。',
  },
  en: {
    docTitle: 'Admin Order Board',
    heroTitle: 'Admin Order Board',
    heroSubtitle: 'Receive orders in real time by table/room with status flow (New -> Preparing -> Ready -> Completed).',
    employeeLoginTitle: 'Staff Login',
    usernamePlaceholder: 'Username',
    passwordPlaceholder: 'Password',
    loginBtn: 'Log In',
    currentEmployeeLoggedOut: 'Current staff: not logged in',
    currentEmployeePrefix: 'Current staff: ',
    statusFilter: 'Status filter',
    all: 'All',
    orderCountUnit: 'orders',
    new: 'New',
    preparing: 'Preparing',
    ready: 'Ready',
    served: 'Completed',
    cancelled: 'Cancelled',
    logout: 'Log out',
    close: 'Close',
    soundOff: 'Sound Off',
    soundOn: 'Sound On',
    refresh: 'Refresh now',
    refreshed: 'Not refreshed yet',
    zoneTodoTitle: 'Table / Room Queue',
    zoneTodoSubtitle: 'Shows current room status and access code. Can directly “checkout and clear”.',
    ordersTitle: 'Incoming Orders',
    writeQueuePrefix: 'Write queue: ',
    queueIdle: 'idle',
    queueWriting: 'writing',
    queuePending: 'pending',
    noOrders: 'No orders right now.',
    loginRequired: 'Please log in first.',
    accessCode: 'Access code: ',
    currentUnpaid: 'Unpaid total: ',
    currentState: 'Status: ',
    opened: 'Open',
    closed: 'Closed',
    currentMode: 'Billing mode: ',
    split: 'Split',
    merged: 'Merged',
    canCheckoutMerged: 'Merged mode, room can be checked out directly',
    canCheckoutSplit: 'Everyone settled, ready to check out',
    notOpenedCheckout: 'Room not opened yet; guests cannot order yet',
    notOpenedSession: 'Room not opened yet; please open it first',
    unsettledPrefix: '{count} guests unsettled, checkout locked',
    openSession: 'Open',
    checkoutClear: 'Checkout & Clear',
    sessionTitle: 'Current Session',
    loading: 'Loading...',
    addDish: 'Add Dish',
    chooseAddDish: 'Choose dishes to add',
    addDishHint: 'Tap a dish to add it to the current order',
    noAddDish: 'No dishes available to add.',
    itemDescriptionNone: 'No description',
    noOrderNote: 'None',
    notes: 'Note: ',
    customer: 'Guest: ',
    employee: 'Staff: ',
    orderStatusNew: 'New',
    orderStatusPreparing: 'Preparing',
    orderStatusReady: 'Ready',
    orderStatusServed: 'Completed',
    orderStatusCancelled: 'Cancelled',
    serve: 'Served',
    unserve: 'Mark unserved',
    completeAction: 'Complete',
    cancelAction: 'Cancel',
    addToOrder: 'Add to order',
    guest: 'Guest',
    uncategorized: 'Uncategorized',
    loadingFailed: 'Loading failed: {msg}',
    currentSessionRoom: '{label} Current Session',
    accessCodeLabel: 'Access code: {code}',
    customerLabel: 'Guest: {name}',
    employeeLabel: 'Staff: {name}',
    orderLabel: 'Order {id} · {time}',
    noteLabel: 'Note: {note}',
    totalLabel: 'Total {amount}',
    loadingText: 'Loading...',
    addDishFor: 'Add dish for {name}',
    chooseDishForAdd: 'Choose dishes to add',
    noZones: 'No tables/rooms yet. Please create one in the menu management page.',
    currentSessionEmpty: 'This room currently has no orders in the active session.',
    noCustomersToSettle: 'Unsettled list: none, everyone is settled',
    allSettled: 'Everyone settled',
    settledStatus: 'Settled',
    unsettledStatus: 'Unsettled',
    unsettledList: 'Unsettled: {names}',
    sessionStatusOpened: 'Open',
    sessionStatusClosed: 'Closed',
    sessionOpenHelp: 'Guests will first see “closed”; staff must open the room before the current session becomes available.',
    mergedViewTitle: 'Merged view',
    printMergedReceipt: 'Print merged receipt',
    printCustomerReceipt: 'Print receipt',
    addItemToOrder: 'Add dish',
    loginInProgress: 'Logging in...',
    loginSuccess: 'Logged in.',
    loginFailed: 'Login failed: {msg}',
    sessionExpired: 'Session expired, please log in again',
    openSessionSuccess: 'Room opened. Guests can now scan the same QR code to join.',
    submitSuccess: 'Submitted',
    submitSuccessMerged: 'Merged receipt sent to the Windows print queue.',
    submitSuccessCustomer: '{name} receipt sent to the Windows print queue.',
    printFailed: 'Print failed',
    orderError: 'Orders',
    addItemFailed: 'Failed to add dish',
    checkoutConfirm: 'Checking out will clear all orders for this table/room. Continue?',
    checkoutDone: 'Checkout complete, {count} orders cleared.',
    checkoutFailed: 'Checkout failed',
    openSessionDone: 'Room opened. Guests can now scan the same QR code to join.',
    openSessionFailed: 'Failed to open room: {msg}',
    settleFailed: 'Failed to update settlement status',
    modeFailed: 'Failed to switch billing mode',
    loadMenuFailed: 'Failed to load menu',
    loadStatusFailed: 'Failed to load settlement status',
    loadOrdersFailed: 'No orders right now.',
    openSessionBtn: 'Open',
    toggleLang: '中文 / EN',
    checkoutButton: 'Checkout & Clear',
    openSessionButton: 'Open',
    sessionOpenModeHelp: 'Guests will first see “closed”; staff must open the room before the current session becomes available.',
    markUnsettled: 'Mark Unsettled',
    markSettled: 'Settled',
    printTaskSubmitted: 'Submitted',
    printTaskMerged: 'Merged receipt sent to the Windows print queue.',
    printTaskCustomer: '{name} receipt sent to the Windows print queue.',
  },
};

function t(key, params = {}) {
  const bundle = I18N[adminState.lang] || I18N.zh;
  const fallback = I18N.zh[key] || key;
  const template = bundle[key] || fallback;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}

function orderStatusLabel(status) {
  if (status === 'new') return t('new');
  if (status === 'preparing') return t('preparing');
  if (status === 'ready') return t('ready');
  if (status === 'served') return t('served');
  if (status === 'cancelled') return t('cancelled');
  return status;
}

const adminState = {
  zones: [],
  selectedZoneId: '',
  soundEnabled: false,
  audioCtx: null,
  lastNewCount: null,
  lang: localStorage.getItem(LANG_STORAGE_KEY) || 'zh',
  employeeToken: localStorage.getItem('employee_session_token') || '',
  employeeUsername: localStorage.getItem('employee_session_username') || '',
  writeQueue: null,
  zoneCustomerSettlements: {},
  zoneCheckoutStatus: null,
  menu: [],
  addItemOrderId: '',
};

function persistLanguage(lang) {
  adminState.lang = lang === 'en' ? 'en' : 'zh';
  localStorage.setItem(LANG_STORAGE_KEY, adminState.lang);
  document.documentElement.lang = adminState.lang === 'en' ? 'en' : 'zh-CN';
  document.title = t('docTitle');
  if (langToggleBtnEl) {
    langToggleBtnEl.textContent = adminState.lang === 'en' ? 'EN / 中文' : '中文 / EN';
  }
}

function syncStaticLabels() {
  document.title = t('docTitle');
  if (heroTitleEl) heroTitleEl.textContent = t('heroTitle');
  if (heroSubtitleEl) heroSubtitleEl.textContent = t('heroSubtitle');
  if (employeeLoginTitleEl) employeeLoginTitleEl.textContent = t('employeeLoginTitle');
  if (employeeUsernameInputEl) employeeUsernameInputEl.placeholder = t('usernamePlaceholder');
  if (employeePasswordInputEl) employeePasswordInputEl.placeholder = t('passwordPlaceholder');
  if (employeeLoginBtnEl) employeeLoginBtnEl.textContent = t('loginBtn');
  if (statusFilterEl) {
    const options = [...statusFilterEl.options];
    options[0].textContent = t('all');
    options[1].textContent = t('new');
    options[2].textContent = t('preparing');
    options[3].textContent = t('ready');
    options[4].textContent = t('served');
    options[5].textContent = t('cancelled');
    statusFilterEl.previousElementSibling.textContent = t('statusFilter');
  }
  if (employeeLogoutBtnEl) employeeLogoutBtnEl.textContent = t('logout');
  if (soundToggleBtnEl) soundToggleBtnEl.textContent = adminState.soundEnabled ? t('soundOn') : t('soundOff');
  if (refreshBtnEl) refreshBtnEl.textContent = t('refresh');
  if (zoneTodoTitleEl) zoneTodoTitleEl.textContent = t('zoneTodoTitle');
  if (zoneTodoSubtitleEl) zoneTodoSubtitleEl.textContent = t('zoneTodoSubtitle');
  if (ordersTitleEl) ordersTitleEl.textContent = t('ordersTitle');
  if (orderItemMenuSubtitleEl) orderItemMenuSubtitleEl.textContent = t('addDishHint');
  if (zoneSessionCloseBtnEl) zoneSessionCloseBtnEl.setAttribute('aria-label', t('close'));
  if (orderItemMenuCloseBtnEl) orderItemMenuCloseBtnEl.setAttribute('aria-label', t('close'));
  if (writeQueueStatusEl && !adminState.writeQueue) writeQueueStatusEl.textContent = `${t('writeQueuePrefix')}-`;
  if (langToggleBtnEl) langToggleBtnEl.textContent = adminState.lang === 'en' ? 'EN / 中文' : '中文 / EN';
  if (currentEmployeeLabelEl && !adminState.employeeToken) currentEmployeeLabelEl.textContent = t('currentEmployeeLoggedOut');
  if (zoneSessionCheckoutBtnEl && adminState.zoneCheckoutStatus) {
    zoneSessionCheckoutBtnEl.textContent = adminState.zoneCheckoutStatus.sessionOpen === true ? t('checkoutClear') : t('openSession');
  }
}

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
    ? `${t('currentEmployeePrefix')}${adminState.employeeUsername}`
    : t('currentEmployeeLoggedOut');
  employeeLogoutBtnEl.hidden = !loggedIn;
  if (!loggedIn) {
    ordersWrapEl.innerHTML = `<div class="card muted">${t('loginRequired')}</div>`;
    zoneTodoWrapEl.innerHTML = `<div class="muted">${t('loginRequired')}</div>`;
  }
  syncStaticLabels();
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
          >${item.served ? t('unserve') : t('serve')}</button>
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
    ordersWrapEl.innerHTML = `<div class="card muted">${t('noOrders')}</div>`;
    return;
  }

  ordersWrapEl.innerHTML = visibleOrders
    .map((order, index) => {
      const statusClass = `status-${order.status}`;
      const editable = canEditOrder(order);
      const items = renderOrderItems(order);
      const priorityText = showTerminalOnly ? '' : ` · 优先级 ${index + 1}`;

      return `
        <article class="order-card">
          <div class="order-head">
            <strong>${order.zoneLabel}${priorityText}</strong>
            <span class="badge ${statusClass}">${orderStatusLabel(order.status)}</span>
          </div>
          <div class="small muted">${t('customerLabel', { name: order.customerName || t('guest') })}</div>
          <div class="small muted">${t('employeeLabel', { name: order.handledByEmployeeUsername || '-' })}</div>
          <div class="small muted">${t('orderLabel', { id: order.id.slice(0, 8), time: formatTime(order.createdAt) })}</div>
          <ul class="order-item-list">${items}</ul>
          <div><strong>${t('totalLabel', { amount: currency(order.total) })}</strong></div>
          <div class="small">${t('noteLabel', { note: order.note || t('noOrderNote') })}</div>
          <div class="row wrap" style="margin-top: 8px">
            <button data-order-action="status" data-id="${order.id}" data-status="preparing" class="secondary">${t('preparing')}</button>
            <button data-order-action="status" data-id="${order.id}" data-status="ready">${t('ready')}</button>
            <button data-order-action="status" data-id="${order.id}" data-status="served" class="light">${t('completeAction')}</button>
            <button data-order-action="status" data-id="${order.id}" data-status="cancelled" class="warn">${t('cancelAction')}</button>
            <button data-order-action="add-item" data-id="${order.id}" class="light" ${editable ? '' : 'disabled'}>${t('addDish')}</button>
          </div>
        </article>`;
    })
    .join('');
}

function renderZones(zones) {
  if (!zones.length) {
    zoneTodoWrapEl.innerHTML = `<div class="muted">${t('noZones')}</div>`;
    return;
  }

  zoneTodoWrapEl.innerHTML = zones
    .map((zone) => {
      const unsettledCount = Number(zone.unsettledCustomerCount || 0);
      const canCheckout = zone.canCheckout !== false;
      const billingMode = zone.billingMode === 'merged' ? 'merged' : 'split';
      const sessionOpen = zone.sessionOpen === true;
      const checkoutHint = !sessionOpen
        ? t('notOpenedCheckout')
        : (canCheckout
          ? (billingMode === 'merged' ? t('canCheckoutMerged') : t('canCheckoutSplit'))
          : t('unsettledPrefix', { count: unsettledCount }));
      return `
      <div class="order-card zone-card-clickable" data-zone-open="${zone.id}">
        <div class="order-head">
          <strong class="zone-title">${zone.label}</strong>
          <span class="badge">${zone.activeOrderCount} ${t('orderCountUnit')}</span>
        </div>
        <div class="zone-meta">${t('accessCode', { code: zone.accessCode || '----' })}</div>
        <div class="zone-meta">${t('currentUnpaid')}${currency(zone.activeOrderTotal || 0)}</div>
        <div class="zone-meta">${t('currentState')}${sessionOpen ? t('opened') : t('closed')}</div>
        <div class="zone-meta">${t('currentMode')}${billingModeLabel(billingMode)}</div>
        <div class="zone-meta">${checkoutHint}</div>
        <div class="row wrap" style="margin-top: 8px">
          <button class="${sessionOpen ? 'warn' : 'secondary'}" data-zone-action="${sessionOpen ? 'checkout' : 'open-session'}" data-id="${zone.id}" ${sessionOpen && !canCheckout ? 'disabled' : ''}>${sessionOpen ? t('checkoutClear') : t('openSession')}</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderWriteQueue(info) {
  if (!writeQueueStatusEl) return;
  if (!info || typeof info !== 'object') {
    writeQueueStatusEl.textContent = `${t('writeQueuePrefix')}-`;
    return;
  }
  const pending = Number(info.pending || 0);
  const processing = Boolean(info.processing);
  writeQueueStatusEl.textContent = `${t('writeQueuePrefix')}${t('queuePending')} ${pending} · ${processing ? t('queueWriting') : t('queueIdle')}`;
}

function renderAddItemMenu() {
  if (!orderItemMenuListEl) return;
  if (!adminState.menu.length) {
    orderItemMenuListEl.innerHTML = `<div class="card muted">${t('noAddDish')}</div>`;
    return;
  }

  orderItemMenuListEl.innerHTML = adminState.menu
    .map((item) => `
      <article class="order-card">
        <div class="order-head">
          <strong>${item.name}</strong>
          <span class="badge">${currency(item.price)}</span>
        </div>
        <div class="small muted">${item.category || t('uncategorized')}</div>
        <div class="small muted">${item.description || t('itemDescriptionNone')}</div>
        <div class="row wrap" style="margin-top:8px;">
          <button
            type="button"
            class="secondary"
            data-order-menu-action="add"
            data-menu-id="${item.id}"
          >${t('addToOrder')}</button>
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
  orderItemMenuTitleEl.textContent = order ? t('addDishFor', { name: order.customerName || order.zoneLabel }) : t('chooseDishForAdd');
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
    throw new Error(data.error || t('loadStatusFailed'));
  }
}

async function checkoutZone(zoneId) {
  const res = await fetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/checkout`, {
    method: 'POST',
    headers: getEmployeeAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || t('checkoutFailed'));
  }
  return data;
}

async function fetchZoneCustomerSettlements(zoneId) {
  const data = await employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/customer-settlements`);
  return data && typeof data === 'object'
    ? data
    : { settlements: {}, unsettledCustomerNames: [], unsettledCustomerCount: 0, canCheckout: true };
}

async function setCustomerSettlement(zoneId, customerName, settled) {
  const data = await employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/customer-settlements`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName, settled }),
  });
  return data && typeof data === 'object'
    ? data
    : { settlements: {}, unsettledCustomerNames: [], unsettledCustomerCount: 0, canCheckout: true };
}

async function startZoneSession(zoneId) {
  const data = await employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/open-session`, {
    method: 'POST',
  });
  return data && typeof data === 'object'
    ? data
    : { settlements: {}, unsettledCustomerNames: [], unsettledCustomerCount: 0, canCheckout: false, sessionOpen: true, billingMode: 'split' };
}

async function setZoneBillingMode(zoneId, billingMode) {
  const data = await employeeApiFetch(`/api/employee/zones/${encodeURIComponent(zoneId)}/billing-mode`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingMode }),
  });
  return data && typeof data === 'object'
    ? data
    : { settlements: {}, unsettledCustomerNames: [], unsettledCustomerCount: 0, canCheckout: true, billingMode: 'split' };
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

function billingModeLabel(mode) {
  return mode === 'merged' ? t('merged') : t('split');
}

function buildZoneMetaText(zone, checkoutStatus) {
  const billingMode = checkoutStatus?.billingMode === 'merged' ? 'merged' : 'split';
  const sessionOpen = checkoutStatus?.sessionOpen === true;
  const base = `${t('accessCode', { code: zone?.accessCode || '----' })} · ${sessionOpen ? t('opened') : t('closed')} · ${t('currentMode')}${billingModeLabel(billingMode)}`;
  if (!sessionOpen) {
    return `${base} · ${t('sessionOpenModeHelp')}`;
  }
  if (billingMode === 'merged') {
    return `${base} · ${t('canCheckoutMerged')}`;
  }
  const unsettledNames = Array.isArray(checkoutStatus?.unsettledCustomerNames)
    ? checkoutStatus.unsettledCustomerNames.filter(Boolean)
    : [];
  return unsettledNames.length ? `${base} · ${t('unsettledList', { names: unsettledNames.join('、') })}` : `${base} · ${t('allSettled')}`;
}

function applyZoneCheckoutStatus(zoneId, checkoutStatus) {
  if (!zoneId || !checkoutStatus) return;
  adminState.zones = adminState.zones.map((zone) => {
    if (zone.id !== zoneId) return zone;
      return {
        ...zone,
        billingMode: checkoutStatus.billingMode === 'merged' ? 'merged' : 'split',
        sessionOpen: checkoutStatus.sessionOpen === true,
        canCheckout: checkoutStatus.canCheckout !== false,
        unsettledCustomerCount: Number(checkoutStatus.unsettledCustomerCount || 0),
      };
  });
  renderZones(adminState.zones);
}

function formatSessionOrders(zone, orders, periodStartAt = '') {
  const periodStartMs = Date.parse(periodStartAt || zone?.accessCodeUpdatedAt || zone?.createdAt || '');
  const safeStart = Number.isNaN(periodStartMs) ? 0 : periodStartMs;
  return sortOrdersFifo(orders
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
    <section class="card">
      <div class="row wrap" style="justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <h3 style="margin:0;">${t('currentState')}${sessionOpen ? t('opened') : t('closed')}</h3>
          <div class="small muted">${sessionOpen ? (billingMode === 'merged' ? t('mergedViewTitle') : t('sessionOpenModeHelp')) : t('sessionOpenModeHelp')}</div>
        </div>
        ${sessionOpen ? `
          <button
            type="button"
            class="light"
            data-zone-session-action="toggle-billing-mode"
            data-billing-mode-next="${billingMode === 'merged' ? 'split' : 'merged'}"
          >${billingMode === 'merged' ? t('split') : t('merged')}</button>
        ` : `
          <button
            type="button"
            class="secondary"
            data-zone-session-action="open-session"
          >${t('openSession')}</button>
        `}
      </div>
    </section>
  `;
  if (!orders.length) {
    zoneSessionOrdersWrapEl.innerHTML = `${modeCard}<div class="card muted">${t('currentSessionEmpty')}</div>`;
    return;
  }
  if (billingMode === 'merged') {
    const ordersHtml = orders
      .map((order) => {
        const items = renderOrderItems(order, { inDrawer: true });
        const editable = canEditOrder(order);
        return `
          <article class="order-card">
            <div class="order-head">
              <strong>${order.customerName || t('guest')} · #${order.id.slice(0, 8)}</strong>
              <span class="badge status-${order.status}">${orderStatusLabel(order.status)}</span>
            </div>
            <div class="small muted">${formatTime(order.createdAt)}</div>
            <ul class="order-item-list">${items}</ul>
            <div><strong>${t('totalLabel', { amount: currency(order.total) })}</strong></div>
            <div class="small">${t('noteLabel', { note: order.note || t('noOrderNote') })}</div>
            <div class="row wrap" style="margin-top:8px;">
              <button type="button" class="light" data-order-action="add-item" data-id="${order.id}" ${editable ? '' : 'disabled'}>${t('addDish')}</button>
            </div>
          </article>
        `;
      })
      .join('');
    zoneSessionOrdersWrapEl.innerHTML = `${modeCard}<section class="card"><div class="grid" style="margin-top:0;">${ordersHtml}</div></section>`;
    return;
  }
  const groups = new Map();
  for (const order of orders) {
    const key = order.customerName || t('guest');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  }

  zoneSessionOrdersWrapEl.innerHTML = modeCard + [...groups.entries()]
    .map(([customerName, customerOrders]) => {
      const settleInfo = settlements[customerName] || null;
      const isSettled = Boolean(settleInfo?.settled);
      const settledText = isSettled ? t('settledStatus') : t('unsettledStatus');
      const settledBy = isSettled && settleInfo?.updatedByEmployeeUsername ? `（${settleInfo.updatedByEmployeeUsername}）` : '';
      const settleButtonText = isSettled ? t('markUnsettled') : t('markSettled');
      const ordersHtml = customerOrders
        .map((order) => {
          const items = renderOrderItems(order, { inDrawer: true });
          const editable = canEditOrder(order);
          return `
            <article class="order-card">
              <div class="order-head">
                <strong>#${order.id.slice(0, 8)}</strong>
                <span class="badge status-${order.status}">${orderStatusLabel(order.status)}</span>
              </div>
              <div class="small muted">${formatTime(order.createdAt)}</div>
              <ul class="order-item-list">${items}</ul>
              <div><strong>${t('totalLabel', { amount: currency(order.total) })}</strong></div>
              <div class="small">${t('noteLabel', { note: order.note || t('noOrderNote') })}</div>
              <div class="row wrap" style="margin-top:8px;">
                <button type="button" class="light" data-order-action="add-item" data-id="${order.id}" ${editable ? '' : 'disabled'}>${t('addDish')}</button>
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
  zoneSessionTitleEl.textContent = t('currentSessionRoom', { label: zone.label });
  zoneSessionMetaEl.textContent = t('accessCode', { code: zone.accessCode || '----' });
  zoneSessionOrdersWrapEl.innerHTML = `<div class="card muted">${t('loadingText')}</div>`;
  zoneSessionCheckoutBtnEl.disabled = true;
  zoneSessionDrawerBackdropEl.hidden = false;
  zoneSessionDrawerEl.classList.add('open');
  zoneSessionDrawerEl.setAttribute('aria-hidden', 'false');
  refreshZoneSessionDrawer().catch((error) => {
    zoneSessionOrdersWrapEl.innerHTML = `<div class="card">${t('loadingFailed', { msg: error.message })}</div>`;
  });
}

function closeZoneSessionDrawer() {
  adminState.selectedZoneId = '';
  adminState.zoneCustomerSettlements = {};
  adminState.zoneCheckoutStatus = null;
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
  zoneSessionTitleEl.textContent = t('currentSessionRoom', { label: zone.label });
  zoneSessionMetaEl.textContent = t('accessCode', { code: zone.accessCode || '----' });
  const [orders, checkoutStatus] = await Promise.all([
    fetchAllActiveOrders(),
    fetchZoneCustomerSettlements(zone.id),
  ]);
  const settlements = checkoutStatus?.settlements && typeof checkoutStatus.settlements === 'object'
    ? checkoutStatus.settlements
    : {};
  const unsettledNames = Array.isArray(checkoutStatus?.unsettledCustomerNames)
    ? checkoutStatus.unsettledCustomerNames.filter(Boolean)
    : [];
  adminState.zoneCustomerSettlements = settlements;
  adminState.zoneCheckoutStatus = {
    ...checkoutStatus,
    settlements,
    unsettledCustomerNames: unsettledNames,
    canCheckout: checkoutStatus?.canCheckout !== false,
  };
  applyZoneCheckoutStatus(zone.id, adminState.zoneCheckoutStatus);
  zoneSessionMetaEl.textContent = buildZoneMetaText(zone, adminState.zoneCheckoutStatus);
  zoneSessionCheckoutBtnEl.textContent = adminState.zoneCheckoutStatus.sessionOpen === true ? t('checkoutClear') : t('openSession');
  zoneSessionCheckoutBtnEl.className = adminState.zoneCheckoutStatus.sessionOpen === true ? 'warn' : 'secondary';
  zoneSessionCheckoutBtnEl.disabled = adminState.zoneCheckoutStatus.sessionOpen === true ? adminState.zoneCheckoutStatus.canCheckout === false : false;
  const sessionOrders = formatSessionOrders(zone, orders, adminState.zoneCheckoutStatus.periodStartAt);
  renderZoneSessionOrders(zone, sessionOrders, settlements, adminState.zoneCheckoutStatus);
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
    lastUpdatedEl.textContent = `${t('refresh')} ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (error.requiresEmployeeLogin) {
      adminState.employeeToken = '';
      adminState.employeeUsername = '';
      localStorage.removeItem('employee_session_token');
      localStorage.removeItem('employee_session_username');
      updateEmployeeUiState();
      return;
    }
    ordersWrapEl.innerHTML = `<div class="card">${t('loadingFailed', { msg: error.message })}</div>`;
  }
}

async function employeeLogin() {
  const username = String(employeeUsernameInputEl.value || '').trim();
  const password = String(employeePasswordInputEl.value || '').trim();
  if (!username || !password) {
    employeeLoginMsgEl.textContent = t('loginRequired');
    return;
  }
  employeeLoginBtnEl.disabled = true;
  employeeLoginMsgEl.textContent = t('loginInProgress');
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
    employeeLoginMsgEl.textContent = t('loginSuccess');
    updateEmployeeUiState();
    await loadAll();
  } catch (error) {
    employeeLoginMsgEl.textContent = t('loginFailed', { msg: error.message });
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
      alert(t('loadingFailed', { msg: error.message }));
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
    alert(t('loadingFailed', { msg: error.message }));
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
      const ok = confirm(t('checkoutConfirm'));
      if (!ok) return;
      const result = await checkoutZone(zoneId);
      alert(t('checkoutDone', { count: result.clearedOrders }));
      await loadAll();
      return;
    }
    if (action === 'open-session') {
      await startZoneSession(zoneId);
      alert(t('openSessionSuccess'));
      await loadAll();
    }
  } catch (error) {
    alert(t('loadingFailed', { msg: error.message }));
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
      alert(t('loadingFailed', { msg: error.message }));
    }
    return;
  }

  const addItemButton = event.target.closest('button[data-order-action="add-item"]');
  if (addItemButton) {
    try {
      await openAddItemMenu(addItemButton.dataset.id);
    } catch (error) {
      alert(t('loadingFailed', { msg: error.message }));
    }
    return;
  }

  const modeButton = event.target.closest('button[data-zone-session-action="toggle-billing-mode"]');
  if (modeButton) {
    const zoneId = adminState.selectedZoneId;
    if (!zoneId) return;
    modeButton.disabled = true;
    try {
      const checkoutStatus = await setZoneBillingMode(zoneId, modeButton.dataset.billingModeNext);
      const settlements = checkoutStatus?.settlements && typeof checkoutStatus.settlements === 'object'
        ? checkoutStatus.settlements
        : {};
      adminState.zoneCustomerSettlements = settlements;
      adminState.zoneCheckoutStatus = {
        ...checkoutStatus,
        settlements,
        unsettledCustomerNames: Array.isArray(checkoutStatus?.unsettledCustomerNames)
          ? checkoutStatus.unsettledCustomerNames.filter(Boolean)
          : [],
        canCheckout: checkoutStatus?.canCheckout !== false,
      };
      const zone = getZoneById(zoneId);
      if (!zone) return;
      applyZoneCheckoutStatus(zone.id, adminState.zoneCheckoutStatus);
      zoneSessionMetaEl.textContent = buildZoneMetaText(zone, adminState.zoneCheckoutStatus);
      zoneSessionCheckoutBtnEl.disabled = adminState.zoneCheckoutStatus.canCheckout === false;
      const orders = await fetchAllActiveOrders();
      const sessionOrders = formatSessionOrders(zone, orders, adminState.zoneCheckoutStatus.periodStartAt);
      renderZoneSessionOrders(zone, sessionOrders, settlements, adminState.zoneCheckoutStatus);
    } catch (error) {
      alert(t('modeFailed', { msg: error.message }));
      modeButton.disabled = false;
    }
    return;
  }

  const openButton = event.target.closest('button[data-zone-session-action="open-session"]');
  if (openButton) {
    const zoneId = adminState.selectedZoneId;
    if (!zoneId) return;
    openButton.disabled = true;
    try {
      await startZoneSession(zoneId);
      const zone = getZoneById(zoneId);
      if (zone) {
        await refreshZoneSessionDrawer();
      }
      alert(t('openSessionSuccess'));
    } catch (error) {
      alert(t('openSessionFailed', { msg: error.message }));
      openButton.disabled = false;
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
    const checkoutStatus = await setCustomerSettlement(zoneId, customerName, settledNext);
    const settlements = checkoutStatus?.settlements && typeof checkoutStatus.settlements === 'object'
      ? checkoutStatus.settlements
      : {};
    adminState.zoneCustomerSettlements = settlements;
    adminState.zoneCheckoutStatus = {
      ...checkoutStatus,
      settlements,
      unsettledCustomerNames: Array.isArray(checkoutStatus?.unsettledCustomerNames)
        ? checkoutStatus.unsettledCustomerNames.filter(Boolean)
        : [],
      canCheckout: checkoutStatus?.canCheckout !== false,
    };
    const zone = getZoneById(zoneId);
    if (!zone) return;
    applyZoneCheckoutStatus(zone.id, adminState.zoneCheckoutStatus);
    zoneSessionMetaEl.textContent = buildZoneMetaText(zone, adminState.zoneCheckoutStatus);
    zoneSessionCheckoutBtnEl.disabled = adminState.zoneCheckoutStatus.canCheckout === false;
    const orders = await fetchAllActiveOrders();
    const sessionOrders = formatSessionOrders(zone, orders, adminState.zoneCheckoutStatus.periodStartAt);
    renderZoneSessionOrders(zone, sessionOrders, settlements, adminState.zoneCheckoutStatus);
    } catch (error) {
      alert(t('settleFailed', { msg: error.message }));
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
    alert(t('addItemFailed', { msg: error.message }));
  }
});

zoneSessionCheckoutBtnEl.addEventListener('click', async () => {
  const zoneId = adminState.selectedZoneId;
  if (!zoneId) return;
  try {
    const zone = getZoneById(zoneId);
    if (zone?.sessionOpen === true) {
      const ok = confirm(t('checkoutConfirm'));
      if (!ok) return;
      const result = await checkoutZone(zoneId);
      alert(t('checkoutDone', { count: result.clearedOrders }));
      closeZoneSessionDrawer();
    } else {
      await startZoneSession(zoneId);
      alert(t('openSessionSuccess'));
    }
    await loadAll();
  } catch (error) {
    alert(t('loadingFailed', { msg: error.message }));
  }
});

refreshBtnEl.addEventListener('click', loadAll);
statusFilterEl.addEventListener('change', loadAll);
langToggleBtnEl.addEventListener('click', async () => {
  const nextLang = adminState.lang === 'en' ? 'zh' : 'en';
  persistLanguage(nextLang);
  syncStaticLabels();
  updateEmployeeUiState();
  if (adminState.employeeToken) {
    await loadAll();
  }
  if (adminState.addItemOrderId) {
    await openAddItemMenu(adminState.addItemOrderId);
  }
});
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
    alert(t('loadingFailed', { msg: error.message }));
  }
});

persistLanguage(adminState.lang);
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
