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
  const { enabled = true, allowedDomains = [], blockedDomains = [], mode = 'allow' } = await getStorage(['enabled','allowedDomains','blockedDomains','mode']);
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
    const { mode: m = 'allow', allowedDomains: al = [], blockedDomains: bl = [] } = await getStorage(['mode','allowedDomains','blockedDomains']);
    if (m === 'allow') {
      const set = new Set(al); set.add(d);
      await setStorage({ allowedDomains: Array.from(set) });
      showFeedback('已添加到允许名单：' + d, 'ok');
    } else {
      const set = new Set(bl); set.add(d);
      await setStorage({ blockedDomains: Array.from(set) });
      showFeedback('已添加到屏蔽名单：' + d, 'ok');
    }
    input.value = '';
  };

  document.getElementById('addCurrent').onclick = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url);
      const d = url.hostname.replace(/^www\./,'');
      if (!isValidDomain(d)) return showFeedback('当前标签域名不可用：' + d, 'err');
      const { mode: m = 'allow', allowedDomains: al = [], blockedDomains: bl = [] } = await getStorage(['mode','allowedDomains','blockedDomains']);
      if (m === 'allow') {
        const set = new Set(al); set.add(d);
        await setStorage({ allowedDomains: Array.from(set) });
        showFeedback('已添加到允许名单：' + d, 'ok');
      } else {
        const set = new Set(bl); set.add(d);
        await setStorage({ blockedDomains: Array.from(set) });
        showFeedback('已添加到屏蔽名单：' + d, 'ok');
      }
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

  // 模式切换
  const pAllow = document.getElementById('pModeAllow');
  const pBlock = document.getElementById('pModeBlock');
  function setModeUI(m){
    pAllow.classList.toggle('active', m==='allow');
    pBlock.classList.toggle('active', m==='block');
  }
  setModeUI(mode);
  pAllow.onclick = async () => { await setStorage({ mode: 'allow' }); setModeUI('allow'); showFeedback('已切换到允许模式'); };
  pBlock.onclick = async () => { await setStorage({ mode: 'block' }); setModeUI('block'); showFeedback('已切换到屏蔽模式'); };
}

function showFeedback(msg, type='') {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.className = 'feedback ' + (type || '');
}

document.addEventListener('DOMContentLoaded', loadState);