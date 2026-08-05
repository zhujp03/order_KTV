const noopFn = () => {};
const noopEl = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'addEventListener' || prop === 'removeEventListener' || prop === 'focus' || prop === 'click' || prop === 'scrollIntoView') return noopFn;
    if (prop === 'querySelectorAll') return () => [];
    if (prop === 'querySelector') return () => null;
    if (prop === 'closest') return () => null;
    if (prop === 'contains') return () => false;
    if (prop === 'getBoundingClientRect') return () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
    if (prop === 'classList') return { add: noopFn, remove: noopFn, toggle: () => false, contains: () => false };
    if (prop === 'style') return {};
    if (prop === 'dataset') return {};
    if (prop === Symbol.iterator) return function* () {};
    return noopEl;
  },
  set() { return true; },
});

function getEl(id) {
  return document.getElementById(id) || noopEl;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let menuState = [];
let zonesState = [];
let categoriesState = [];
let zonesRefreshTimer = null;
let zonesLoading = false;
let draggingCategoryId = '';
let selectedZoneId = '';

const menuGroupedListEl = getEl('menuGroupedList');
const addMenuBtnEl = getEl('addMenuBtn');
const saveMenuBtnEl = getEl('saveMenuBtn');
const collapseAllMenuBtnEl = getEl('collapseAllMenuBtn');
const expandAllMenuBtnEl = getEl('expandAllMenuBtn');
const deleteSelectedMenuBtnEl = getEl('deleteSelectedMenuBtn');
const deleteAllMenuBtnEl = getEl('deleteAllMenuBtn');
const menuMsgEl = getEl('menuMsg');
const categoryNameInputEl = getEl('categoryNameInput');
const addCategoryBtnEl = getEl('addCategoryBtn');
const categoryListEl = getEl('categoryList');
const categoryMsgEl = getEl('categoryMsg');
const bulkMenuInputEl = getEl('bulkMenuInput');
const bulkImportBtnEl = getEl('bulkImportBtn');
const bulkImportMsgEl = getEl('bulkImportMsg');

const zoneListEl = getEl('zoneList');
const zoneDetailPanelEl = getEl('zoneDetailPanel');
const zoneLabelInputEl = getEl('zoneLabelInput');
const addZoneBtnEl = getEl('addZoneBtn');
const reportDateInputEl = getEl('reportDateInput');
const loadReportBtnEl = getEl('loadReportBtn');
const reportSummaryEl = getEl('reportSummary');
const reportOrdersListEl = getEl('reportOrdersList');
const employeeDisplayNameInputEl = getEl('employeeDisplayNameInput');
const employeeUsernameInputEl = getEl('employeeUsernameInput');
const employeePasswordInputEl = getEl('employeePasswordInput');
const addEmployeeBtnEl = getEl('addEmployeeBtn');
const employeeManageMsgEl = getEl('employeeManageMsg');
const employeeTbodyEl = getEl('employeeTbody');
let employeesState = [];
let overviewOrdersCount = 0;
let overviewOrdersAmount = 0;
let overviewOpenZoneCount = 0;
let overviewCanCheckoutCount = 0;
let overviewActiveOrderZoneCount = 0;
let overviewEmployeeCount = 0;
let overviewUpdatedAt = '';
let menuHasUnsavedChanges = false;
let menuGroupExpanded = {};


function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function confirmHighRisk(message, extraMessage) {
  if (!confirm(message)) return false;
  if (extraMessage && !confirm(extraMessage)) return false;
  return true;
}

function syncOverviewStats() {
  const summary = document.querySelector('.overview-stats');
  if (!summary) return;
  const overviewText = `今日下单金额：${money(overviewOrdersAmount)} · 今日订单数：${overviewOrdersCount} · 当前开台桌数：${overviewOpenZoneCount} · 当前可结单桌数：${overviewCanCheckoutCount} · 当前有进行中订单桌数：${overviewActiveOrderZoneCount} · 当前员工数：${overviewEmployeeCount} · 最近更新时间：${overviewUpdatedAt || '-'}`;
  summary.textContent = overviewText;
}


function getSelectedZone() {
  return zonesState.find((zone) => zone.id === selectedZoneId) || zonesState[0] || null;
}

function selectZone(zoneId) {
  selectedZoneId = zoneId || '';
  renderZones();
  renderZoneDetailPanel();
}

function zoneSummaryText(zone) {
  const parts = [
    zone.completed ? '已完成' : zone.sessionOpen === false ? '未开台' : '已开台',
    `订单 ${Number(zone.activeOrderCount || 0)}`,
    `金额 ${money(zone.activeOrderTotal || 0)}`,
  ];
  if (zone.canCheckout !== false) {
    parts.push('可结单');
  }
  return parts.join(' · ');
}

function renderZoneDetailPanel() {
  if (!zoneDetailPanelEl) return;
  const zone = getSelectedZone();
  if (!zone) {
    zoneDetailPanelEl.className = 'manage-zone-detail-empty';
    zoneDetailPanelEl.innerHTML = '先在左侧列表选择一个桌台。';
    return;
  }

  const completedNote = zone.completed && zone.completedAt
    ? `<div class="zone-done-note">完成时间：${new Date(zone.completedAt).toLocaleString()}</div>`
    : '';

  zoneDetailPanelEl.className = 'manage-zone-detail';
  zoneDetailPanelEl.innerHTML = `
    <div class="qr-card">
      <div class="row wrap" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <strong style="font-size: 1.05rem;">${escapeHtml(zone.label)}</strong>
          <div class="zone-meta" style="margin-top: 4px;">${escapeHtml(zoneSummaryText(zone))}</div>
        </div>
        <span class="badge">token: ${escapeHtml(zone.token.slice(0, 10))}...</span>
      </div>
      ${completedNote}
      <div class="small muted">二维码预览</div>
      <img src="${zone.qrPngUrl}&size=280" alt="${escapeHtml(zone.label)} 二维码" />
      <label class="small muted">访问链接</label>
      <input readonly value="${escapeHtml(zone.accessUrl)}" />
      <div class="row wrap">
        <button class="light" data-action="copy-url" data-url="${escapeHtml(zone.accessUrl)}">复制链接</button>
        <a class="button-link" href="${zone.qrPngUrl}&size=720" download="${escapeHtml(zone.label)}.png">下载 PNG</a>
        <a class="button-link" href="${zone.qrSvgUrl}" download="${escapeHtml(zone.label)}.svg">下载 SVG</a>
      </div>
    </div>

    <div class="manage-danger-box">
      <h4 style="margin: 0 0 8px;">操作</h4>
      <div class="row wrap">
        <button data-action="toggle-complete-zone" data-id="${zone.id}" class="light">${zone.completed ? '取消完成' : '标记完成'}</button>
        <button data-action="checkout-zone" data-id="${zone.id}" class="warn">结单清零</button>
        <button data-action="rename-zone" data-id="${zone.id}" class="light">改名</button>
      </div>
    </div>

    <div class="manage-danger-box">
      <h4 style="margin: 0 0 8px;">高危操作区</h4>
      <p class="small muted" style="margin: 0 0 10px;">重置二维码或删除桌台会让已打印旧二维码失效，请谨慎操作。</p>
      <div class="row wrap">
        <button data-action="regenerate-zone" data-id="${zone.id}" class="warn">重置二维码</button>
        <button data-action="delete-zone" data-id="${zone.id}" class="warn">删除桌台</button>
      </div>
    </div>
  `;
}

function renderZones() {
  if (!zonesState.length) {
    zoneListEl.innerHTML = '<div class="muted">还没有二维码，请先新增桌号/包厢。</div>';
    if (zoneDetailPanelEl) {
      zoneDetailPanelEl.className = 'manage-zone-detail-empty';
      zoneDetailPanelEl.innerHTML = '还没有桌台，先创建一个再查看详情。';
    }
    return;
  }

  if (!zonesState.some((zone) => zone.id === selectedZoneId)) {
    selectedZoneId = zonesState[0]?.id || '';
  }

  zoneListEl.innerHTML = zonesState
    .map(
      (zone) => `
      <div class="qr-card manage-zone-card ${zone.id === selectedZoneId ? 'active' : ''}" data-action="select-zone" data-id="${zone.id}">
        <div class="row wrap" style="justify-content: space-between">
          <strong class="${zone.completed ? 'zone-title completed' : 'zone-title'}">${escapeHtml(zone.label)}</strong>
          <span class="small muted">${escapeHtml(zone.completed ? '已完成' : zone.sessionOpen === false ? '未开台' : '已开台')}</span>
        </div>
        <div class="zone-meta">当前订单：${zone.activeOrderCount || 0} 单 · 金额：${money(zone.activeOrderTotal || 0)}</div>
        <div class="zone-meta">${escapeHtml(zone.canCheckout !== false ? '可结单' : '暂不可结单')}</div>
      </div>
      `,
    )
    .join('');

  renderZoneDetailPanel();
}



function renderMenuTable() {
  if (!menuGroupedListEl) return;

  if (!menuState.length) {
    menuGroupedListEl.innerHTML = '<div class="muted small" style="padding:24px 0;text-align:center;">暂无菜品，先新增一条。</div>';
    return;
  }

  const categoryOptions = categoriesState.length
    ? categoriesState
      .map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`)
      .join('')
    : '<option value="">请先创建分类</option>';

  const grouped = new Map();
  for (const item of menuState) {
    const key = item.category || '未分类';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  const orderedCategories = categoriesState.length
    ? [
        ...categoriesState.map((category) => category.name),
        ...[...grouped.keys()].filter((name) => !categoriesState.some((category) => category.name === name)),
      ]
    : [...grouped.keys()];

  menuGroupedListEl.innerHTML = orderedCategories
    .filter((categoryName, index, self) => self.indexOf(categoryName) === index)
    .map((categoryName) => {
      const items = grouped.get(categoryName) || [];
      if (!items.length) return '';
      const category = categoriesState.find((c) => c.name === categoryName);
      const categoryId = category ? category.id : '';
      const expanded = menuGroupExpanded[categoryName] !== false;
      return `
        <section class="menu-category-block" data-category-block="${escapeHtml(categoryName)}">
          <header class="menu-category-head">
            <div class="menu-category-title">
              <button class="menu-category-toggle" type="button" data-action="toggle-category-group" data-category="${escapeHtml(categoryName)}">${expanded ? '▼' : '▶'}</button>
              <span class="menu-category-name">${escapeHtml(categoryName)}</span>
              <span class="menu-category-count">${items.length}</span>
            </div>
            <div class="menu-category-actions">
              <button class="btn-ghost small" type="button" data-action="add-item-to-category" data-category="${escapeHtml(categoryName)}">+ 添加</button>
              <button class="btn-ghost small" type="button" data-action="rename-category-from-group" data-category-id="${escapeHtml(categoryId)}" data-category-name="${escapeHtml(categoryName)}">改名</button>
              <button class="btn-danger small" type="button" data-action="delete-category-from-group" data-category-id="${escapeHtml(categoryId)}" data-category-name="${escapeHtml(categoryName)}">移除</button>
            </div>
          </header>
          ${expanded ? `
          <div class="menu-items-wrap">
            ${items.map((item) => `
            <div class="menu-item-row" data-id="${item.id}">
              <div class="menu-item-check">
                <input type="checkbox" data-menu-select="${item.id}" />
              </div>
              <div class="menu-item-main">
                <div class="menu-item-field">
                  <label>名称</label>
                  <input data-field="name" value="${escapeHtml(item.name)}" />
                </div>
                <div class="menu-item-field menu-item-field-price">
                  <label>价格</label>
                  <input data-field="price" type="number" min="0" step="0.01" value="${Number(item.price).toFixed(2)}" />
                </div>
                <div class="menu-item-field menu-item-field-desc">
                  <label>描述</label>
                  <input data-field="description" value="${escapeHtml(item.description || '')}" placeholder="—" />
                </div>
                <div class="menu-item-field menu-item-field-category">
                  <label>分类</label>
                  <select data-field="category">${categoryOptions}</select>
                </div>
                <div class="menu-item-field menu-item-field-status">
                  <label>状态</label>
                  <select data-field="available">
                    <option value="true" ${item.available ? 'selected' : ''}>上架</option>
                    <option value="false" ${!item.available ? 'selected' : ''}>下架</option>
                  </select>
                </div>
              </div>
              <div class="menu-item-actions">
                <button class="btn-primary small" type="button" data-action="save-menu-item" data-id="${item.id}">更新</button>
                <button class="btn-danger small" type="button" data-action="remove-menu-item" data-id="${item.id}">删除</button>
              </div>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </section>
      `;
    })
    .join('');

  for (const row of menuGroupedListEl.querySelectorAll('.menu-item-row[data-id]')) {
    const id = row.dataset.id;
    const item = menuState.find((menuItem) => menuItem.id === id);
    const categorySelect = row.querySelector('[data-field="category"]');
    if (item && categorySelect) {
      categorySelect.value = item.category || categoriesState[0]?.name || '';
    }
  }
}

async function saveMenuItem(itemId) {
  const row = menuGroupedListEl.querySelector(`.menu-item-row[data-id="${itemId}"]`);
  if (!row) return;
  const item = menuState.find((entry) => entry.id === itemId);
  if (!item) return;

  const name = row.querySelector('[data-field="name"]')?.value.trim() || item.name;
  const priceValue = row.querySelector('[data-field="price"]')?.value;
  const description = row.querySelector('[data-field="description"]')?.value || '';
  const category = row.querySelector('[data-field="category"]')?.value || item.category;
  const available = row.querySelector('[data-field="available"]')?.value === 'true';

  const nextPrice = Number(priceValue);
  if (!Number.isFinite(nextPrice) || nextPrice < 0) {
    menuMsgEl.textContent = '请输入有效价格。';
    return;
  }

  item.name = name;
  item.price = nextPrice;
  item.description = description;
  item.category = category;
  item.available = available;

  menuMsgEl.textContent = `已保存 ${name}。`;
}

function renderCategoryList() {
  if (!categoriesState.length) {
    categoryListEl.innerHTML = '<span class="muted small">还没有分类。</span>';
    categoryMsgEl.textContent = '请先创建至少一个分类，再新增或保存菜单。';
    return;
  }

  categoryListEl.innerHTML = `
    <table class="table" style="margin-top: 4px">
      <thead>
        <tr>
          <th style="width:34px">排序</th>
          <th>分类名</th>
          <th style="width: 170px">操作</th>
        </tr>
      </thead>
      <tbody>
        ${categoriesState
          .map(
            (category) => `
            <tr data-category-row="${category.id}">
              <td style="width:34px;color:#888;cursor:grab;" title="拖拽排序" draggable="true" data-drag-handle="category">☰</td>
              <td><input data-category-field="name" value="${escapeHtml(category.name)}" /></td>
              <td>
                <div class="row wrap">
                  <button class="secondary small" data-action="rename-category" data-id="${category.id}" style="padding:6px 10px;">保存</button>
                  <button class="warn small" data-action="delete-category" data-id="${category.id}" style="padding:6px 10px;">删除</button>
                </div>
              </td>
            </tr>
          `,
          )
          .join('')}
      </tbody>
    </table>
  `;
  categoryMsgEl.textContent = `已创建 ${categoriesState.length} 个分类。`;
}

function getSelectedMenuIds() {
  return [...menuGroupedListEl.querySelectorAll('input[data-menu-select]:checked')].map((el) => el.dataset.menuSelect);
}

function deleteSelectedMenuRows() {
  const selectedIds = getSelectedMenuIds();
  if (!selectedIds.length) {
    alert('请先勾选要删除的菜品。');
    return;
  }
  const ok = confirm(`确认删除勾选的 ${selectedIds.length} 个菜品吗？`);
  if (!ok) return;
  const selectedSet = new Set(selectedIds);
  menuState = menuState.filter((item) => !selectedSet.has(item.id));
  renderMenuTable();
  menuMsgEl.textContent = `已删除 ${selectedIds.length} 个菜品，请点击“保存菜单”生效。`;
}

function deleteAllMenuRows() {
  if (!menuState.length) return;
  const ok = confirm(`确认删除全部 ${menuState.length} 个菜品吗？`);
  if (!ok) return;
  menuState = [];
  renderMenuTable();
  menuMsgEl.textContent = '已清空全部菜品，请点击“保存菜单”生效。';
}

async function saveCategoryOrderFromDom() {
  const ids = [...categoryListEl.querySelectorAll('tr[data-category-row]')].map((row) => row.dataset.categoryRow);
  if (!ids.length) return;
  const res = await fetch('/api/admin/categories/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '分类排序保存失败');
  }
  categoriesState = Array.isArray(data.categories) ? data.categories : categoriesState;
  renderCategoryList();
  renderMenuTable();
}

async function loadMenu() {
  const res = await fetch('/api/admin/menu');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '菜单加载失败');
  }
  categoriesState = Array.isArray(data.categories) ? data.categories : categoriesState;
  renderCategoryList();
  menuState = Array.isArray(data.menu) ? data.menu : [];
  renderMenuTable();
}

async function loadCategories() {
  const res = await fetch('/api/admin/categories');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '分类加载失败');
  }
  categoriesState = Array.isArray(data.categories) ? data.categories : [];
  renderCategoryList();
}

async function addCategory() {
  const name = categoryNameInputEl.value.trim();
  if (!name) {
    throw new Error('请输入分类名称。');
  }

  const res = await fetch('/api/admin/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '创建分类失败');
  }
  categoriesState = Array.isArray(data.categories) ? data.categories : categoriesState;
  categoryNameInputEl.value = '';
  renderCategoryList();
  renderMenuTable();
}

async function deleteCategory(categoryId) {
  const ok = confirm('确认删除该分类吗？如果菜单中正在使用会被阻止。');
  if (!ok) return;

  const res = await fetch(`/api/admin/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '删除分类失败');
  }
  categoriesState = Array.isArray(data.categories) ? data.categories : categoriesState;
  renderCategoryList();
  renderMenuTable();
}

