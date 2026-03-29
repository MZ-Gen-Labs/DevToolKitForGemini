// content/content.js

// スクロールバーの動的スタイル適用
function applyScrollbarStyle(config) {
  const styleId = 'gemini-dev-scrollbar-style';
  let styleEl = document.getElementById(styleId);

  // OFF設定の場合はスタイル要素を削除して終了
  if (config.sbEnabled === false) {
    if (styleEl) styleEl.remove();
    return;
  }

  // デフォルト値とサニタイズ（数値以外や不正な値を防ぐ）
  let width = parseInt(config.sbWidth, 10);
  if (isNaN(width)) width = 8;
  width = Math.max(4, Math.min(width, 24)); // 4px 〜 24px の間に制限
  const isTransparent = config.sbTransparent !== false; // デフォルトtrue
  const trackColor = isTransparent ? 'transparent' : 'rgba(0, 0, 0, 0.05)';

  // FireFox用の scrollbar-width の計算
  const fw = width < 12 ? 'thin' : 'auto';

  const css = `
    /* Geminiの隠されたスクロールバーを強制表示（動的生成） */
    body * {
      scrollbar-width: ${fw} !important;
      scrollbar-color: rgba(0, 0, 0, 0.3) ${trackColor} !important;
    }

    body *::-webkit-scrollbar {
      display: block !important;
      width: ${width}px !important;
      height: ${width}px !important;
    }

    body *::-webkit-scrollbar-track {
      background: ${trackColor} !important;
    }

    body *::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.25) !important;
      border-radius: ${Math.max(2, width / 2)}px !important;
    }

    body *::-webkit-scrollbar-thumb:hover {
      background-color: rgba(0, 0, 0, 0.45) !important;
    }
  `;

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

// 初期ロードと設定変更の監視
chrome.storage.local.get(['sbEnabled', 'sbWidth', 'sbTransparent'], (result) => {
  applyScrollbarStyle(result);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.sbEnabled || changes.sbWidth || changes.sbTransparent)) {
    chrome.storage.local.get(['sbEnabled', 'sbWidth', 'sbTransparent'], (result) => {
      applyScrollbarStyle(result);
    });
  }
});
// utility: 指定したミリ秒待機する
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// utility: 要素が出現するまで待機する
async function waitForElement(selector, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    let el;
    if (typeof selector === 'function') {
      el = selector();
    } else {
      el = document.querySelector(selector);
    }
    if (el) return el;
    await sleep(200);
  }
  return null;
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
    } catch (e) {
      console.debug('[Dev Toolkit for Gemini] Scroll execution error:', e);
    }
  });
}

// 相対スクロールジャンプ（前の質問、次のコードなどへ移動）
function scrollRelative(selector, direction) {
  // 画面上に存在する対象要素（質問ブロックやコードブロック）をすべて取得
  const elements = Array.from(document.querySelectorAll(selector)).filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.height > 0; // 表示されているもののみ
  });

  if (elements.length === 0) {
    showToast('該当要素が見つかりません');
    return;
  }

  // Geminiの固定ヘッダー（上部メニューバー）の高さを考慮したマージン。
  // 表示が崩れる場合や、将来的にUI変更があった際はこの値を調整してください。
  const OFFSET = 80;

  if (direction === 'next') {
    // 現在のスクロール位置（一番上の表示領域）より「下」にある最初の要素を探す
    const target = elements.find(el => Math.round(el.getBoundingClientRect().top) > (OFFSET + 10));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showToast('これ以上、次の要素はありません');
    }
  } else if (direction === 'prev') {
    // 現在のスクロール位置より「上」にある最後の要素を探す（配列を逆順にして上に向かって探索）
    const target = [...elements].reverse().find(el => Math.round(el.getBoundingClientRect().top) < (OFFSET - 10));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showToast('これ以上、前の要素はありません');
    }
  }
}

