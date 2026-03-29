// utility: 指定したミリ秒待機する
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// utility: 画面上で見えているDOM要素の中から、特定のテキストを含む最も具体的な（面積が小さい）要素を探す
function findTerminalElementByText(selector, textSearch) {
  const elements = Array.from(document.querySelectorAll(selector));
  const matching = elements.filter(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return el.textContent.trim() === textSearch || el.textContent.includes(textSearch);
  });
  if (matching.length === 0) return null;
  matching.sort((a,b) => {
     let areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
     let areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
     return areaA - areaB;
  });
  return matching[0]; // 最も内側の要素
}

// 自動インポート処理本体
async function runAutoImport() {
  const button = document.getElementById('gemini-auto-import-btn');
  button.textContent = '処理中...';
  button.style.backgroundColor = '#fbbc04'; 
  button.disabled = true;
  
  try {
    // 1. StorageからURLを取得
    const data = await chrome.storage.local.get(['githubUrl']);
    const url = data.githubUrl;
    if (!url) {
      alert('自動インポート機能：拡張機能アイコンをクリックし、そこからインポートしたいGitHub URLを保存してください。');
      return;
    }

    // 2. 「+」ボタン（またはメニューを開くボタン）を探してクリック
    let plusBtn = null;
    let textarea = document.querySelector('textarea, rich-textarea, div[contenteditable="true"]');
    if(textarea) {
       let container = textarea.parentElement;
       while(container && container.tagName !== 'BODY') {
          let btns = container.querySelectorAll('button, div[role="button"]');
          if(btns.length > 0) {
              // input container内の最初のボタンが概ね [+] ボタン
              plusBtn = btns[0];
              break;
          }
          container = container.parentElement;
       }
    }

    if (!plusBtn) {
      alert('自動インポート機能：[+] メニューボタンが見つかりませんでした。GeminiのUIが変更された可能性があります。');
      return;
    }

    plusBtn.click();
    await sleep(500); 

    // 3. 「コードをインポート」項目をクリック
    let importCodeItem = findTerminalElementByText('div, span, li, button, a', 'コードをインポート');
    if(!importCodeItem) {
      importCodeItem = findTerminalElementByText('div, span, li, button, a', 'Import code');
    }

    if (!importCodeItem) {
      await sleep(1000); // メニュー描画の遅延を想定して再試行
      importCodeItem = findTerminalElementByText('div, span, li, button, a', 'コードをインポート') || 
                       findTerminalElementByText('div, span, li, button, a', 'Import code');
                       
      if(!importCodeItem) {
          alert('自動インポート機能：「コードをインポート」メニューが見つかりませんでした。');
          return;
      }
    }

    let clickableItem = importCodeItem.closest('div[role="menuitem"]') || 
                        importCodeItem.closest('li') || 
                        importCodeItem.closest('button') || importCodeItem;
    clickableItem.click();
    await sleep(800); // ダイアログが開くのを待つ

    // 4. ダイアログの入力欄にURLを入力
    let urlInput = document.querySelector('input[placeholder*="github.com"]');
    if (!urlInput) {
       // fallback
       const dialogs = document.querySelectorAll('dialog, [role="dialog"]');
       if(dialogs.length > 0) {
           let dialog = dialogs[dialogs.length - 1]; 
           urlInput = dialog.querySelector('input[type="text"]');
       }
       if(!urlInput) {
           const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
           urlInput = inputs.find(input => {
               const rect = input.getBoundingClientRect();
               return rect.width > 0 && rect.height > 0 && input.value === '';
           });
       }
    }

    if (!urlInput) {
      alert('自動インポート機能：URL入力欄が見つかりませんでした。');
      return;
    }

    urlInput.focus();
    urlInput.value = url;
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    urlInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    // ReactやAngular等での内部状態への反映を待つ
    await sleep(300);

    // 5. 「インポート」ボタンをクリック
    let insertBtn = findTerminalElementByText('button, div[role="button"]', 'インポート');
    if(!insertBtn) {
        insertBtn = findTerminalElementByText('button, div[role="button"]', 'Import');
    }

    if (insertBtn) {
       let targetBtn = insertBtn.closest('button') || insertBtn.closest('div[role="button"]') || insertBtn;
       targetBtn.click();
       button.textContent = 'インポート完了！';
       button.style.backgroundColor = '#0f9d58';
    } else {
       alert('自動インポート機能：「インポート」実行ボタンが見つかりませんでした。');
    }

  } catch (err) {
    console.error(err);
    alert('自動インポート機能：予期せぬエラーが発生しました。' + err.message);
  } finally {
    setTimeout(() => {
       button.textContent = '📥 自動インポート';
       button.style.backgroundColor = '#0b57d0';
       button.disabled = false;
    }, 3000);
  }
}

// ページにインポートボタンを注入する
function injectImportButton() {
  if (document.getElementById('gemini-auto-import-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'gemini-auto-import-btn';
  btn.textContent = '📥 自動インポート';
  // チャット画面のみに表示したい場合などの調整も可能ですが、一旦常に表示します。
  btn.addEventListener('click', runAutoImport);
  document.body.appendChild(btn);
}

// SPAでの画面遷移に対応するためObserverで監視
const observer = new MutationObserver(() => {
  injectImportButton();
});
observer.observe(document.body, { childList: true, subtree: true });

// 初回実行
injectImportButton();
