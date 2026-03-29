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

// 1件のURLをインポートする処理
async function importSingleUrl(url) {
  // 2. 「+」ボタン（またはメニューを開くボタン）を探してクリック
  let plusBtn = null;
  let textarea = document.querySelector('textarea, rich-textarea, div[contenteditable="true"]');
  if (textarea) {
    let container = textarea.parentElement;
    while (container && container.tagName !== 'BODY') {
      let btns = container.querySelectorAll('button, div[role="button"]');
      if (btns.length > 0) {
        plusBtn = btns[0];
        break;
      }
      container = container.parentElement;
    }
  }

  if (!plusBtn) throw new Error('[+] メニューボタンが見つかりませんでした。');

  plusBtn.click();
  await sleep(500);

  // 3. 「コードをインポート」項目をクリック
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
  await sleep(800);

  // 4. ダイアログの入力欄にURLを入力
  let urlInput = document.querySelector('input[placeholder*="github.com"]');
  if (!urlInput) {
    const dialogs = document.querySelectorAll('dialog, [role="dialog"]');
    if (dialogs.length > 0) {
      let dialog = dialogs[dialogs.length - 1];
      urlInput = dialog.querySelector('input[type="text"]');
    }
    if (!urlInput) {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      urlInput = inputs.find(input => {
        const rect = input.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && input.value === '';
      });
    }
  }

  if (!urlInput) throw new Error('URL入力欄が見つかりませんでした。');

  urlInput.focus();

  // SPAフレームワークの内部Stateを更新させるためのハック
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(urlInput, url);
  } else {
    urlInput.value = url;
  }
  urlInput.dispatchEvent(new Event('input', { bubbles: true }));
  urlInput.dispatchEvent(new Event('change', { bubbles: true }));

  await sleep(400);

  // 5. 「インポート」ボタンをクリック
  let insertBtn = findTerminalElementByText('button, div[role="button"]', 'インポート') ||
    findTerminalElementByText('button, div[role="button"]', 'Import');

  if (insertBtn) {
    let targetBtn = insertBtn.closest('button') || insertBtn.closest('div[role="button"]') || insertBtn;
    targetBtn.click();
    await sleep(1000); // 完了まで少し待機
  } else {
    throw new Error('「インポート」実行ボタンが見つかりませんでした。');
  }
}

// 自動インポート処理本体（複数対応）
async function runAutoImport() {
  const button = document.getElementById('gemini-auto-import-btn');
  button.textContent = '処理中...';
  button.style.backgroundColor = '#fbbc04';
  button.disabled = true;

  try {
    const data = await chrome.storage.local.get(['repos']);
    let repos = data.repos || [];

    // チェックされているURLのみ抽出
    const targets = repos.filter(r => r.checked);
    let hasError = false;

    if (targets.length === 0) {
      alert('自動インポート機能：インポート対象にチェックを入れてください。');
      return;
    }

    // 選択されたものを順番にインポート
    for (let i = 0; i < targets.length; i++) {
      button.textContent = `インポート中 (${i + 1}/${targets.length})`;
      const targetUrl = targets[i].url;

      try {
        await importSingleUrl(targetUrl);
        // インポート成功後、lastImportedを現在時刻に更新
        const repoIndex = repos.findIndex(r => r.url === targetUrl);
        if (repoIndex !== -1) {
          repos[repoIndex].lastImported = Date.now();
        }
      } catch (e) {
        console.warn(`[Gemini Repo Importer] ${targetUrl} のインポートに失敗しました:`, e);
        hasError = true;
      }

      // 次のインポートとの間隔を少し開ける（UIの安定・アニメーション完了待ちのため）
      if (i < targets.length - 1) {
        await sleep(1500);
      }
    }

    // 更新した履歴情報を保存し、リストを再描画（ソート順がここで反映されます）
    await chrome.storage.local.set({ repos });
    renderRepoPanel();

    if (hasError) {
      button.textContent = '一部失敗しました';
      button.style.backgroundColor = '#ea4335'; // 赤色
    } else {
      button.textContent = 'インポート完了！';
      button.style.backgroundColor = '#0f9d58'; // 緑色
    }

  } catch (err) {
    console.error(err);
    alert('自動インポート機能：予期せぬエラーが発生しました。\n' + err.message);
  } finally {
    setTimeout(() => {
      button.textContent = '📥 自動インポート';
      button.style.backgroundColor = '#0b57d0';
      button.disabled = false;
    }, 3000);
  }
}

// UIの構築と描画
async function renderRepoPanel() {
  let container = document.getElementById('gemini-auto-import-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gemini-auto-import-container';
    document.body.appendChild(container);
  }

  container.innerHTML = ''; // クリアして再構築

  const data = await chrome.storage.local.get(['repos']);
  let repos = data.repos || [];

  if (repos.length > 0) {
    const panel = document.createElement('div');
    panel.id = 'gemini-auto-import-panel';

    // 最近インポートされた順（lastImportedの降順）にソート
    const sortedRepos = [...repos].sort((a, b) => (b.lastImported || 0) - (a.lastImported || 0));

    sortedRepos.forEach(repo => {
      const item = document.createElement('div');
      item.className = 'gemini-repo-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = repo.checked;

      // チェックボックスの状態が変わったら即座に保存
      checkbox.addEventListener('change', async (e) => {
        const currentData = await chrome.storage.local.get(['repos']);
        let currentRepos = currentData.repos || [];
        const target = currentRepos.find(r => r.url === repo.url);
        if (target) {
          target.checked = e.target.checked;
          await chrome.storage.local.set({ repos: currentRepos });
        }
      });

      const label = document.createElement('span');
      label.textContent = repo.url;
      label.title = repo.url; // ホバー時に全URLが見えるように

      item.appendChild(checkbox);
      item.appendChild(label);
      panel.appendChild(item);
    });
    container.appendChild(panel);
  }

  const btn = document.createElement('button');
  btn.id = 'gemini-auto-import-btn';
  btn.textContent = '📥 自動インポート';
  btn.addEventListener('click', runAutoImport);
  container.appendChild(btn);
}

// SPAでの画面遷移に対応するためObserverで監視
const observer = new MutationObserver(() => {
  if (!document.getElementById('gemini-auto-import-container')) {
    renderRepoPanel();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// 初回実行
renderRepoPanel();