async function renameCategory(categoryId, nextName) {
  const name = String(nextName || '').trim();
  if (!name) {
    throw new Error('分类名称不能为空。');
  }
  const res = await fetch(`/api/admin/categories/${encodeURIComponent(categoryId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '分类改名失败');
  }
  categoriesState = Array.isArray(data.categories) ? data.categories : categoriesState;
  if (Array.isArray(data.menu)) {
    menuState = data.menu;
  }
  renderCategoryList();
  renderMenuTable();
}

async function saveMenu() {
  if (!categoriesState.length) {
    menuMsgEl.textContent = '请先创建至少一个分类。';
    return;
  }

  menuMsgEl.textContent = '保存中...';
  try {
    const menu = readMenuFromDom();
    const res = await fetch('/api/admin/menu', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '保存失败');
    }
    menuState = data.menu;
    categoriesState = Array.isArray(data.categories) ? data.categories : categoriesState;
    renderCategoryList();
    renderMenuTable();
    menuMsgEl.textContent = `已保存，共 ${menuState.length} 个菜品。`;
  } catch (error) {
    menuMsgEl.textContent = `保存失败：${error.message}`;
  }
}

async function bulkImportMenuText() {
  const text = bulkMenuInputEl.value.trim();
  if (!text) {
    bulkImportMsgEl.textContent = '请先粘贴要导入的文本。';
    return;
  }

  bulkImportBtnEl.disabled = true;
  bulkImportMsgEl.textContent = '导入中...';
  try {
    const res = await fetch('/api/admin/menu/import-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '批量导入失败');
    }
    menuState = Array.isArray(data.menu) ? data.menu : menuState;
    categoriesState = Array.isArray(data.categories) ? data.categories : categoriesState;
    renderCategoryList();
    renderMenuTable();
    bulkMenuInputEl.value = '';
    bulkImportMsgEl.textContent = `导入完成：新增 ${Number(data.importedCount || 0)} 个菜品。`;
    menuMsgEl.textContent = `已保存，共 ${menuState.length} 个菜品。`;
  } catch (error) {
    bulkImportMsgEl.textContent = `导入失败：${error.message}`;
  } finally {
    bulkImportBtnEl.disabled = false;
  }
}

async function loadZones() {
  if (zonesLoading) return;
  zonesLoading = true;
  const res = await fetch('/api/admin/zones');
  const data = await res.json();
  try {
    if (!res.ok) {
      throw new Error(data.error || '二维码加载失败');
    }
    zonesState = Array.isArray(data.zones) ? data.zones : [];
    renderZones();
    overviewOpenZoneCount = zonesState.filter((zone) => zone.completed !== true && zone.sessionOpen !== false).length;
    overviewCanCheckoutCount = zonesState.filter((zone) => zone.canCheckout !== false).length;
    overviewActiveOrderZoneCount = zonesState.filter((zone) => Number(zone.activeOrderCount || 0) > 0).length;
    syncOverviewStats();
  } finally {
    zonesLoading = false;
  }
}

async function addZoneByLabel(label) {
  const res = await fetch('/api/admin/zones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '新增失败');
  }
  return data.zone;
}

function parseBatchZoneInput(raw) {
  const text = String(raw || '').trim().replace(/\s+/g, '');
  if (!text) {
    throw new Error('请输入数量，例如：5个包厢 或 8桌。');
  }

  const countMatch = text.match(/(\d{1,3})/);
  if (!countMatch) {
    throw new Error('没有识别到数量，请输入阿拉伯数字，例如：5个包厢。');
  }

  const count = Number(countMatch[1]);
  if (!Number.isInteger(count) || count < 1 || count > 300) {
    throw new Error('数量范围应为 1 到 300。');
  }

  const hasRoom = /包厢|包间|包房|包/.test(text);
  const hasTable = /桌子|桌/.test(text);

  if (hasRoom && hasTable) {
    throw new Error('同时识别到“包厢”和“桌子”，请只输入一种类型。');
  }

  if (!hasRoom && !hasTable) {
    throw new Error('未识别类型，请包含“包厢/包”或“桌/桌子”。');
  }

  return { type: hasRoom ? 'room' : 'table', count };
}

function buildBatchLabels(type, count) {
  const labels = [];
  for (let i = 1; i <= count; i += 1) {
    labels.push(type === 'room' ? `Room ${i}` : `${i}号桌`);
  }
  return labels;
}

async function createZonesInBatchFromInput() {
  const parsed = parseBatchZoneInput(zoneLabelInputEl.value);
  const labels = buildBatchLabels(parsed.type, parsed.count);
  const existing = new Set(zonesState.map((zone) => zone.label));

  let created = 0;
  let skipped = 0;
  for (const label of labels) {
    if (existing.has(label)) {
      skipped += 1;
      continue;
    }

    await addZoneByLabel(label);
    created += 1;
    existing.add(label);
  }

  zoneLabelInputEl.value = '';
  await loadZones();

  if (created === 0) {
    alert(`没有新增。目标名称已存在，跳过 ${skipped} 个。`);
    return;
  }

  alert(`已批量生成 ${created} 个二维码${skipped ? `，跳过 ${skipped} 个重名` : ''}。`);
}

async function renameZone(zoneId) {
  const zone = zonesState.find((z) => z.id === zoneId);
  const nextLabel = prompt('请输入新的桌号/包厢名称：', zone?.label || '');
  if (!nextLabel) return;

  const res = await fetch(`/api/admin/zones/${encodeURIComponent(zoneId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: nextLabel.trim() }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '改名失败');
  }
  await loadZones();
}

