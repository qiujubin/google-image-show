// 环境检测与存储封装（本地预览兼容）
const isExtensionEnv = typeof chrome !== 'undefined' && chrome?.storage?.sync;
const storage = {
  get(keys, cb) {
    if (isExtensionEnv) return chrome.storage.sync.get(keys, cb);
    const obj = {};
    keys.forEach(k => {
      const v = localStorage.getItem(k);
      obj[k] = v ? JSON.parse(v) : undefined;
    });
    cb(obj);
  },
  set(obj, cb) {
    if (isExtensionEnv) return chrome.storage.sync.set(obj, cb);
    Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    cb?.();
  }
};

// --- 规则解析与校验 ---
function isValidDomain(d) {
  const re = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  return re.test(d);
}

function parseInput(text) {
  const lines = text.split('\n')
    .map(s => s.trim().toLowerCase())
    .filter(s => s !== '' && !s.startsWith('#'));
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const d of lines) {
    if (!isValidDomain(d)) { invalid.push(d); continue; }
    if (!seen.has(d)) { seen.add(d); valid.push(d); }
  }
  const dupCount = lines.length - (valid.length + invalid.length);
  return { valid, invalid, dupCount };
}

function renderCombinedStats(parsedAllow, parsedBlock) {
  const valid = parsedAllow.valid.length + parsedBlock.valid.length;
  const invalid = parsedAllow.invalid.length + parsedBlock.invalid.length;
  const dupCount = parsedAllow.dupCount + parsedBlock.dupCount;
  document.getElementById('count-valid').textContent = String(valid);
  document.getElementById('count-invalid').textContent = String(invalid);
  document.getElementById('count-dup').textContent = String(dupCount);

  const prevA = document.getElementById('previewAllow');
  const prevB = document.getElementById('previewBlock');
  prevA.innerHTML = '';
  prevB.innerHTML = '';
  parsedAllow.valid.slice(0, 30).forEach(v => {
    const el = document.createElement('span'); el.className = 'pill'; el.textContent = v; prevA.appendChild(el);
  });
  parsedAllow.invalid.slice(0, 10).forEach(v => {
    const el = document.createElement('span'); el.className = 'pill invalid'; el.textContent = v || '（空行）'; prevA.appendChild(el);
  });
  parsedBlock.valid.slice(0, 30).forEach(v => {
    const el = document.createElement('span'); el.className = 'pill'; el.textContent = v; prevB.appendChild(el);
  });
  parsedBlock.invalid.slice(0, 10).forEach(v => {
    const el = document.createElement('span'); el.className = 'pill invalid'; el.textContent = v || '（空行）'; prevB.appendChild(el);
  });
}

function showFeedback(msg, type = '') {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.className = 'feedback' + (type ? ' ' + type : '');
}

// --- 多模式数据结构 ---
// modes: { [id]: { name: string, allow: string[], block: string[] } }
let modes = {};
let activeModeId = '';

function newModeId() { return 'mode-' + Date.now() + '-' + Math.floor(Math.random()*1000); }

function migrateIfNeeded(cb) {
  storage.get(['modes','activeModeId','allowedDomains','blockedDomains','mode'], (r) => {
    if (!r.modes || typeof r.modes !== 'object' || Object.keys(r.modes).length === 0) {
      const id = newModeId();
      const oldMode = (r.mode || 'allow');
      const allow = oldMode === 'allow' ? (r.allowedDomains || []) : [];
      const block = oldMode === 'block' ? (r.blockedDomains || []) : [];
      const initial = { [id]: { name: '默认模式', allow, block } };
      storage.set({ modes: initial, activeModeId: id }, () => {
        modes = initial; activeModeId = id; cb?.();
      });
    } else {
      modes = r.modes; activeModeId = r.activeModeId || Object.keys(r.modes)[0]; cb?.();
    }
  });
}

// --- UI 渲染与事件 ---
function renderModeSelect() {
  const sel = document.getElementById('modeSelect');
  sel.innerHTML = '';
  Object.entries(modes).forEach(([id, m]) => {
    const opt = document.createElement('option'); opt.value = id; opt.textContent = m.name || id; sel.appendChild(opt);
  });
  sel.value = activeModeId;
}

