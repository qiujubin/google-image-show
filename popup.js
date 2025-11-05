function isValidDomain(d) {
  const re = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  return re.test(d);
}

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
}

function setStorage(obj) {
  return new Promise(resolve => chrome.storage.sync.set(obj, resolve));
}

async function loadState() {
  const { enabled = true, allowedDomains = [] } = await getStorage(['enabled','allowedDomains']);
  const toggle = document.getElementById('toggle');
  const stateText = document.getElementById('stateText');
  toggle.classList.toggle('on', !!enabled);
  stateText.textContent = enabled ? '已启用' : '已禁用';
  toggle.onclick = async () => {
    const now = !toggle.classList.contains('on');
    toggle.classList.toggle('on', now);
    stateText.textContent = now ? '已启用' : '已禁用';
    await setStorage({ enabled: now });
  };

  document.getElementById('addTyped').onclick = async () => {
    const input = document.getElementById('domainInput');
    const d = (input.value || '').trim().toLowerCase().replace(/^www\./,'');
    if (!d || !isValidDomain(d)) return showFeedback('请输入有效域名，例如 unsplash.com','err');
    const { allowedDomains: list = [] } = await getStorage(['allowedDomains']);
    const set = new Set(list);
    set.add(d);
    await setStorage({ allowedDomains: Array.from(set) });
    showFeedback('已添加：' + d, 'ok');
    input.value = '';
  };

  document.getElementById('addCurrent').onclick = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url);
      const d = url.hostname.replace(/^www\./,'');
      if (!isValidDomain(d)) return showFeedback('当前标签域名不可用：' + d, 'err');
      const { allowedDomains: list = [] } = await getStorage(['allowedDomains']);
      const set = new Set(list);
      set.add(d);
      await setStorage({ allowedDomains: Array.from(set) });
      showFeedback('已添加当前标签域名：' + d, 'ok');
    } catch (e) {
      showFeedback('无法获取当前标签域名', 'err');
    }
  };

  document.getElementById('openOptions').onclick = () => {
    chrome.runtime.openOptionsPage();
  };

  document.getElementById('refilter').onclick = async () => {
    // 通知当前页重新过滤（内容脚本监听 storage 变化或主动发消息）
    const { enabled: en = true } = await getStorage(['enabled']);
    if (!en) {
      showFeedback('扩展已禁用，请先启用', 'err');
      return;
    }
    await setStorage({ _refreshToken: Date.now() });
    showFeedback('已请求重新过滤当前页面', 'ok');
  };
}

function showFeedback(msg, type='') {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.className = 'feedback ' + (type || '');
}

document.addEventListener('DOMContentLoaded', loadState);