// ==========================================
// モデル切り替え用ロジック (構造変更対応版)
// ==========================================
async function executeModelSwitch(targetModelName) {
  // 1. モデル選択ボタン（現在表示されているモデル名が書いてあるボタン）を探す
  // 新UI (data-test-id または input-area-switch クラス) を優先的に検索
  let modelBtn = document.querySelector('button[data-test-id="bard-mode-menu-button"]');

  if (!modelBtn) {
    const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
    modelBtn = allBtns.find(btn => {
      const txt = btn.textContent;
      return (txt.includes('Gemini') || txt.includes('Pro') || txt.includes('思考') || txt.includes('Flash')) &&
        (btn.querySelector('mat-icon, svg, img') || btn.getAttribute('aria-haspopup') === 'true' || btn.classList.contains('input-area-switch'));
    });
  }

  if (!modelBtn) throw new Error('モデル選択ボタンが見つかりませんでした。');

  // 2. メニューが開いているか確認。開いていなければクリックして開く
  // 新UIのクラス (gds-mode-switch-menu) などを含むパネルを探す
  const menuVisible = !!document.querySelector('div[role="menu"].gds-mode-switch-menu, [role="listbox"], .mat-menu-panel, .kb-menu');
  if (!menuVisible) {
    modelBtn.click();
    await sleep(800); // メニューが描画されるまで少し長めに待機
  }

  // 3. ターゲットとなるキーワードの定義
  const testIdMap = {
    'Pro': ['bard-mode-option-pro', 'bard-mode-option-gemini-advanced'],
    '思考モード': ['bard-mode-option-思考モード', 'bard-mode-option-thinking'],
    '高速モード': ['bard-mode-option-高速モード', 'bard-mode-option-flash']
  };

  const nameMap = {
    'Pro': ['Pro', '1.5 Pro', 'Advanced'],
    '思考モード': ['思考', 'Thinking', 'Flash-Thinking'],
    '高速モード': ['Flash', '高速', '2.0 Flash']
  };

  const targetTestIds = testIdMap[targetModelName] || [];
  const searchTerms = nameMap[targetModelName] || [targetModelName];

  // 4. 要素の特定
  let clickable = null;

  // まず data-test-id から正確なボタン要素を探す
  for (const tid of targetTestIds) {
    const el = document.querySelector(`[data-test-id="${tid}"]`);
    if (el) {
      clickable = el;
      break;
    }
  }

  // 見つからなかった場合のフォールバック（旧UIや文言変更対応）
  if (!clickable) {
    const potentialItems = Array.from(document.querySelectorAll('div[role="menuitem"], [role="option"], button[mat-menu-item], span, div'));
    let foundElement = null;
    for (const term of searchTerms) {
      foundElement = potentialItems.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && el.textContent.trim().includes(term);
      });
      if (foundElement) break;
    }

    if (foundElement) {
      clickable = foundElement.closest('[role="menuitem"]') ||
        foundElement.closest('[role="option"]') ||
        foundElement.closest('button') ||
        foundElement;
    }
  }

  if (!clickable) {
    throw new Error(`${targetModelName} をメニュー内で特定できませんでした。`);
  }

  // 5. グレーアウト（制限）判定
  // Disabledプロパティやクラス構成を総合して判定
  const isDisabledAttr = clickable.disabled === true || clickable.getAttribute('disabled') === 'true';
  const isAriaDisabled = clickable.getAttribute('aria-disabled') === 'true';
  const hasDisabledClass = clickable.classList.contains('disabled') || clickable.innerText.includes('上限');
  const style = window.getComputedStyle(clickable);

  // 制限時、要素がクリック不可になっている場合にエラーとする
  if (isDisabledAttr || isAriaDisabled || hasDisabledClass || style.pointerEvents === 'none') {
    // メニューを開いたままにしないよう、画面のどこかをクリックして閉じる
    document.body.click();
    throw new Error(`${targetModelName} は現在制限されています。`);
  }

  // 6. 実行
  // フォーカスを当ててからクリックすることで、確実にイベントを発動させる
  clickable.focus();
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
      showToast('⚠️ Pro制限中のため、思考モードへの切り替えを試みます...');
      console.warn('Pro switch failed:', e.message);
      try {
        // 再度メニューを開く判定を含めて実行
        await executeModelSwitch('思考モード');
      } catch (err) {
        console.error('思考モードへのフォールバックも失敗:', err);
        try {
          await executeModelSwitch('高速モード');
        } catch (f) {
          showToast('❌ 全てのモデル切り替えに失敗しました。');
        }
      }
    } else {
      showToast(`❌ 切り替え失敗: ${e.message}`);
    }
  }
}

