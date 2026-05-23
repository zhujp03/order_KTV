let menuState = [];
let zonesState = [];
let categoriesState = [];
let zonesRefreshTimer = null;
let zonesLoading = false;

const menuTbodyEl = document.getElementById('menuTbody');
const addMenuBtnEl = document.getElementById('addMenuBtn');
const saveMenuBtnEl = document.getElementById('saveMenuBtn');
const menuMsgEl = document.getElementById('menuMsg');
const categoryNameInputEl = document.getElementById('categoryNameInput');
const addCategoryBtnEl = document.getElementById('addCategoryBtn');
const categoryListEl = document.getElementById('categoryList');
const categoryMsgEl = document.getElementById('categoryMsg');
const bulkMenuInputEl = document.getElementById('bulkMenuInput');
const bulkImportBtnEl = document.getElementById('bulkImportBtn');
const bulkImportMsgEl = document.getElementById('bulkImportMsg');

const zoneListEl = document.getElementById('zoneList');
const zoneLabelInputEl = document.getElementById('zoneLabelInput');
const addZoneBtnEl = document.getElementById('addZoneBtn');

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderMenuTable() {
  if (!menuState.length) {
    menuTbodyEl.innerHTML = '<tr><td colspan="6" class="muted">暂无菜品，先新增一条。</td></tr>';
    return;
  }

  const categoryOptions = categoriesState.length
    ? categoriesState
      .map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`)
      .join('')
    : '<option value="">请先创建分类</option>';

  menuTbodyEl.innerHTML = menuState
    .map(
      (item) => `
      <tr data-id="${item.id}">
        <td><input data-field="name" value="${escapeHtml(item.name)}" /></td>
        <td><input data-field="price" type="number" min="0" step="0.01" value="${Number(item.price).toFixed(2)}" /></td>
        <td>
          <select data-field="category">
            ${categoryOptions}
          </select>
        </td>
        <td><input data-field="description" value="${escapeHtml(item.description || '')}" /></td>
        <td>
          <select data-field="available">
            <option value="true" ${item.available ? 'selected' : ''}>上架</option>
            <option value="false" ${!item.available ? 'selected' : ''}>下架</option>
          </select>
        </td>
        <td><button class="warn" data-action="remove-menu" data-id="${item.id}">删除</button></td>
      </tr>
    `,
    )
    .join('');

  for (const row of menuTbodyEl.querySelectorAll('tr[data-id]')) {
    const id = row.dataset.id;
    const item = menuState.find((menuItem) => menuItem.id === id);
    const categorySelect = row.querySelector('[data-field="category"]');
    if (item && categorySelect) {
      categorySelect.value = item.category || categoriesState[0]?.name || '';
    }
  }
}

function readMenuFromDom() {
  const rows = [...menuTbodyEl.querySelectorAll('tr[data-id]')];
  return rows.map((row) => {
    const id = row.dataset.id;
    const name = row.querySelector('[data-field="name"]').value.trim();
    const price = Number(row.querySelector('[data-field="price"]').value);
    const category = row.querySelector('[data-field="category"]').value.trim();
    const description = row.querySelector('[data-field="description"]').value.trim();
    const available = row.querySelector('[data-field="available"]').value === 'true';
    return { id, name, price, category, description, available };
  });
}

function renderCategoryList() {
  if (!categoriesState.length) {
    categoryListEl.innerHTML = '<span class="muted small">还没有分类。</span>';
    categoryMsgEl.textContent = '请先创建至少一个分类，再新增或保存菜单。';
    return;
  }

  categoryListEl.innerHTML = categoriesState
    .map(
      (category) => `
      <span class="badge" style="display:flex;gap:8px;align-items:center;">
        ${escapeHtml(category.name)}
        <button class="warn small" data-action="delete-category" data-id="${category.id}" style="padding:2px 8px;">删除</button>
      </span>
    `,
    )
    .join('');
  categoryMsgEl.textContent = `已创建 ${categoriesState.length} 个分类。`;
}

function renderZones() {
  if (!zonesState.length) {
    zoneListEl.innerHTML = '<div class="muted">还没有二维码，请先新增桌号/包厢。</div>';
    return;
  }

  zoneListEl.innerHTML = zonesState
    .map(
      (zone) => `
      <div class="qr-card">
        <div class="row wrap" style="justify-content: space-between">
          <strong class="${zone.completed ? 'zone-title completed' : 'zone-title'}">${escapeHtml(zone.label)}</strong>
          <span class="small muted">token: ${zone.token.slice(0, 10)}...</span>
        </div>
        <div class="zone-meta">访问码：<strong>${escapeHtml(zone.accessCode || '----')}</strong></div>
        <div class="zone-meta">当前订单：${zone.activeOrderCount || 0} 单 · 金额：$${Number(zone.activeOrderTotal || 0).toFixed(2)}</div>
        ${
          zone.completed && zone.completedAt
            ? `<div class="zone-done-note">完成时间：${new Date(zone.completedAt).toLocaleString()}</div>`
            : ''
        }
        <img src="${zone.qrPngUrl}&size=280" alt="${escapeHtml(zone.label)} 二维码" />
        <input readonly value="${escapeHtml(zone.accessUrl)}" />
        <div class="row wrap">
          <button class="light" data-action="copy-url" data-url="${escapeHtml(zone.accessUrl)}">复制链接</button>
          <a class="button-link" href="${zone.qrPngUrl}&size=720" download="${escapeHtml(zone.label)}.png">下载 PNG</a>
          <a class="button-link" href="${zone.qrSvgUrl}" download="${escapeHtml(zone.label)}.svg">下载 SVG</a>
          <button data-action="toggle-complete-zone" data-id="${zone.id}" class="light">${zone.completed ? '取消完成' : '标记完成'}</button>
          <button data-action="checkout-zone" data-id="${zone.id}" class="warn">结单清零</button>
          <button data-action="rename-zone" data-id="${zone.id}" class="light">改名</button>
          <button data-action="regenerate-zone" data-id="${zone.id}" class="warn">重置二维码</button>
          <button data-action="rotate-access-code" data-id="${zone.id}" class="light">轮换访问码</button>
          <button data-action="delete-zone" data-id="${zone.id}" class="warn">删除</button>
        </div>
      </div>
      `,
    )
    .join('');
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
    labels.push(type === 'room' ? `${i}包` : `${i}号桌`);
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
  const ok = confirm('重置后，旧二维码将失效。确认继续吗？');
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
  const ok = confirm('确认删除该二维码吗？');
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

async function rotateAccessCode(zoneId) {
  const ok = confirm('轮换后，旧访问码和旧会话会立即失效。确认继续吗？');
  if (!ok) return;

  const res = await fetch(`/api/admin/zones/${encodeURIComponent(zoneId)}/access-code/rotate`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '轮换访问码失败');
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
  const ok = confirm('结单后该桌/包厢订单会自动删除清零，确认吗？');
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

menuTbodyEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="remove-menu"]');
  if (!button) return;

  const id = button.dataset.id;
  menuState = menuState.filter((item) => item.id !== id);
  renderMenuTable();
});

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
  const button = event.target.closest('button[data-action="delete-category"]');
  if (!button) return;
  try {
    await deleteCategory(button.dataset.id);
  } catch (error) {
    alert(`删除分类失败：${error.message}`);
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

    if (action === 'rotate-access-code') {
      await rotateAccessCode(zoneId);
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

(async function init() {
  try {
    await loadCategories();
    await loadMenu();
    await loadZones();
    if (!zonesRefreshTimer) {
      zonesRefreshTimer = setInterval(() => {
        loadZones().catch(() => {
          // 静默失败，避免后台页面频闪
        });
      }, 3000);
    }
  } catch (error) {
    menuMsgEl.textContent = `初始化失败：${error.message}`;
  }
})();
