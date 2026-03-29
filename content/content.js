// utility: 指定したミリ秒待機する
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// utility: 画面上で見えているDOM要素の中から、特定のテキストを含む最も具体的な要素を探す
function findTerminalElementByText(selector, textSearch) {
  const elements = Array.from(document.querySelectorAll(selector));
  const matching = elements.filter(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return el.textContent.trim() === textSearch || el.textContent.includes(textSearch);
  });
  if (matching.length === 0) return null;
  matching.sort((a, b) => {
    let areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
    let areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
    return areaA - areaB;
  });
  return matching[0];
}

// utility: 画面上部に一時的なトースト通知を表示する
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.top = '24px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  toast.style.color = 'white';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.zIndex = '10000';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = 'bold';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ==========================================
// スクロール制御用ロジック
// ==========================================
function executeScroll(action) {
  let scrollableTarget = null;
  let maxScrollAmount = 0;

  document.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
      const scrollAmount = el.scrollHeight - el.clientHeight;
      if (scrollAmount > maxScrollAmount && el.clientHeight > 100) {
        maxScrollAmount = scrollAmount;
        scrollableTarget = el;
      }
    }
  });

  const targets = [window, document.documentElement, document.body];
  if (scrollableTarget) {
    targets.unshift(scrollableTarget);
  }

  targets.forEach(target => {
    try {
      const isWin = (target === window || target === document.documentElement || target === document.body);
      const clientHeight = isWin ? window.innerHeight : target.clientHeight;
      const scrollHeight = isWin ? document.documentElement.scrollHeight : target.scrollHeight;

      switch (action) {
        case 'top':
          if (isWin) window.scrollTo({ top: 0, behavior: 'smooth' });
          else target.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'bottom':
          if (isWin) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
          else target.scrollTo({ top: scrollHeight, behavior: 'smooth' });
          break;
        case 'up':
          if (isWin) window.scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' });
          else target.scrollBy({ top: -(clientHeight * 0.8), behavior: 'smooth' });
          break;
        case 'down':
          if (isWin) window.scrollBy({ top: (window.innerHeight * 0.8), behavior: 'smooth' });
          else target.scrollBy({ top: (clientHeight * 0.8), behavior: 'smooth' });
          break;
      }
    } catch (e) { }
  });
}

// ==========================================
// モデル切り替え用ロジック (Pro制限判定強化版)
// ==========================================
async function executeModelSwitch(targetModelName) {
  let modelBtn = null;
  const selectors = 'button, div[role="button"]';

  const currentButtons = Array.from(document.querySelectorAll(selectors));
  modelBtn = currentButtons.find(btn => {
    const text = btn.textContent;
    return (text.includes('モード') || text.includes('Pro') || text.includes('Gemini')) &&
      btn.querySelector('mat-icon, svg');
  });

  if (!modelBtn) throw new Error('モデル選択ボタンが見つかりませんでした。');
  modelBtn.click();
  await sleep(800);

  const menuItems = Array.from(document.querySelectorAll('div[role="menuitem"], li, button'));
  let modelItem = menuItems.find(item => item.textContent.trim().startsWith(targetModelName));

  if (!modelItem) {
    modelItem = findTerminalElementByText('div, span, li', targetModelName);
  }

  if (!modelItem) {
    throw new Error(`${targetModelName} がメニューに見つかりません。`);
  }

  const clickable = modelItem.getAttribute('role') === 'menuitem' ? modelItem : (modelItem.closest('div[role="menuitem"]') || modelItem);

  // 判定強化: aria-disabled に加え、テキストに「上限」や「リセット」が含まれているかチェック
  const itemText = clickable.textContent;
  const isLimited = clickable.getAttribute('aria-disabled') === 'true' ||
    clickable.classList.contains('disabled') ||
    itemText.includes('上限') ||
    itemText.includes('リセット');

  if (isLimited) {
    throw new Error(`${targetModelName} は現在レートリミット等で制限されています。`);
  }

  clickable.click();
  showToast(`🤖 モデルを ${targetModelName} に切り替えました`);
  await sleep(1000);
}