function loadModeToUI(id) {
  const area = document.getElementById('rulesArea'); area.style.opacity = 0.6;
  const m = modes[id];
  document.getElementById('title').textContent = `允许/屏蔽规则 · ${m.name}`;
  document.getElementById('allowedSites').value = (m.allow || []).join('\n');
  document.getElementById('blockedSites').value = (m.block || []).join('\n');
  const pA = parseInput(document.getElementById('allowedSites').value);
  const pB = parseInput(document.getElementById('blockedSites').value);
  renderCombinedStats(pA, pB);
  showFeedback(`已加载模式「${m.name}」`, 'success');
  setTimeout(() => { area.style.opacity = 1; }, 80);
}

function saveCurrentMode(cb) {
  const id = activeModeId;
  const pA = parseInput(document.getElementById('allowedSites').value);
  const pB = parseInput(document.getElementById('blockedSites').value);
  modes[id].allow = pA.valid;
  modes[id].block = pB.valid;
  storage.set({ modes }, () => { renderCombinedStats(pA, pB); cb?.(pA, pB); });
}

function bindEvents() {
  const sel = document.getElementById('modeSelect');
  const btnAdd = document.getElementById('addMode');
  const btnRename = document.getElementById('renameMode');
  const btnDelete = document.getElementById('deleteMode');
  const btnSave = document.getElementById('save');
  const btnClear = document.getElementById('clear');

  // 文本框输入预览与统计
  ['allowedSites','blockedSites'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const pA = parseInput(document.getElementById('allowedSites').value);
      const pB = parseInput(document.getElementById('blockedSites').value);
      renderCombinedStats(pA, pB);
      showFeedback('正在编辑，未保存');
    });
  });

  // 保存当前模式
  btnSave.addEventListener('click', () => {
    btnSave.disabled = true; btnSave.textContent = '保存中…';
    saveCurrentMode((pA, pB) => {
      btnSave.disabled = false; btnSave.textContent = '保存';
      showFeedback(`保存成功！允许有效 ${pA.valid.length}、屏蔽有效 ${pB.valid.length}`, 'success');
    });
  });

  // 清空输入（未保存）
  btnClear.addEventListener('click', () => {
    document.getElementById('allowedSites').value = '';
    document.getElementById('blockedSites').value = '';
    renderCombinedStats(parseInput(''), parseInput(''));
    showFeedback('已清空输入（未保存）', 'warn');
  });

  // 选择模式（自动保存当前修改再切换）
  sel.addEventListener('change', () => {
    const nextId = sel.value;
    if (nextId === activeModeId) return;
    saveCurrentMode(() => {
      activeModeId = nextId;
      storage.set({ activeModeId }, () => {
        renderModeSelect();
        loadModeToUI(activeModeId);
        showFeedback('已自动保存并切换到新模式', 'success');
      });
    });
  });

  // 新增模式
  btnAdd.addEventListener('click', () => {
    const name = prompt('请输入新模式名称', '新模式');
    if (!name) { showFeedback('已取消新增模式', 'warn'); return; }
    const id = newModeId(); modes[id] = { name, allow: [], block: [] };
    activeModeId = id;
    storage.set({ modes, activeModeId }, () => {
      renderModeSelect(); loadModeToUI(id);
      showFeedback(`已新增并切换到模式「${name}」`, 'success');
    });
  });

  // 重命名模式
  btnRename.addEventListener('click', () => {
    const cur = modes[activeModeId];
    const name = prompt('请输入新的模式名称', cur.name);
    if (!name || name.trim() === cur.name) { showFeedback('未更改名称', 'warn'); return; }
    cur.name = name.trim();
    storage.set({ modes }, () => { renderModeSelect(); loadModeToUI(activeModeId); showFeedback('模式已重命名', 'success'); });
  });

  // 删除模式（二次确认，且至少保留一个）
  btnDelete.addEventListener('click', () => {
    const ids = Object.keys(modes);
    if (ids.length <= 1) { showFeedback('至少保留一个模式，无法删除', 'err'); return; }
    const ok = confirm('确认删除当前模式？此操作不可恢复。');
    if (!ok) { showFeedback('已取消删除', 'warn'); return; }
    const delId = activeModeId; delete modes[delId];
    activeModeId = Object.keys(modes)[0];
    storage.set({ modes, activeModeId }, () => { renderModeSelect(); loadModeToUI(activeModeId); showFeedback('模式已删除并切换到剩余模式', 'success'); });
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  migrateIfNeeded(() => {
    renderModeSelect();
    bindEvents();
    loadModeToUI(activeModeId);
  });
});
