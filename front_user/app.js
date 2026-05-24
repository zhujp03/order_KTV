const state = {
  token: '',
  menu: [],
  categoryGroups: [],
  cartItems: {},
  cartNote: '',
  lastCartDigest: '',
  cartSummaryDigest: '',
  ordersDigest: '',
  noteEditing: false,
  noteSyncTimer: null,
  polling: false,
  activeCategory: '',
  sessionToken: '',
  accessCodeRequired: false,
  customerName: '',
  roomLabelRaw: '',
  categoryObserver: null,
  categories: [],
};
const TAX_RATE = 0.13;
const SERVICE_RATE = 0.18;

const zoneLabelEl = document.getElementById('zoneLabel');
const userHeroEl = document.querySelector('.user-hero');
const categoryTabsEl = document.getElementById('categoryTabs');
const menuSectionsEl = document.getElementById('menuSections');
const accessGateEl = document.getElementById('accessGate');
const customerNameInputEl = document.getElementById('customerNameInput');
const accessCodeInputEl = document.getElementById('accessCodeInput');
const verifyAccessBtnEl = document.getElementById('verifyAccessBtn');
const accessMsgEl = document.getElementById('accessMsg');
const stickyMenuHeadEl = document.getElementById('stickyMenuHead');

const cartFabEl = document.getElementById('cartFab');
const cartFabCountEl = document.getElementById('cartFabCount');
const cartFabTotalEl = document.getElementById('cartFabTotal');
const cartOverlayEl = document.getElementById('cartOverlay');
const cartDrawerEl = document.getElementById('cartDrawer');
const cartCloseBtnEl = document.getElementById('cartCloseBtn');