async function regenerateZone(zoneId) {
  const ok = confirmHighRisk(
    '重新生成二维码后，已打印的旧二维码将永久失效。确认继续吗？',
    '再次确认：这会让旧二维码永久失效。是否继续？',
  );
  if (!ok) return;

  const res = await fetch(`/api/admin/zones/${encodeURIComponent(zoneId)}/regenerate`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '重置失败');
  }
  await loadZones();
}

async function deleteZone(zoneId) {
  const zone = zonesState.find((z) => z.id === zoneId);
  const msg = zone
    ? `确认删除桌台/包厢 "${zone.label}" 吗？已打印的旧二维码将永久失效，相关数据将按现有接口规则处理。`
    : '确认删除该桌台吗？';
  const ok = confirmHighRisk(msg, '再次确认：删除后旧二维码将永久失效。是否继续？');
  if (!ok) return;

  const res = await fetch(`/api/admin/zones/${encodeURIComponent(zoneId)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '删除失败');
  }
  await loadZones();
}

async function toggleZoneCompletion(zoneId, completed) {
  const res = await fetch(`/api/admin/zones/${encodeURIComponent(zoneId)}/completion`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '更新完成状态失败');
  }
  await loadZones();
}

async function checkoutZone(zoneId) {
  const ok = confirmHighRisk('结单后该桌/包厢订单会自动删除清零，确认吗？', '再次确认：结单后当前桌台数据会被清空，是否继续？');
  if (!ok) return;

  const res = await fetch(`/api/admin/zones/${encodeURIComponent(zoneId)}/checkout`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '结单失败');
  }
  alert(`结单完成，已清空 ${data.clearedOrders} 笔订单。`);
  await loadZones();
}

function renderDailyReport(data) {
  if (!data || !Array.isArray(data.orders)) {
    reportSummaryEl.textContent = '查询失败。';
    reportOrdersListEl.innerHTML = '';
    return;
  }

  overviewOrdersCount = Number(data.count || 0);
  overviewOrdersAmount = Number(data.totalAmount || 0);
  overviewUpdatedAt = new Date().toLocaleString();
  syncOverviewStats();

  reportSummaryEl.textContent = `日期：${data.date} · 订单：${data.count} 单 · 总金额：${money(data.totalAmount)}`;

  if (!data.orders.length) {
    reportOrdersListEl.innerHTML = '<div class="muted">当天没有订单。</div>';
    return;
  }

  reportOrdersListEl.innerHTML = data.orders
    .map((order) => {
      const itemsHtml = (order.items || [])
        .map((item) => `<li>${escapeHtml(item.name)} x ${Number(item.quantity || 0)} (${money(item.subtotal)})</li>`)
        .join('');
      const sourceText = order.source === 'history' ? '历史' : '进行中';
      const customerName = String(order.customerName || '').trim() || '未填写';
      const handledBy = String(order.handledByEmployeeUsername || '').trim() || '-';
      return `
        <div class="qr-card">
          <div class="row wrap" style="justify-content: space-between">
            <strong>${escapeHtml(order.zoneLabel || '-')} · 订单 ${escapeHtml((order.id || '').slice(0, 8))}</strong>
            <span class="small muted">${escapeHtml(sourceText)} · ${escapeHtml(order.status || '-')}</span>
          </div>
          <div class="small muted">时间：${new Date(order.createdAt).toLocaleString()}</div>
          <div class="small muted">下单人：${escapeHtml(customerName)}</div>
          <div class="small muted">订单状态处理员工：${escapeHtml(handledBy)}</div>
          <ul style="margin:8px 0">${itemsHtml}</ul>
          <div><strong>合计：${money(order.total)}</strong></div>
          <div class="small muted">备注：${escapeHtml(order.note || '无')}</div>
        </div>
      `;
    })
    .join('');
}


async function loadDailyReport() {
  const date = String(reportDateInputEl?.value || '').trim();
  if (!date) {
    reportSummaryEl.textContent = '请先选择日期。';
    return;
  }

  loadReportBtnEl.disabled = true;
  reportSummaryEl.textContent = '查询中...';
  try {
    const tzOffsetMinutes = new Date().getTimezoneOffset();
    const query = new URLSearchParams({ date, tzOffsetMinutes: String(tzOffsetMinutes) });
    const res = await fetch(`/api/admin/orders/by-day?${query.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '查询失败');
    }
    renderDailyReport(data);
  } catch (error) {
    reportSummaryEl.textContent = `查询失败：${error.message}`;
    reportOrdersListEl.innerHTML = '';
  } finally {
    loadReportBtnEl.disabled = false;
  }
}

