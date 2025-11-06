// 环境检测与存储封装（便于本地预览）
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

function isValidDomain(d) {
  // 允许顶级域名及子域；不含协议路径；简单校验
  // 例如 example.com、sub.example.co.uk
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
    if (!isValidDomain(d)) {
      invalid.push(d);
      continue;
    }
    if (!seen.has(d)) {
      seen.add(d);
      valid.push(d);
    }
  }
  const dupCount = lines.length - (valid.length + invalid.length);
  return { valid, invalid, dupCount };
}

function renderStats({ valid, invalid, dupCount }) {
  document.getElementById('count-valid').textContent = String(valid.length);
  document.getElementById('count-invalid').textContent = String(invalid.length);
  document.getElementById('count-dup').textContent = String(dupCount);
  const preview = document.getElementById('preview');
  preview.innerHTML = '';
  const items = [...valid.map(v => ({ v, ok: true })), ...invalid.map(v => ({ v, ok: false }))];
  items.slice(0, 40).forEach(({ v, ok }) => {
    const el = document.createElement('span');
    el.className = 'pill' + (ok ? '' : ' invalid');
    el.textContent = v || '（空行）';
    preview.appendChild(el);
  });
}

function showFeedback(msg, type = '') {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.className = 'feedback' + (type ? ' ' + type : '');
}

function loadSaved() {
  storage.get(['allowedDomains','blockedDomains','mode'], (result) => {
    const allowList = result.allowedDomains || [];
    const blockList = result.blockedDomains || [];
    const mode = result.mode || 'allow';
    const textarea = document.getElementById('allowedSites');
    const btnAllow = document.getElementById('modeAllow');
    const btnBlock = document.getElementById('modeBlock');
    const title = document.getElementById('title');
    const desc = document.getElementById('desc');

    function applyModeUI(m){
      btnAllow.classList.toggle('active', m==='allow');
      btnBlock.classList.toggle('active', m==='block');
      title.textContent = m==='allow' ? '允许显示的网站域名' : '屏蔽的网站域名';
      desc.textContent = m==='allow'
        ? '每行一个域名，不需要写协议或路径。填写顶级域名（匹配其子域名）。示例：unsplash.com、pixabay.com。以 # 开头的行会被忽略。'
        : '每行一个域名，不需要写协议或路径。填写顶级域名（匹配其子域名）。示例：example.com 将屏蔽其所有子域名。以 # 开头的行会被忽略。';
    }

    applyModeUI(mode);
    const list = mode==='allow' ? allowList : blockList;
    textarea.value = list.join('\n');
    const parsed = parseInput(textarea.value);
    renderStats(parsed);
    showFeedback(`已加载${mode==='allow'?'允许':'屏蔽'}名单，共 ${list.length} 个`);

    // 绑定模式切换
    document.getElementById('modeAllow').onclick = () => {
      storage.set({ mode: 'allow' }, () => {
        applyModeUI('allow');
        textarea.value = allowList.join('\n');
        renderStats(parseInput(textarea.value));
        showFeedback('已切换到允许模式');
      });
    };
    document.getElementById('modeBlock').onclick = () => {
      storage.set({ mode: 'block' }, () => {
        applyModeUI('block');
        textarea.value = blockList.join('\n');
        renderStats(parseInput(textarea.value));
        showFeedback('已切换到屏蔽模式');
      });
    };
  });
}

function bindEvents() {
  const textarea = document.getElementById('allowedSites');
  const btnSave = document.getElementById('save');
  const btnClear = document.getElementById('clear');

  textarea.addEventListener('input', () => {
    const parsed = parseInput(textarea.value);
    renderStats(parsed);
    showFeedback('正在编辑，未保存');
  });

  btnSave.addEventListener('click', () => {
    const parsed = parseInput(textarea.value);
    const { valid, invalid, dupCount } = parsed;
    btnSave.disabled = true;
    btnSave.textContent = '保存中…';
    storage.get(['mode'], (r) => {
      const m = r.mode || 'allow';
      const payload = m==='allow' ? { allowedDomains: valid } : { blockedDomains: valid };
      storage.set(payload, () => {
        renderStats(parsed);
        btnSave.disabled = false;
        btnSave.textContent = '保存';
        const msg = `保存成功！(${m==='allow'?'允许':'屏蔽'}) 有效: ${valid.length}，重复: ${dupCount}，无效: ${invalid.length}`;
        showFeedback(msg, 'success');
      });
    });
  });

  btnClear.addEventListener('click', () => {
    textarea.value = '';
    const parsed = parseInput('');
    renderStats(parsed);
    showFeedback('已清空输入（未保存）', 'warn');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadSaved();
});