// モデル切り替えを実行し、Proが制限されている場合は思考モードを試す
async function smartModelSwitch(targetModelName) {
  try {
    await executeModelSwitch(targetModelName);
  } catch (e) {
    if (targetModelName === 'Pro') {
      showToast('⚠️ Pro制限中のため、思考モードに切り替えを試みます...');
      console.warn('Pro switch failed, falling back to 思考モード:', e.message);
      try {
        await executeModelSwitch('思考モード');
      } catch (err) {
        console.error('思考モードへの切り替えも失敗しました:', err);
        showToast('❌ モデルの自動切り替えに失敗しました。');
      }
    } else {
      showToast(`❌ 切り替え失敗: ${e.message}`);
      throw e;
    }
  }
}

// 1件のURLをインポートする処理
async function importSingleUrl(targetString) {
  let plusBtn = null;
  const textarea = document.querySelector('textarea, rich-textarea, div[contenteditable="true"]');

  if (textarea) {
    let container = textarea.parentElement;
    while (container && container.tagName !== 'BODY') {
      const allBtns = Array.from(container.querySelectorAll('button, div[role="button"]'));
      plusBtn = allBtns.find(btn => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const isMatch = (label.includes('追加') || label.includes('add') || label.includes('ツール') || label.includes('アップロード'));
        const isExclude = (label.includes('削除') || label.includes('remove') || label.includes('モデル') || label.includes('model') || label.includes('gemini'));
        return isMatch && !isExclude;
      });
      if (plusBtn) break;
      container = container.parentElement;
    }
  }

  if (!plusBtn) {
    const fallbackBtns = Array.from(document.querySelectorAll('button[aria-label*="追加"], button[aria-label*="Add"], button[aria-haspopup="true"]'));
    plusBtn = fallbackBtns.find(btn => {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      return !label.includes('モデル') && !label.includes('gemini') && !label.includes('削除');
    });
  }

  if (!plusBtn) throw new Error('[+] メニューボタンが見つかりませんでした。');
  plusBtn.click();
  await sleep(600);

  let importCodeItem = findTerminalElementByText('div, span, li, button, a', 'コードをインポート') ||
    findTerminalElementByText('div, span, li, button, a', 'Import code');

  if (!importCodeItem) {
    await sleep(1000);
    importCodeItem = findTerminalElementByText('div, span, li, button, a', 'コードをインポート') ||
      findTerminalElementByText('div, span, li, button, a', 'Import code');
    if (!importCodeItem) throw new Error('「コードをインポート」メニューが見つかりませんでした。');
  }

  let clickableItem = importCodeItem.closest('div[role="menuitem"]') ||
    importCodeItem.closest('li') ||
    importCodeItem.closest('button') || importCodeItem;
  clickableItem.click();

  await sleep(1000);
  const isWebUrl = /^https?:\/\//i.test(targetString.trim());

  if (isWebUrl) {
    let urlInput = document.querySelector('input[placeholder*="github.com"]');
    if (!urlInput) {
      const dialogs = document.querySelectorAll('dialog, [role="dialog"]');
      if (dialogs.length > 0) {
        let dialog = dialogs[dialogs.length - 1];
        urlInput = dialog.querySelector('input[type="text"]');
      }
    }
    if (!urlInput) throw new Error('URL入力欄が見つかりませんでした。');

    urlInput.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (setter) setter.call(urlInput, targetString); else urlInput.value = targetString;
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    urlInput.dispatchEvent(new Event('change', { bubbles: true }));

    await sleep(400);
    let insertBtn = findTerminalElementByText('button, div[role="button"]', 'インポート') ||
      findTerminalElementByText('button, div[role="button"]', 'Import');

    if (insertBtn) {
      (insertBtn.closest('button') || insertBtn.closest('div[role="button"]') || insertBtn).click();
      await sleep(2500);
    } else throw new Error('「インポート」実行ボタンが見つかりませんでした。');

  } else {
    try { await navigator.clipboard.writeText(targetString); showToast(`📁パスをコピーしました: ${targetString}`); } catch (err) { }
    let folderBtn = null;
    for (let i = 0; i < 5; i++) {
      folderBtn = findTerminalElementByText('div, span, button, a, label, p', 'フォルダをアップロード') ||
        findTerminalElementByText('div, span, button, a, label, p', 'Upload folder');
      if (folderBtn) break;
      await sleep(500);
    }
    if (folderBtn) {
      (folderBtn.closest('button') || folderBtn.closest('div[role="button"]') || folderBtn.closest('label') || folderBtn).click();
      let waitCount = 0, dialogExists = true;
      while (dialogExists && waitCount < 120) {
        await sleep(1000);
        const dialogs = document.querySelectorAll('dialog, [role="dialog"]');
        dialogExists = Array.from(dialogs).some(d => d.querySelector('input[placeholder*="github.com"]'));
        waitCount++;
      }
      await sleep(1500);
    } else throw new Error('「フォルダをアップロード」ボタンが見つかりませんでした。');
  }
}