function renderEmployees() {
  if (!employeeTbodyEl) return;
  if (!employeesState.length) {
    employeeTbodyEl.innerHTML = '<tr><td colspan="4" class="muted">暂无员工</td></tr>';
    return;
  }
  employeeTbodyEl.innerHTML = employeesState
    .map((emp) => `
      <tr data-employee-id="${emp.id}">
        <td><input data-field="displayName" value="${escapeHtml(emp.displayName || '')}" /></td>
        <td><input data-field="username" value="${escapeHtml(emp.username || '')}" /></td>
        <td><input data-field="password" type="password" placeholder="留空不修改密码" /></td>
        <td>
          <div class="row wrap">
            <button class="secondary small" data-action="save-employee" data-id="${emp.id}" style="padding:6px 10px;">保存</button>
            <button class="warn small" data-action="delete-employee" data-id="${emp.id}" style="padding:6px 10px;">删除</button>
          </div>
        </td>
      </tr>
    `)
    .join('');
}

async function loadEmployees() {
  const res = await fetch('/api/admin/employees');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '员工加载失败');
  employeesState = Array.isArray(data.employees) ? data.employees : [];
  overviewEmployeeCount = employeesState.length;
  syncOverviewStats();
  renderEmployees();
}

async function addEmployee() {
  const displayName = String(employeeDisplayNameInputEl.value || '').trim();
  const username = String(employeeUsernameInputEl.value || '').trim();
  const password = String(employeePasswordInputEl.value || '').trim();
  if (!displayName || !username || !password) {
    throw new Error('请输入真实姓名、用户名和密码。');
  }
  const res = await fetch('/api/admin/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '新增员工失败');
  employeeDisplayNameInputEl.value = '';
  employeeUsernameInputEl.value = '';
  employeePasswordInputEl.value = '';
  employeesState = Array.isArray(data.employees) ? data.employees : employeesState;
  renderEmployees();
}

async function saveEmployee(employeeId, displayName, username, password) {
  const body = { displayName, username };
  if (String(password || '').trim()) body.password = String(password).trim();
  const res = await fetch(`/api/admin/employees/${encodeURIComponent(employeeId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '保存员工失败');
  employeesState = Array.isArray(data.employees) ? data.employees : employeesState;
  renderEmployees();
}

async function deleteEmployee(employeeId) {
  const ok = confirm('确认删除该员工吗？该员工会被立即踢下线。');
  if (!ok) return;
  const res = await fetch(`/api/admin/employees/${encodeURIComponent(employeeId)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '删除员工失败');
  employeesState = Array.isArray(data.employees) ? data.employees : employeesState;
  renderEmployees();
}

if (menuGroupedListEl) {
  menuGroupedListEl.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) {
      const action = button.dataset.action;
      const itemId = button.dataset.id;
      const categoryName = button.dataset.category || '';
      const categoryId = button.dataset.categoryId || '';
      try {
        if (action === 'save-menu-item') {
          await saveMenuItem(itemId);
          return;
        }
        if (action === 'remove-menu-item') {
          menuState = menuState.filter((item) => item.id !== itemId);
          renderMenuTable();
          menuMsgEl.textContent = '已删除 1 个菜品，请点击“保存菜单”生效。';
          return;
        }
        if (action === 'toggle-category-group') {
          menuGroupExpanded[categoryName] = !menuGroupExpanded[categoryName];
          renderMenuTable();
          return;
        }
        if (action === 'add-item-to-category') {
          if (!categoriesState.length) {
            alert('请先创建分类。');
            return;
          }
          menuState.push({ id: uid(), name: '新菜品', price: 0, category: categoryName || categoriesState[0].name, description: '', available: true });
          renderMenuTable();
          return;
        }
        if (action === 'rename-category-from-group') {
          const row = categoryListEl.querySelector('tr[data-category-row="' + categoryId + '"]');
          const input = row?.querySelector('input[data-category-field="name"]');
          await renameCategory(categoryId, input?.value || categoryName);
          return;
        }
        if (action === 'delete-category-from-group') {
          await deleteCategory(categoryId);
          return;
        }
      } catch (error) {
        alert(`菜单操作失败：${error.message}`);
      }
      return;
    }
  });
}

