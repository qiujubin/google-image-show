// 默认允许域名（历史遗留，不再直接使用）
const DEFAULT_ALLOWED = [];
let enabled = true;

// 多模式数据
// modes: { [id]: { name: string, allow: string[], block: string[] } }
let modes = {};
let activeModeId = '';
let currentAllow = [];
let currentBlock = [];
let filterMode = 'allow'; // 仅启用一个模式：'allow' 或 'block'

// 加载用户设置
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['modes','activeModeId','enabled','allowedDomains','blockedDomains','mode','filterMode'], (r) => {
      enabled = r.enabled !== false;
      filterMode = r.filterMode || r.mode || 'allow';
      if (!r.modes || typeof r.modes !== 'object' || Object.keys(r.modes).length === 0) {
        // 迁移旧版本：仅启用一个过滤模式（allow 或 block）
        const oldMode = r.mode || 'allow';
        const allow = oldMode === 'allow' ? (r.allowedDomains || DEFAULT_ALLOWED) : [];
        const block = oldMode === 'block' ? (r.blockedDomains || []) : [];
        const id = 'mode-default';
        modes = { [id]: { name: '默认模式', allow, block } };
        activeModeId = id;
        chrome.storage.sync.set({ modes, activeModeId, filterMode: oldMode }, () => {
          currentAllow = allow; currentBlock = block; resolve();
        });
      } else {
        modes = r.modes; activeModeId = r.activeModeId || Object.keys(r.modes)[0];
        const cur = modes[activeModeId] || { allow: DEFAULT_ALLOWED, block: [] };
        currentAllow = Array.isArray(cur.allow) ? cur.allow : DEFAULT_ALLOWED;
        currentBlock = Array.isArray(cur.block) ? cur.block : [];
        // 若不存在 filterMode，设为默认 allow
        if (!r.filterMode && !r.mode) {
          chrome.storage.sync.set({ filterMode: 'allow' }, () => resolve());
        } else {
          resolve();
        }
      }
    });
  });
}

// 判断 URL 是否属于允许的域名
function isAllowed(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const hit = (list) => list && list.length > 0 && list.some(d => domain === d || domain.endsWith('.' + d));
    if (filterMode === 'allow') {
      // 过滤模式：仅使用允许名单；屏蔽名单不生效
      if (!currentAllow || currentAllow.length === 0) return true; // 允许名单为空时不过滤
      return hit(currentAllow);
    } else {
      // 屏蔽模式：仅使用屏蔽名单；允许名单不生效
      if (!currentBlock || currentBlock.length === 0) return true;
      return !hit(currentBlock);
    }
  } catch (e) {
    return true;
  }
}

// 仅在 Google 图片页面生效（tbm=isch）
function isImagesPage() {
  try {
    const params = new URL(location.href).searchParams;
    return params.get('tbm') === 'isch';
  } catch (e) {
    return false;
  }
}

// 隐藏不符合条件的结果
function filterResults() {
  if (!enabled) return;
  // Google 图片结果通常包裹在 .islrc > .isv 或 .rg_i 等容器中
  // 每个结果项是一个 <a> 标签，href 是目标页面 URL
  const links = document.querySelectorAll('a[href^="http"]');

  links.forEach(link => {
    const url = extractTargetUrl(link) || link.href;
    const item = link.closest('[data-id], .isv, .rg_bx, .islir'); // 尝试找到结果容器

    if (!isAllowed(url)) {
      if (item) {
        item.style.display = 'none';
      } else {
        link.style.display = 'none';
      }
    } else {
      if (item) {
        item.style.display = ''; // 确保显示
      }
    }
  });
}

// 从链接中尽可能解析出最终目标 URL（处理 Google 重定向）
function extractTargetUrl(link) {
  try {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('http')) return href;
    const ping = link.getAttribute('ping') || '';
    const candidate = [href, ping].find(s => s && /[?&](?:url|q)=/.test(s));
    if (candidate) {
      const m = /[?&](?:url|q)=([^&]+)/.exec(candidate);
      if (m) return decodeURIComponent(m[1]);
    }
    return '';
  } catch (e) {
    return '';
  }
}

// 过滤普通搜索页中的图片模块（每个图片卡片容器类名 ULSxyf）
function filterInlineImagePack() {
  if (!enabled) return;
  const items = document.querySelectorAll('div.ULSxyf');
  items.forEach(item => {
    const link = item.querySelector('a[href]');
    if (!link) return;
    const url = extractTargetUrl(link) || link.href || '';
    if (!url) return;
    if (!isAllowed(url)) {
      item.style.display = 'none';
    } else {
      item.style.display = '';
    }
  });
}

function unfilterAll() {
  const selectors = ['[data-id]', '.isv', '.rg_bx', '.islir', 'div.ULSxyf'];
  document.querySelectorAll(selectors.join(',')).forEach(el => {
    el.style.display = '';
  });
}

// 监听动态加载（Google 图片滚动加载）
  const observer = new MutationObserver(() => {
    if (!enabled) return;
    if (isImagesPage()) { filterResults(); } else { filterInlineImagePack(); }
  });

// 启动插件
(async () => {
  await loadSettings();
  if (isImagesPage()) {
    filterResults();
  } else {
    filterInlineImagePack();
  }

  // 观察主内容区域变化
  const targetNode = (isImagesPage() ? (document.querySelector('#islrg')) : (document.querySelector('#rso'))) || document.body;
  observer.observe(targetNode, { childList: true, subtree: true });

  // 监听设置变化，动态应用
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.modes || changes.activeModeId) {
      if (changes.modes) { modes = changes.modes.newValue || modes; }
      if (changes.activeModeId) { activeModeId = changes.activeModeId.newValue || activeModeId; }
      const cur = modes[activeModeId] || { allow: DEFAULT_ALLOWED, block: [] };
      currentAllow = Array.isArray(cur.allow) ? cur.allow : DEFAULT_ALLOWED;
      currentBlock = Array.isArray(cur.block) ? cur.block : [];
      if (enabled) {
        if (isImagesPage()) { filterResults(); } else { filterInlineImagePack(); }
      }
    }
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (!enabled) {
        unfilterAll();
      } else {
        if (isImagesPage()) { filterResults(); } else { filterInlineImagePack(); }
      }
    }
    if ((changes.filterMode || changes.mode) && enabled) {
      filterMode = (changes.filterMode?.newValue) || (changes.mode?.newValue) || filterMode;
      if (isImagesPage()) { filterResults(); } else { filterInlineImagePack(); }
    }
    if (changes._refreshToken && enabled) {
      if (isImagesPage()) { filterResults(); } else { filterInlineImagePack(); }
    }
  });
})();