async function runAutoImport() {
  const button = document.getElementById('gemini-auto-import-btn');
  button.textContent = '処理中...';
  button.style.backgroundColor = '#fbbc04';
  button.disabled = true;

  try {
    const data = await chrome.storage.local.get(['repos']);
    let repos = data.repos || [];
    const targets = repos.filter(r => r.checked);
    let hasError = false;

    if (targets.length === 0) {
      alert('自動インポート機能：インポート対象にチェックを入れてください。');
      return;
    }

    for (let i = 0; i < targets.length; i++) {
      button.textContent = `インポート中 (${i + 1}/${targets.length})`;
      const targetUrl = targets[i].url;
      try {
        await importSingleUrl(targetUrl);
        const repoIndex = repos.findIndex(r => r.url === targetUrl);
        if (repoIndex !== -1) repos[repoIndex].lastImported = Date.now();
      } catch (e) {
        console.warn(`[Gemini Repo Importer] ${targetUrl} 失敗:`, e);
        hasError = true;
      }
      if (i < targets.length - 1) await sleep(2000);
    }

    await chrome.storage.local.set({ repos });
    renderRepoPanel();
    button.textContent = hasError ? '一部失敗' : 'インポート完了！';
    button.style.backgroundColor = hasError ? '#ea4335' : '#0f9d58';
  } catch (err) {
    alert('エラー: ' + err.message);
  } finally {
    setTimeout(() => {
      button.textContent = '📥 自動インポート';
      button.style.backgroundColor = '#0b57d0';
      button.disabled = false;
    }, 3000);
  }
}

// ドラッグ管理
let isDragging = false, hasMoved = false, startX, startY, initialX, initialY, dragTarget = null;
if (!window.geminiDragInitialized) {
  window.geminiDragInitialized = true;
  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !dragTarget) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) hasMoved = true;
    if (hasMoved) {
      dragTarget.style.bottom = 'auto'; dragTarget.style.right = 'auto';
      dragTarget.style.left = `${initialX + dx}px`; dragTarget.style.top = `${initialY + dy}px`;
    }
  });
  document.addEventListener('mouseup', async () => {
    if (!isDragging || !dragTarget) return;
    if (hasMoved) await chrome.storage.local.set({ widgetPosition: { left: dragTarget.style.left, top: dragTarget.style.top } });
    isDragging = false; setTimeout(() => { hasMoved = false; dragTarget = null; }, 50);
  });
}