if (collapseAllMenuBtnEl) {
  collapseAllMenuBtnEl.addEventListener('click', () => {
    for (const category of categoriesState) menuGroupExpanded[category.name] = false;
    renderMenuTable();
  });
}

if (expandAllMenuBtnEl) {
  expandAllMenuBtnEl.addEventListener('click', () => {
    menuGroupExpanded = {};
    renderMenuTable();
  });
}

addMenuBtnEl.addEventListener('click', () => {
  if (!categoriesState.length) {
    alert('请先创建分类。');
    return;
  }

  menuState.push({
    id: uid(),
    name: '新菜品',
    price: 0,
    category: categoriesState[0].name,
    description: '',
    available: true,
  });
  renderMenuTable();
});

saveMenuBtnEl.addEventListener('click', saveMenu);
deleteSelectedMenuBtnEl.addEventListener('click', deleteSelectedMenuRows);
deleteAllMenuBtnEl.addEventListener('click', deleteAllMenuRows);

addCategoryBtnEl.addEventListener('click', async () => {
  try {
    await addCategory();
  } catch (error) {
    alert(`分类创建失败：${error.message}`);
  }
});
bulkImportBtnEl.addEventListener('click', bulkImportMenuText);

categoryNameInputEl.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  try {
    await addCategory();
  } catch (error) {
    alert(`分类创建失败：${error.message}`);
  }
});

categoryListEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  try {
    const action = button.dataset.action;
    const categoryId = button.dataset.id;
    if (action === 'delete-category') {
      await deleteCategory(categoryId);
      return;
    }
    if (action === 'rename-category') {
      const row = button.closest('tr[data-category-row]');
      const input = row?.querySelector('input[data-category-field="name"]');
      await renameCategory(categoryId, input?.value || '');
    }
  } catch (error) {
    alert(`分类操作失败：${error.message}`);
  }
});

categoryListEl.addEventListener('dragstart', (event) => {
  const handle = event.target.closest('[data-drag-handle="category"]');
  if (!handle) return;
  const row = handle.closest('tr[data-category-row]');
  if (!row) return;
  draggingCategoryId = row.dataset.categoryRow || '';
  row.style.opacity = '0.5';
  event.dataTransfer.effectAllowed = 'move';
});

categoryListEl.addEventListener('dragend', (event) => {
  const row = event.target && typeof event.target.closest === 'function'
    ? event.target.closest('tr[data-category-row]')
    : null;
  if (row) row.style.opacity = '';
});

categoryListEl.addEventListener('dragover', (event) => {
  const targetRow = event.target.closest('tr[data-category-row]');
  if (!targetRow || !draggingCategoryId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
});

categoryListEl.addEventListener('drop', async (event) => {
  const targetRow = event.target.closest('tr[data-category-row]');
  if (!targetRow || !draggingCategoryId) return;
  event.preventDefault();

  const draggingRow = categoryListEl.querySelector(`tr[data-category-row="${draggingCategoryId}"]`);
  if (!draggingRow || draggingRow === targetRow) return;

  const rect = targetRow.getBoundingClientRect();
  const placeAfter = event.clientY > rect.top + rect.height / 2;
  if (placeAfter) {
    targetRow.parentNode.insertBefore(draggingRow, targetRow.nextSibling);
  } else {
    targetRow.parentNode.insertBefore(draggingRow, targetRow);
  }

  draggingCategoryId = '';
  try {
    await saveCategoryOrderFromDom();
    categoryMsgEl.textContent = `分类顺序已更新。`;
  } catch (error) {
    alert(`保存排序失败：${error.message}`);
    await loadCategories();
    renderMenuTable();
  }
});

addZoneBtnEl.addEventListener('click', async () => {
  try {
    await createZonesInBatchFromInput();
  } catch (error) {
    alert(`生成失败：${error.message}`);
  }
});

zoneLabelInputEl.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();

  try {
    await createZonesInBatchFromInput();
  } catch (error) {
    alert(`生成失败：${error.message}`);
  }
});

