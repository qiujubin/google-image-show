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
  // 读取启用、模式集合与当前模式
  const { enabled = true, modes = {}, activeModeId = '' } = await getStorage(['enabled','modes','activeModeId']);
  const toggle = document.getElementById('toggle');
  const stateText = document.getElementById('stateText');
  const modeName = document.getElementById('modeName');
  const ids = Object.keys(modes);
  const idx = Math.max(0, ids.indexOf(activeModeId));
  const currentId = ids[idx] || ids[0];
  const currentMode = modes[currentId] || { name: '默认模式', allow: [], block: [] };

  // 启用切换
  toggle.classList.toggle('on', !!enabled);
  stateText.textContent = enabled ? '已启用' : '已禁用';
  toggle.onclick = async () => {
    const now = !toggle.classList.contains('on');
    toggle.classList.toggle('on', now);
    stateText.textContent = now ? '已启用' : '已禁用';
    await setStorage({ enabled: now });
  };

  // 当前模式显示
  modeName.textContent = currentMode.name;

  // 允许/屏蔽添加目标切换（仅影响“添加到当前模式”目标列表）
  const pAllow = document.getElementById('pModeAllow');
  const pBlock = document.getElementById('pModeBlock');
  let addTarget = 'allow';
  function setAddTargetUI(t){ pAllow.classList.toggle('active', t==='allow'); pBlock.classList.toggle('active', t==='block'); }
  setAddTargetUI(addTarget);
  pAllow.onclick = () => { addTarget = 'allow'; setAddTargetUI(addTarget); showFeedback('添加目标：允许名单'); };
  pBlock.onclick = () => { addTarget = 'block'; setAddTargetUI(addTarget); showFeedback('添加目标：屏蔽名单'); };

  // 快速添加：输入框
  document.getElementById('addTyped').onclick = async () => {
    const input = document.getElementById('domainInput');
    const d = (input.value || '').trim().toLowerCase().replace(/^www\./,'');
    if (!d || !isValidDomain(d)) return showFeedback('请输入有效域名，例如 unsplash.com','err');
    const { modes: M = {}, activeModeId: A = '' } = await getStorage(['modes','activeModeId']);
    const ids2 = Object.keys(M); const id2 = ids2.includes(A) ? A : ids2[0];
    const mode2 = M[id2] || { name:'默认模式', allow:[], block:[] };
    const set = new Set(addTarget === 'allow' ? (mode2.allow || []) : (mode2.block || []));
    set.add(d);
    if (addTarget === 'allow') mode2.allow = Array.from(set); else mode2.block = Array.from(set);
    M[id2] = mode2;
    await setStorage({ modes: M });
    showFeedback(`已添加到「${mode2.name}」的${addTarget==='allow'?'允许':'屏蔽'}名单：${d}`, 'ok');
    input.value = '';
  };

  // 快速添加：当前标签域名
  document.getElementById('addCurrent').onclick = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url); const d = url.hostname.replace(/^www\./,'');
      if (!isValidDomain(d)) return showFeedback('当前标签域名不可用：' + d, 'err');
      const { modes: M = {}, activeModeId: A = '' } = await getStorage(['modes','activeModeId']);
      const ids2 = Object.keys(M); const id2 = ids2.includes(A) ? A : ids2[0];
      const mode2 = M[id2] || { name:'默认模式', allow:[], block:[] };
      const set = new Set(addTarget === 'allow' ? (mode2.allow || []) : (mode2.block || []));
      set.add(d);
      if (addTarget === 'allow') mode2.allow = Array.from(set); else mode2.block = Array.from(set);
      M[id2] = mode2;
      await setStorage({ modes: M });
      showFeedback(`已添加到「${mode2.name}」的${addTarget==='allow'?'允许':'屏蔽'}名单：${d}`, 'ok');
    } catch (e) { showFeedback('无法获取当前标签域名', 'err'); }
  };

  // 打开完整设置
  document.getElementById('openOptions').onclick = () => { chrome.runtime.openOptionsPage(); };

  // 请求重新过滤当前页面
  document.getElementById('refilter').onclick = async () => {
    const { enabled: en = true } = await getStorage(['enabled']);
    if (!en) return showFeedback('扩展已禁用，请先启用', 'err');
    await setStorage({ _refreshToken: Date.now() });
    showFeedback('已请求重新过滤当前页面', 'ok');
  };

  // 上一/下一模式切换
  document.getElementById('prevMode').onclick = async () => {
    const ids3 = Object.keys(modes); const i = Math.max(0, ids3.indexOf(currentId));
    const nextIndex = (i - 1 + ids3.length) % ids3.length;
    const nextId = ids3[nextIndex]; const nextName = modes[nextId]?.name || nextId;
    await setStorage({ activeModeId: nextId });
    modeName.textContent = nextName; showFeedback(`已切换到模式：${nextName}`, 'success');
  };
  document.getElementById('nextMode').onclick = async () => {
    const ids3 = Object.keys(modes); const i = Math.max(0, ids3.indexOf(currentId));
    const nextIndex = (i + 1) % ids3.length;
    const nextId = ids3[nextIndex]; const nextName = modes[nextId]?.name || nextId;
    await setStorage({ activeModeId: nextId });
    modeName.textContent = nextName; showFeedback(`已切换到模式：${nextName}`, 'success');
  };
}

function showFeedback(msg, type='') {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.className = 'feedback ' + (type || '');
}

document.addEventListener('DOMContentLoaded', loadState);