async function renderRepoPanel() {
  let container = document.getElementById('gemini-auto-import-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gemini-auto-import-container';
    document.body.appendChild(container);
  }
  container.innerHTML = '';
  const data = await chrome.storage.local.get(['repos', 'widgetPosition', 'selectedModel']);
  if (data.widgetPosition) {
    container.style.bottom = 'auto'; container.style.right = 'auto';
    container.style.left = data.widgetPosition.left; container.style.top = data.widgetPosition.top;
  }

  // モデル選択UI
  const modelGroup = document.createElement('div');
  modelGroup.className = 'gemini-model-group';
  const modelSelect = document.createElement('select');
  modelSelect.id = 'gemini-model-select';
  ['高速モード', '思考モード', 'Pro'].forEach(m => {
    const opt = document.createElement('option'); opt.value = m; opt.textContent = m;
    if (m === (data.selectedModel || '思考モード')) opt.selected = true;
    modelSelect.appendChild(opt);
  });
  modelSelect.addEventListener('change', async (e) => await chrome.storage.local.set({ selectedModel: e.target.value }));
  const modelApplyBtn = document.createElement('button');
  modelApplyBtn.className = 'gemini-model-apply-btn'; modelApplyBtn.textContent = '切替';
  modelApplyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    smartModelSwitch(modelSelect.value);
  });
  modelGroup.appendChild(modelSelect); modelGroup.appendChild(modelApplyBtn);

  let repos = data.repos || [];
  if (repos.length > 0) {
    const panel = document.createElement('div');
    panel.id = 'gemini-auto-import-panel';
    [...repos].sort((a, b) => (b.lastImported || 0) - (a.lastImported || 0)).forEach(repo => {
      const item = document.createElement('div');
      item.className = 'gemini-repo-item';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = repo.checked;
      checkbox.addEventListener('change', async (e) => {
        const d = await chrome.storage.local.get(['repos']);
        let rs = d.repos || [];
        const t = rs.find(r => r.url === repo.url);
        if (t) { t.checked = e.target.checked; await chrome.storage.local.set({ repos: rs }); }
      });
      const label = document.createElement('span');
      label.textContent = (/^https?:\/\//i.test(repo.url.trim()) ? '🌐 ' : '📁 ') + repo.url;
      item.appendChild(checkbox); item.appendChild(label); panel.appendChild(item);
    });
    container.appendChild(panel);
  }

  const bg = document.createElement('div'); bg.className = 'gemini-button-group';
  bg.appendChild(modelGroup);
  const ab = document.createElement('button'); ab.id = 'gemini-auto-import-btn'; ab.className = 'gemini-action-btn'; ab.type = 'button'; ab.textContent = '📥 自動インポート';
  ab.addEventListener('click', async () => {
    const currentData = await chrome.storage.local.get(['selectedModel']);
    if (currentData.selectedModel) {
      try { await smartModelSwitch(currentData.selectedModel); } catch (e) { }
    }
    runAutoImport();
  });
  bg.appendChild(ab);

  const sg = document.createElement('div'); sg.className = 'gemini-scroll-group';
  const csb = (t, ti, a) => {
    const b = document.createElement('button'); b.className = 'gemini-scroll-btn'; b.type = 'button'; b.textContent = t; b.title = ti; b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); executeScroll(a); }); return b;
  };
  sg.appendChild(csb('⏫', 'トップ', 'top')); sg.appendChild(csb('🔼', '上', 'up')); sg.appendChild(csb('🔽', '下', 'down')); sg.appendChild(csb('⏬', 'ラスト', 'bottom'));
  bg.appendChild(sg); container.appendChild(bg);

  container.addEventListener('mousedown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'select' || e.target.closest('#gemini-auto-import-panel') || e.target.closest('.gemini-scroll-btn') || e.target.closest('.gemini-model-apply-btn')) return;
    isDragging = true; hasMoved = false; dragTarget = container;
    const r = container.getBoundingClientRect(); initialX = r.left; initialY = r.top; startX = e.clientX; startY = e.clientY;
  });
  container.addEventListener('click', (e) => { if (hasMoved) { e.stopPropagation(); e.preventDefault(); } }, true);
}

chrome.runtime.onMessage.addListener((request) => { if (request.action === "REFRESH_LIST") renderRepoPanel(); });
const observer = new MutationObserver(() => { if (!document.getElementById('gemini-auto-import-container')) renderRepoPanel(); });
observer.observe(document.body, { childList: true, subtree: true });
renderRepoPanel();