zoneListEl.addEventListener('click', async (event) => {
  const card = event.target.closest('.manage-zone-card[data-action="select-zone"]');
  if (card) {
    selectZone(card.dataset.id || '');
    return;
  }

  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const zoneId = button.dataset.id;

  try {
    if (action === 'copy-url') {
      await navigator.clipboard.writeText(button.dataset.url || '');
      alert('已复制链接。');
      return;
    }

    if (action === 'rename-zone') {
      await renameZone(zoneId);
      return;
    }

    if (action === 'toggle-complete-zone') {
      const zone = zonesState.find((z) => z.id === zoneId);
      await toggleZoneCompletion(zoneId, !(zone?.completed === true));
      return;
    }

    if (action === 'checkout-zone') {
      await checkoutZone(zoneId);
      return;
    }

    if (action === 'regenerate-zone') {
      await regenerateZone(zoneId);
      return;
    }

    if (action === 'delete-zone') {
      await deleteZone(zoneId);
      return;
    }
  } catch (error) {
    alert(`${action} 失败：${error.message}`);
  }
});

if (loadReportBtnEl) {
  loadReportBtnEl.addEventListener('click', async () => {
    await loadDailyReport();
  });
}

if (addEmployeeBtnEl) {
  addEmployeeBtnEl.addEventListener('click', async () => {
    try {
      employeeManageMsgEl.textContent = '保存中...';
      await addEmployee();
      employeeManageMsgEl.textContent = `已保存，共 ${employeesState.length} 个员工。`;
    } catch (error) {
      employeeManageMsgEl.textContent = `操作失败：${error.message}`;
    }
  });
}