const cartListEl = document.getElementById('cartList');
const sumSubtotalEl = document.getElementById('sumSubtotal');
const sumTaxEl = document.getElementById('sumTax');
const sumServiceEl = document.getElementById('sumService');
const sumTotalEl = document.getElementById('sumTotal');
const noteInputEl = document.getElementById('noteInput');
const submitBtnEl = document.getElementById('submitBtn');
const submitMsgEl = document.getElementById('submitMsg');
const ordersBtnEl = document.getElementById('ordersBtn');
const ordersPanelEl = document.getElementById('ordersPanel');
const ordersListEl = document.getElementById('ordersList');
const orderStatusText = {
  new: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDescriptionHtml(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  const lines = text
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => escapeHtml(line));
  if (!lines.length) return '';
  return lines.join('<br />');
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function ceil2(value) {
  return Math.ceil((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function toRoomLabel(rawLabel) {
  const label = String(rawLabel || '').trim();
  const numberMatch = label.match(/\d+/);
  if (numberMatch) {
    return `Room ${numberMatch[0]}`;
  }
  return label ? `Room ${label}` : 'Room';
}

function getToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

function getSessionStorageKey(token) {
  return `order_session_${token}`;
}

function saveSessionToken(token, sessionToken) {
  if (!token) return;
  if (!sessionToken) {
    localStorage.removeItem(getSessionStorageKey(token));
    return;
  }
  localStorage.setItem(getSessionStorageKey(token), sessionToken);
}

function loadSessionToken(token) {
  if (!token) return '';
  return localStorage.getItem(getSessionStorageKey(token)) || '';
}

function getSessionHeaders() {
  if (!state.sessionToken) return {};
  return { 'X-Zone-Session': state.sessionToken };
}

function showAccessGate(message = '') {
  if (!state.accessCodeRequired) return;
  accessGateEl.hidden = false;
  accessMsgEl.textContent = message;
  applyAccessUiState();
}

function hideAccessGate() {
  accessGateEl.hidden = true;
  accessMsgEl.textContent = '';
  applyAccessUiState();
}

function clearSession(message = 'Session expired. Please re-enter access code.') {
  state.sessionToken = '';
  state.customerName = '';
  saveSessionToken(state.token, '');
  state.ordersDigest = '';
  ordersPanelEl.hidden = true;
  ordersBtnEl.textContent = 'Orders';
  ordersListEl.textContent = 'No submitted orders yet.';
  showAccessGate(message);
  applyAccessUiState();
}

function updateStickyMenuHeadVisibility() {
  if (!stickyMenuHeadEl) return;
  const canShowStickyHead = !state.accessCodeRequired || Boolean(state.sessionToken);
  stickyMenuHeadEl.hidden = !canShowStickyHead;
}

function applyAccessUiState() {
  const locked = state.accessCodeRequired && !state.sessionToken;
  document.body.classList.toggle('access-locked', locked);
  if (userHeroEl) userHeroEl.hidden = locked;
  if (menuSectionsEl) menuSectionsEl.hidden = locked;
  if (cartFabEl) cartFabEl.hidden = locked;
  if (locked) {
    closeCartDrawer();
    cartOverlayEl.hidden = true;
  }
  updateStickyMenuHeadVisibility();
}

async function apiFetchJson(url, options = {}) {
  const merged = {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...getSessionHeaders(),
    },
  };
  const res = await fetch(url, merged);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.requiresAccessCode = data.requiresAccessCode === true;
    error.status = res.status;
    throw error;
  }
  return data;
}

function normalizeCategory(category) {
  const text = typeof category === 'string' ? category.trim() : '';
  return text || 'Uncategorized';
}

function buildCategoryGroups(menu, categories = []) {
  const map = new Map();

  for (const item of menu) {
    const category = normalizeCategory(item.category);
    if (!map.has(category)) {
      map.set(category, []);
    }
    map.get(category).push(item);
  }

  const categoryOrder = Array.isArray(categories) ? categories.map((c) => normalizeCategory(c?.name)) : [];
  const orderedNames = [...new Set([...categoryOrder, ...map.keys()])];

  return orderedNames
    .filter((category) => map.has(category))
    .map((category) => ({
      category,
      anchorId: `cat-${encodeURIComponent(category).replace(/%/g, '-')}`,
      items: map.get(category) || [],
    }));
}

function sortedItemsObject(items) {
  const entries = Object.entries(items || {}).sort((a, b) => a[0].localeCompare(b[0]));
  return Object.fromEntries(entries);
}

function digestCart(items, note) {
  return JSON.stringify({ items: sortedItemsObject(items || {}), note: note || '' });
}

function setActiveCategory(category) {
  if (!category || state.activeCategory === category) return;
  state.activeCategory = category;

  const tabButtons = categoryTabsEl.querySelectorAll('button[data-category]');
  tabButtons.forEach((button) => {
    const isActive = button.dataset.category === category;
    button.classList.toggle('active', isActive);
    if (isActive) {
      button.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  });
}

function renderCategoryTabs() {
  if (!state.categoryGroups.length) {
    categoryTabsEl.innerHTML = '<span class="muted small">No categories available.</span>';
    return;
  }

  categoryTabsEl.innerHTML = state.categoryGroups
    .map(
      (group) =>
        `<button type="button" class="cat-tab" data-category="${group.category}" data-anchor="${group.anchorId}">${group.category}</button>`,
    )
    .join('');

  setActiveCategory(state.categoryGroups[0].category);
}

function renderMenuSections() {
  if (!state.categoryGroups.length) {
    menuSectionsEl.innerHTML = '<article class="card"><p class="muted">No items available right now.</p></article>';
    return;
  }

  menuSectionsEl.innerHTML = state.categoryGroups
    .map((group) => {
      const itemsHtml = group.items
        .map(
          (item) => {
            const descriptionHtml = formatDescriptionHtml(item.description);
            return `
            <article class="menu-item user-menu-item">
              <div class="menu-title-row">
                <strong>${item.name}</strong>
                <span class="price">${money(item.price)}</span>
              </div>
              ${descriptionHtml ? `<div class="small muted">${descriptionHtml}</div>` : ''}
              <div class="qty-controls">
                <button class="light" data-action="dec" data-id="${item.id}" type="button">-</button>
                <strong data-qty-for="${item.id}">0</strong>
                <button class="secondary" data-action="inc" data-id="${item.id}" type="button">+</button>
              </div>
            </article>
          `;
          },
        )
        .join('');

      return `
        <section id="${group.anchorId}" class="category-section card" data-category-section="${group.category}">
          <h2>${group.category}</h2>
          <div class="menu-list">${itemsHtml}</div>
        </section>
      `;
    })
    .join('');
}

function renderMenuQtyOnly() {
  const qtyNodes = menuSectionsEl.querySelectorAll('[data-qty-for]');
  qtyNodes.forEach((node) => {
    const id = node.getAttribute('data-qty-for');
    const qty = Number(state.cartItems[id] || 0);
    const nextText = String(qty);
    if (node.textContent !== nextText) {
      node.textContent = nextText;
    }
  });
}

function renderCartSummary() {
  const menuMap = new Map(state.menu.map((item) => [item.id, item]));
  const rows = [];
  let subtotalAll = 0;
  let taxAll = 0;
  let serviceAll = 0;
  let totalQty = 0;

  for (const [menuId, qtyRaw] of Object.entries(state.cartItems)) {
    const qty = Number(qtyRaw || 0);
    if (!qty) continue;

    const item = menuMap.get(menuId);
    if (!item) continue;

    const subtotal = round2(item.price * qty);
    const service = round2(subtotal * SERVICE_RATE);
    const tax = ceil2((subtotal + service) * TAX_RATE);
    const total = round2(subtotal + tax + service);

    subtotalAll += subtotal;
    taxAll += tax;
    serviceAll += service;
    totalQty += qty;
    rows.push({
      name: item.name,
      qty,
      subtotal,
      tax,
      service,
      total,
    });
  }

  subtotalAll = round2(subtotalAll);
  taxAll = round2(taxAll);
  serviceAll = round2(serviceAll);
  const grandTotal = round2(subtotalAll + taxAll + serviceAll);

  const summaryDigest = JSON.stringify({ rows, subtotalAll, taxAll, serviceAll, grandTotal, totalQty });
  if (summaryDigest === state.cartSummaryDigest) {
    return;
  }
  state.cartSummaryDigest = summaryDigest;

  if (!rows.length) {
    cartListEl.textContent = 'Your cart is empty.';
  } else {
    cartListEl.innerHTML = rows
      .map(
        (row) => `
        <div class="cart-item-row">
          <div class="cart-item-head">
            <strong>${row.name}</strong>
            <span>x ${row.qty}</span>
          </div>
          <div class="cart-item-breakdown">
            <div><span>Subtotal</span><strong>${money(row.subtotal)}</strong></div>
            <div><span>Tax (HST 13%)</span><strong>${money(row.tax)}</strong></div>
            <div><span>Service charge (18%)</span><strong>${money(row.service)}</strong></div>
            <div class="line-total"><span>Total</span><strong>${money(row.total)}</strong></div>
          </div>
        </div>
      `,
      )
      .join('');
  }

  sumSubtotalEl.textContent = money(subtotalAll);
  sumTaxEl.textContent = money(taxAll);
  sumServiceEl.textContent = money(serviceAll);
  sumTotalEl.textContent = money(grandTotal);
  cartFabCountEl.textContent = String(totalQty);
  cartFabTotalEl.textContent = money(grandTotal);
}

function applyServerCart(cart, options = {}) {
  const items = sortedItemsObject(cart?.items || {});
  const note = typeof cart?.note === 'string' ? cart.note : '';
  const digest = digestCart(items, note);

  if (digest === state.lastCartDigest) {
    return false;
  }

  state.lastCartDigest = digest;
  state.cartItems = items;
  state.cartNote = note;

  renderMenuQtyOnly();
  renderCartSummary();

  const shouldSyncNote = options.syncNote !== false;
  if (shouldSyncNote && !state.noteEditing && noteInputEl.value !== state.cartNote) {
    noteInputEl.value = state.cartNote;
  }

  return true;
}

function syncSessionFromResponse(data) {
  const token = data?.session?.token;
  if (typeof token === 'string' && token) {
    state.sessionToken = token;
    saveSessionToken(state.token, token);
  }
}

async function fetchSharedCart(syncNote = true) {
  const data = await apiFetchJson(`/api/public/cart/${encodeURIComponent(state.token)}`);
  syncSessionFromResponse(data);
  applyServerCart(data.cart, { syncNote });
}

async function fetchSubmittedOrders() {
  const data = await apiFetchJson(`/api/public/orders/${encodeURIComponent(state.token)}`);
  syncSessionFromResponse(data);
  return Array.isArray(data.orders) ? data.orders : [];
}

function renderSubmittedOrders(orders) {
  const digest = JSON.stringify(
    (orders || []).map((order) => ({
      id: order.id,
      status: order.status,
      updatedAt: order.updatedAt,
      total: order.total,
      note: order.note,
      items: (order.items || []).map((item) => ({
        menuId: item.menuId,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
    })),
  );
  if (digest === state.ordersDigest) return;
  state.ordersDigest = digest;

  if (!orders.length) {
    ordersListEl.textContent = 'No submitted orders yet.';
    return;
  }

  ordersListEl.innerHTML = orders
    .map((order) => {
      const itemsHtml = (order.items || [])
        .map((item) => `<li>${item.name} x ${item.quantity} (${money(item.subtotal)})</li>`)
        .join('');
      return `
        <article class="order-history-item">
          <div class="head">
            <strong>#${order.id.slice(0, 8)}</strong>
            <span>${orderStatusText[order.status] || order.status}</span>
          </div>
          <div class="small muted">${formatTime(order.createdAt)}</div>
          <ul>${itemsHtml}</ul>
          <div><strong>Total: ${money(order.total)}</strong></div>
          <div class="small muted">Note: ${order.note || 'None'}</div>
        </article>
      `;
    })
    .join('');
}

async function mutateCart(menuId, delta) {
  const data = await apiFetchJson(`/api/public/cart/${encodeURIComponent(state.token)}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menuId, delta }),
  });
  syncSessionFromResponse(data);
  applyServerCart(data.cart, { syncNote: true });
}

function applyLocalDelta(menuId, delta) {
  const current = Number(state.cartItems[menuId] || 0);
  const next = Math.max(0, Math.min(99, current + delta));

  if (next === 0) {
    delete state.cartItems[menuId];
  } else {
    state.cartItems[menuId] = next;
  }

  state.lastCartDigest = digestCart(state.cartItems, state.cartNote);
  renderMenuQtyOnly();
  renderCartSummary();
}

async function submitOrder() {
  if (state.accessCodeRequired && !state.sessionToken) {
    showAccessGate('Access code required before placing order.');
    return;
  }

  const hasItems = Object.values(state.cartItems).some((qty) => Number(qty) > 0);
  if (!hasItems) {
    submitMsgEl.textContent = 'Please add at least one item.';
    return;
  }

  submitBtnEl.disabled = true;
  submitMsgEl.textContent = 'Placing order...';

  try {
    const data = await apiFetchJson('/api/public/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: state.token,
        useSharedCart: true,
      }),
    });
    syncSessionFromResponse(data);

    await fetchSharedCart(true);
    const submittedOrders = await fetchSubmittedOrders();
    renderSubmittedOrders(submittedOrders);
    ordersPanelEl.hidden = false;
    submitMsgEl.textContent = `Order placed. Ref: ${data.orderId.slice(0, 8)}.`;
  } catch (error) {
    if (error.requiresAccessCode) {
      clearSession('Session expired. Please verify access code again.');
      submitMsgEl.textContent = 'Session expired. Re-verify access code to continue.';
      return;
    }
    submitMsgEl.textContent = `Order failed: ${error.message}`;
  } finally {
    submitBtnEl.disabled = false;
  }
}

async function syncNoteToServer() {
  const nextNote = noteInputEl.value.trim();
  if (nextNote === state.cartNote) return;

  try {
    const data = await apiFetchJson(`/api/public/cart/${encodeURIComponent(state.token)}/note`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: nextNote }),
    });
    syncSessionFromResponse(data);
    applyServerCart(data.cart, { syncNote: false });
  } catch (error) {
    if (error.requiresAccessCode) {
      clearSession('Session expired. Please verify access code again.');
      return;
    }
    submitMsgEl.textContent = `Note sync failed: ${error.message}`;
  }
}

function scheduleNoteSync() {
  if (state.noteSyncTimer) {
    clearTimeout(state.noteSyncTimer);
  }
  state.noteSyncTimer = setTimeout(syncNoteToServer, 450);
}

async function openSessionWithAccessCode() {
  const customerName = customerNameInputEl.value.trim();
  const code = accessCodeInputEl.value.trim();
  if (!customerName) {
    accessMsgEl.textContent = 'Please enter your name.';
    return false;
  }
  if (!code) {
    accessMsgEl.textContent = 'Please enter an access code.';
    return false;
  }

  verifyAccessBtnEl.disabled = true;
  accessMsgEl.textContent = 'Verifying...';
  try {
    const data = await apiFetchJson('/api/public/session/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: state.token,
        customerName,
        accessCode: code,
      }),
    });
    state.sessionToken = data.sessionToken || '';
    state.customerName = data.customerName || customerName;
    saveSessionToken(state.token, state.sessionToken);
    hideAccessGate();
    customerNameInputEl.value = '';
    accessCodeInputEl.value = '';
    applyServerCart(data.cart || { items: {}, note: '' }, { syncNote: true });
    await fetchSharedCart(true);
    return true;
  } catch (error) {
    accessMsgEl.textContent = error.message || 'Verification failed.';
    return false;
  } finally {
    verifyAccessBtnEl.disabled = false;
  }
}

function openCartDrawer() {
  cartOverlayEl.hidden = false;
  cartDrawerEl.classList.add('open');
  cartDrawerEl.setAttribute('aria-hidden', 'false');
}

function closeCartDrawer() {
  cartOverlayEl.hidden = true;
  cartDrawerEl.classList.remove('open');
  cartDrawerEl.setAttribute('aria-hidden', 'true');
}

function bindCategoryTabs() {
  categoryTabsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-anchor][data-category]');
    if (!button) return;

    const anchor = button.dataset.anchor;
    const category = button.dataset.category;
    const target = document.getElementById(anchor);
    if (!target) return;

    setActiveCategory(category);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function updateActiveCategoryFromScroll() {
  const sections = [...document.querySelectorAll('[data-category-section]')];
  if (!sections.length) return;

  const anchorLine = 120;
  let active = sections[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    const distance = Math.abs(rect.top - anchorLine);
    if (distance < minDistance) {
      minDistance = distance;
      active = section;
    }
  }

  setActiveCategory(active.dataset.categorySection || '');
}

function bindCategoryScrollSync() {
  if (state.categoryObserver) {
    state.categoryObserver.disconnect();
    state.categoryObserver = null;
  }

  const sections = [...document.querySelectorAll('[data-category-section]')];
  if (!sections.length) return;

  const visibilityMap = new Map();
  state.categoryObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const category = entry.target.dataset.categorySection;
        if (!category) continue;
        visibilityMap.set(category, entry.isIntersecting ? entry.intersectionRatio : 0);
      }

      let bestCategory = '';
      let bestRatio = -1;
      for (const [category, ratio] of visibilityMap.entries()) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestCategory = category;
        }
      }
      if (bestCategory) {
        setActiveCategory(bestCategory);
      } else {
        updateActiveCategoryFromScroll();
      }
    },
    {
      root: null,
      rootMargin: '-90px 0px -40% 0px',
      threshold: [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1],
    },
  );

  sections.forEach((section) => state.categoryObserver.observe(section));
}

function bindMenuActions() {
  menuSectionsEl.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action][data-id]');
    if (!button) return;

    const menuId = button.dataset.id;
    const delta = button.dataset.action === 'inc' ? 1 : -1;
    if (state.accessCodeRequired && !state.sessionToken) {
      showAccessGate('Access code required before editing cart.');
      return;
    }

    applyLocalDelta(menuId, delta);

    try {
      await mutateCart(menuId, delta);
    } catch (error) {
      if (error.requiresAccessCode) {
        clearSession('Session expired. Please verify access code again.');
        await fetchSharedCart(true).catch(() => {});
        return;
      }
      submitMsgEl.textContent = `Sync failed: ${error.message}`;
      await fetchSharedCart(true);
    }
  });
}

function bindNoteSync() {
  noteInputEl.addEventListener('focus', () => {
    state.noteEditing = true;
  });

  noteInputEl.addEventListener('blur', async () => {
    state.noteEditing = false;
    if (state.noteSyncTimer) {
      clearTimeout(state.noteSyncTimer);
      state.noteSyncTimer = null;
    }
    await syncNoteToServer();
  });

  noteInputEl.addEventListener('input', scheduleNoteSync);
}

function bindCartDrawer() {
  cartFabEl.addEventListener('click', openCartDrawer);
  cartCloseBtnEl.addEventListener('click', closeCartDrawer);
  cartOverlayEl.addEventListener('click', closeCartDrawer);
  ordersBtnEl.addEventListener('click', async () => {
    if (!ordersPanelEl.hidden) {
      ordersPanelEl.hidden = true;
      ordersBtnEl.textContent = 'Orders';
      return;
    }
    try {
      const submittedOrders = await fetchSubmittedOrders();
      renderSubmittedOrders(submittedOrders);
      ordersPanelEl.hidden = false;
      ordersBtnEl.textContent = 'Close Orders';
    } catch (error) {
      if (error.requiresAccessCode) {
        clearSession('Session expired. Please verify access code again.');
        return;
      }
      submitMsgEl.textContent = `Load orders failed: ${error.message}`;
    }
  });
}

function bindAccessGate() {
  verifyAccessBtnEl.addEventListener('click', openSessionWithAccessCode);
  accessCodeInputEl.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await openSessionWithAccessCode();
  });
  customerNameInputEl.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await openSessionWithAccessCode();
  });
}

async function pollCartLoop() {
  if (state.polling || !state.token) return;
  if (state.accessCodeRequired && !state.sessionToken) return;

  state.polling = true;
  try {
    await fetchSharedCart(!state.noteEditing);
  } catch (error) {
    if (error.requiresAccessCode) {
      clearSession('Session expired. Please verify access code again.');
    }
    // Silent retry to keep the front screen calm.
  } finally {
    state.polling = false;
  }
}

async function pollOrdersLoop() {
  if (!state.token || ordersPanelEl.hidden) return;
  if (state.accessCodeRequired && !state.sessionToken) return;
  try {
    const submittedOrders = await fetchSubmittedOrders();
    renderSubmittedOrders(submittedOrders);
  } catch (error) {
    if (error.requiresAccessCode) {
      clearSession('Session expired. Please verify access code again.');
    }
  }
}

async function loadContext() {
  state.token = getToken();
  if (!state.token) {
    zoneLabelEl.textContent = 'Please scan a valid room QR code.';
    return;
  }

  try {
    state.sessionToken = loadSessionToken(state.token);
    const data = await apiFetchJson(`/api/public/context/${encodeURIComponent(state.token)}`);
    state.accessCodeRequired = data.accessCodeRequired === true;
    if (data?.session?.token) {
      state.sessionToken = data.session.token;
      state.customerName = data.session.customerName || '';
      saveSessionToken(state.token, state.sessionToken);
    }

    state.roomLabelRaw = data.zone?.label || '';
    zoneLabelEl.textContent = toRoomLabel(state.roomLabelRaw);
    state.menu = Array.isArray(data.menu) ? data.menu : [];
    state.categories = Array.isArray(data.categories) ? data.categories : [];
    state.categoryGroups = buildCategoryGroups(state.menu, state.categories);

    renderCategoryTabs();
    renderMenuSections();
    bindCategoryScrollSync();
    renderMenuQtyOnly();
    renderCartSummary();
    updateActiveCategoryFromScroll();

    applyServerCart(data.cart || { items: {}, note: '' }, { syncNote: true });
    applyAccessUiState();

    if (state.accessCodeRequired && !state.sessionToken) {
      showAccessGate('Enter access code to start cart sync and ordering.');
    } else {
      hideAccessGate();
      try {
        await fetchSharedCart(true);
      } catch (error) {
        if (error.requiresAccessCode) {
          clearSession('Session expired. Please enter access code.');
        } else {
          throw error;
        }
      }
    }
    applyAccessUiState();
    setInterval(async () => {
      await pollCartLoop();
      await pollOrdersLoop();
    }, 1000);
  } catch (error) {
    zoneLabelEl.textContent = error.message || 'Please try a valid QR link.';
  }
}

submitBtnEl.addEventListener('click', submitOrder);
window.addEventListener('scroll', updateActiveCategoryFromScroll, { passive: true });

bindCategoryTabs();
bindMenuActions();
bindNoteSync();
bindCartDrawer();
bindAccessGate();
loadContext();