// 1件のURLをインポートする処理
async function importSingleUrl(targetString) {
  // 新UIのクラスや属性を優先的に検索
  let plusBtn = document.querySelector('button.upload-card-button, button[aria-controls="upload-file-menu"], button[aria-label*="ファイルをアップロード"]');

  if (!plusBtn) {
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

  // 「コードをインポート」を検索
  const findImportCodeItem = () => {
    // 新UIのdata-test-idを優先
    let item = document.querySelector('button[data-test-id="code-import-button"]');
    if (item) return item;

    // フォールバック（テキストベース）
    return Array.from(document.querySelectorAll('div, span, li, button, a'))
      .find(el => el.innerText && (el.innerText.includes('コードをインポート') || el.innerText.includes('Import code')));
  };

  const importCodeItem = await waitForElement(() => findImportCodeItem(), 5000);
  if (!importCodeItem) throw new Error('「コードをインポート」メニューが見つかりませんでした。');

  importCodeItem.click();

  // Gemini本体がダイアログを表示し、入力欄をリセットし終わるまで待機する
  await sleep(800);

  const isWebUrl = /^https?:\/\//i.test(targetString.trim());

  if (isWebUrl) {
    const findUrlInput = () => {
      let input = document.querySelector('input[data-test-id="repo-url-input"]');
      if (input) return input;
      input = document.querySelector('input[placeholder*="github.com"]');
      if (input) return input;
      const dialogs = document.querySelectorAll('dialog, [role="dialog"]');
      if (dialogs.length > 0) {
        return dialogs[dialogs.length - 1].querySelector('input[type="text"]');
      }
      return null;
    };

    const urlInput = await waitForElement(() => findUrlInput(), 5000);
    if (!urlInput) throw new Error('URL入力欄が見つかりませんでした。');

    urlInput.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (setter) setter.call(urlInput, targetString); else urlInput.value = targetString;
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    urlInput.dispatchEvent(new Event('change', { bubbles: true }));

    await sleep(400); // inputイベント反応待ち
    // インポート実行ボタンを探す
    const findInsertBtn = () => {
      let btn = document.querySelector('button[data-test-id="import-repository-button"]');
      if (btn) return btn;
      return Array.from(document.querySelectorAll('button, div[role="button"]'))
        .find(el => el.innerText && (el.innerText === 'インポート' || el.innerText === 'Import'));
    };

    const insertBtn = await waitForElement(() => findInsertBtn(), 5000);
    if (insertBtn) {
      insertBtn.click();
      await sleep(2500); // 描画後のインポート処理待ち（ダイアログ遷移等が含まれるため）
    } else throw new Error('「インポート」実行ボタンが見つかりませんでした。');

  } else {
    try {
      await navigator.clipboard.writeText(targetString);
      showToast(`📁パスをコピーしました: ${targetString}`);
    } catch (err) {
      console.warn("Clipboard API failed", err);
      showToast(`⚠️ コピー失敗。手動でペーストしてください: ${targetString}`);
    }
    // フォルダアップロードボタンを探す
    const findFolderBtn = () => {
      let btn = document.querySelector('button[data-test-id="upload-code-folder-button"]');
      if (btn) return btn;
      return Array.from(document.querySelectorAll('div, span, button, a, label, p'))
        .find(el => el.innerText && (el.innerText.includes('フォルダをアップロード') || el.innerText.includes('Upload folder')));
    };

    const folderBtnElement = await waitForElement(() => findFolderBtn(), 5000);
    if (folderBtnElement) {
      const c = folderBtnElement.closest('button') || folderBtnElement.closest('div[role="button"]') || folderBtnElement.closest('label') || folderBtnElement;
      c.click();
      let waitCount = 0, dialogExists = true;
      while (dialogExists && waitCount < 120) {
        await sleep(1000);
        const dialogs = document.querySelectorAll('dialog, [role="dialog"]');
        // ダイアログが存在し続けるかどうかの判定（新旧のUI両対応）
        dialogExists = Array.from(dialogs).some(d => d.querySelector('input[data-test-id="repo-url-input"]') || d.querySelector('input[placeholder*="github.com"]'));
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
        console.warn(`[Dev Toolkit for Gemini] ${targetUrl} 失敗:`, e);
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
  }, { passive: true });
  document.addEventListener('mouseup', async () => {
    if (!isDragging || !dragTarget) return;
    if (hasMoved) await chrome.storage.local.set({ widgetPosition: { left: dragTarget.style.left, top: dragTarget.style.top } });
    isDragging = false; setTimeout(() => { hasMoved = false; dragTarget = null; }, 50);
  }, { passive: true });
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
  bg.appendChild(sg);

  // ジャンプコントローラー (新規: 前/次の質問、前/次のコード)
  const jg = document.createElement('div'); jg.className = 'gemini-scroll-group';
  const cjb = (t, ti, selector, dir) => {
    const b = document.createElement('button'); b.className = 'gemini-scroll-btn'; b.type = 'button'; b.textContent = t; b.title = ti; b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); scrollRelative(selector, dir); }); return b;
  };
  jg.appendChild(cjb('👤⬆️', '前の質問へ', 'user-query', 'prev'));
  jg.appendChild(cjb('👤⬇️', '次の質問へ', 'user-query', 'next'));
  jg.appendChild(cjb('💻⬆️', '前のコードへ', 'code-block', 'prev'));
  jg.appendChild(cjb('💻⬇️', '次のコードへ', 'code-block', 'next'));
  bg.appendChild(jg);

  container.appendChild(bg);

  container.addEventListener('mousedown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'select' || e.target.closest('#gemini-auto-import-panel') || e.target.closest('.gemini-scroll-btn') || e.target.closest('.gemini-model-apply-btn')) return;
    isDragging = true; hasMoved = false; dragTarget = container;
    const r = container.getBoundingClientRect(); initialX = r.left; initialY = r.top; startX = e.clientX; startY = e.clientY;
  });
  container.addEventListener('click', (e) => { if (hasMoved) { e.stopPropagation(); e.preventDefault(); } }, true);
}

chrome.runtime.onMessage.addListener((request, sender) => {
  // 送信元がこの拡張機能自身であることを確認（セキュリティ対策）
  if (sender.id === chrome.runtime.id && request.action === "REFRESH_LIST") {
    renderRepoPanel();
  }
});

// コンテナの死活監視：MutationObserverからsetIntervalによる軽量な定期チェックに変更
setInterval(() => {
  if (!document.getElementById('gemini-auto-import-container')) {
    renderRepoPanel();
  }
}, 2000);

renderRepoPanel();