if (employeeTbodyEl) {
  employeeTbodyEl.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const employeeId = button.dataset.id;
    const action = button.dataset.action;
    const row = button.closest('tr[data-employee-id]');
    const displayNameInput = row?.querySelector('input[data-field="displayName"]');
    const usernameInput = row?.querySelector('input[data-field="username"]');
    const passwordInput = row?.querySelector('input[data-field="password"]');

    try {
      employeeManageMsgEl.textContent = '保存中...';
      if (action === 'save-employee') {
        await saveEmployee(
          employeeId,
          displayNameInput?.value || '',
          usernameInput?.value || '',
          passwordInput?.value || '',
        );
        if (passwordInput) passwordInput.value = '';
      } else if (action === 'delete-employee') {
        await deleteEmployee(employeeId);
      }
      employeeManageMsgEl.textContent = `已保存，共 ${employeesState.length} 个员工。`;
    } catch (error) {
      employeeManageMsgEl.textContent = `操作失败：${error.message}`;
    }
  });
}

function detectPage() {
  const path = location.pathname || '';
  if (path.endsWith('/admin_manage/menu.html')) return 'menu';
  if (path.endsWith('/admin_manage/zones.html')) return 'zones';
  if (path.endsWith('/admin_manage/reports.html')) return 'reports';
  if (path.endsWith('/admin_manage/employees.html')) return 'employees';
  return 'overview';
}

const page = detectPage();

(async function init() {
  try {
    if (page === 'overview') {
      await loadZones();
      await loadEmployees();
      syncOverviewStats();
    } else if (page === 'menu') {
      await loadCategories();
      await loadMenu();
    } else if (page === 'zones') {
      await loadZones();
      if (!zonesRefreshTimer) {
        zonesRefreshTimer = setInterval(() => {
          loadZones().catch(() => {
            // 静默失败，避免后台页面频闪
          });
        }, 3000);
      }
    } else if (page === 'reports') {
      if (reportDateInputEl) {
        reportDateInputEl.value = new Date().toISOString().slice(0, 10);
        await loadDailyReport();
      }
    } else if (page === 'employees') {
      await loadEmployees();
    }
  } catch (error) {
    if (page === 'menu') {
      menuMsgEl.textContent = `初始化失败：${error.message}`;
    } else if (page === 'employees') {
      employeeManageMsgEl.textContent = `初始化失败：${error.message}`;
    }
  }
})();
