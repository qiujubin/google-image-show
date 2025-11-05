// 默认允许的域名（可被用户覆盖）
const DEFAULT_ALLOWED = [];

let allowedDomains = [];
let enabled = true;

// 加载用户设置
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['allowedDomains', 'enabled'], (result) => {
      allowedDomains = result.allowedDomains || DEFAULT_ALLOWED;
      enabled = result.enabled !== false; // 默认启用
      resolve();
    });
  });
}

// 判断 URL 是否属于允许的域名
function isAllowed(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    // 若未配置任何允许域名，则默认不过滤（允许全部）
    if (!allowedDomains || allowedDomains.length === 0) return true;
    return allowedDomains.some(allowed =>
      domain === allowed || domain.endsWith('.' + allowed)
    );
  } catch (e) {
    // URL 解析异常时不拦截，避免误屏蔽
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
    if (changes.allowedDomains) {
      allowedDomains = changes.allowedDomains.newValue || DEFAULT_ALLOWED;
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
    if (changes._refreshToken && enabled) {
      if (isImagesPage()) { filterResults(); } else { filterInlineImagePack(); }
    }
  });
})();
