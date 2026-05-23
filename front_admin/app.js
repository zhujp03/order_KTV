const ordersWrapEl = document.getElementById('ordersWrap');
const zoneTodoWrapEl = document.getElementById('zoneTodoWrap');
const statusFilterEl = document.getElementById('statusFilter');
const refreshBtnEl = document.getElementById('refreshBtn');
const lastUpdatedEl = document.getElementById('lastUpdated');
const zoneSessionDrawerEl = document.getElementById('zoneSessionDrawer');
const zoneSessionDrawerBackdropEl = document.getElementById('zoneSessionDrawerBackdrop');
const zoneSessionTitleEl = document.getElementById('zoneSessionTitle');
const zoneSessionMetaEl = document.getElementById('zoneSessionMeta');
const zoneSessionOrdersWrapEl = document.getElementById('zoneSessionOrdersWrap');
const zoneSessionCloseBtnEl = document.getElementById('zoneSessionCloseBtn');
const zoneSessionCheckoutBtnEl = document.getElementById('zoneSessionCheckoutBtn');

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
};

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function currency(value) {
  return `$${Number(value).toFixed(2)}`;
}

function renderOrders(orders) {
  if (!orders.length) {
    ordersWrapEl.innerHTML = '<div class="card muted">当前没有订单。</div>';
    return;
  }

  ordersWrapEl.innerHTML = orders
    .map((order) => {
      const items = order.items
        .map((item) => `<li>${item.name} x ${item.quantity} <span class="muted">(${currency(item.subtotal)})</span></li>`)
        .join('');

      const statusClass = `status-${order.status}`;

      return `
        <article class="order-card">
          <div class="order-head">
            <strong>${order.zoneLabel}</strong>
            <span class="badge ${statusClass}">${statusText[order.status] || order.status}</span>
          </div>
          <div class="small muted">订单 ${order.id.slice(0, 8)} · ${formatTime(order.createdAt)}</div>
          <ul>${items}</ul>
          <div><strong>合计 ${currency(order.total)}</strong></div>
          <div class="small">备注：${order.note || '无'}</div>
          <div class="row wrap" style="margin-top: 8px">
            <button data-order-action="status" data-id="${order.id}" data-status="preparing" class="secondary">制作中</button>
            <button data-order-action="status" data-id="${order.id}" data-status="ready">待上桌</button>
            <button data-order-action="status" data-id="${order.id}" data-status="served" class="light">完成</button>
            <button data-order-action="status" data-id="${order.id}" data-status="cancelled" class="warn">取消</button>
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

async function updateOrderStatus(orderId, status) {
  const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '更新失败');
  }
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
  const res = await fetch(`/api/admin/zones/${encodeURIComponent(zoneId)}/checkout`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '结单失败');
  }
  return data;
}

async function loadOrders() {
  const status = statusFilterEl.value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';

  const res = await fetch(`/api/admin/orders${query}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '订单加载失败');
  }

  renderOrders(Array.isArray(data.orders) ? data.orders : []);
}

async function loadZones() {
  const res = await fetch('/api/admin/zones');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '桌号加载失败');
  }

  adminState.zones = Array.isArray(data.zones) ? data.zones : [];
  renderZones(adminState.zones);
}

async function fetchAllActiveOrders() {
  const res = await fetch('/api/admin/orders');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '订单加载失败');
  }
  return Array.isArray(data.orders) ? data.orders : [];
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

function renderZoneSessionOrders(zone, orders) {
  if (!orders.length) {
    zoneSessionOrdersWrapEl.innerHTML = '<div class="card muted">该包厢当前 session 暂无订单。</div>';
    return;
  }
  zoneSessionOrdersWrapEl.innerHTML = orders
    .map((order) => {
      const items = order.items
        .map((item) => `<li>${item.name} x ${item.quantity} <span class="muted">(${currency(item.subtotal)})</span></li>`)
        .join('');
      return `
        <article class="order-card">
          <div class="order-head">
            <strong>#${order.id.slice(0, 8)}</strong>
            <span class="badge status-${order.status}">${statusText[order.status] || order.status}</span>
          </div>
          <div class="small muted">${formatTime(order.createdAt)}</div>
          <ul>${items}</ul>
          <div><strong>合计 ${currency(order.total)}</strong></div>
          <div class="small">备注：${order.note || '无'}</div>
        </article>
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
  const orders = await fetchAllActiveOrders();
  const sessionOrders = formatSessionOrders(zone, orders);
  renderZoneSessionOrders(zone, sessionOrders);
}

async function loadAll() {
  try {
    await Promise.all([loadOrders(), loadZones()]);
    await refreshZoneSessionDrawer();
    lastUpdatedEl.textContent = `最近刷新: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    ordersWrapEl.innerHTML = `<div class="card">加载失败：${error.message}</div>`;
  }
}

ordersWrapEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-order-action="status"]');
  if (!button) return;

  const orderId = button.dataset.id;
  const status = button.dataset.status;

  try {
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

loadAll();
setInterval(loadAll, 5000);
