document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('githubUrl');
  const addBtn = document.getElementById('addBtn');
  const statusEl = document.getElementById('status');
  const repoListEl = document.getElementById('repoList');

  // スクロールバー設定要素
  const sbEnabled = document.getElementById('sbEnabled');
  const sbWidth = document.getElementById('sbWidth');
  const sbWidthValue = document.getElementById('sbWidthValue');
  const sbTransparent = document.getElementById('sbTransparent');

  // 設定の読み込み
  chrome.storage.local.get(['sbEnabled', 'sbWidth', 'sbTransparent'], (result) => {
    sbEnabled.checked = result.sbEnabled !== false; // 初期値 true
    sbWidth.value = result.sbWidth || 8;
    sbWidthValue.textContent = sbWidth.value;
    sbTransparent.checked = result.sbTransparent !== false; // 初期値 true
  });

  // 設定の保存
  const saveScrollSettings = () => {
    chrome.storage.local.set({
      sbEnabled: sbEnabled.checked,
      sbWidth: parseInt(sbWidth.value, 10),
      sbTransparent: sbTransparent.checked
    });
  };

  sbEnabled.addEventListener('change', saveScrollSettings);
  sbWidth.addEventListener('input', () => {
    sbWidthValue.textContent = sbWidth.value;
    saveScrollSettings();
  });
  sbTransparent.addEventListener('change', saveScrollSettings);

  // データ構造: repos = [{ url: '...', checked: true, lastImported: timestamp }]

  function loadRepos() {
    chrome.storage.local.get(['repos'], (result) => {
      let repos = result.repos || [];
      renderList(repos);
    });
  }

  function renderList(repos) {
    repoListEl.innerHTML = '';
    repos.forEach((repo, index) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = repo.url;

      const delBtn = document.createElement('button');
      delBtn.textContent = '削除';
      delBtn.className = 'delete-btn';
      delBtn.addEventListener('click', () => {
        repos.splice(index, 1);
        saveRepos(repos, '削除しました');
      });

      li.appendChild(span);
      li.appendChild(delBtn);
      repoListEl.appendChild(li);
    });
  }

  // --- 修正箇所: ストレージ保存完了後にメッセージを送信 ---
  function saveRepos(repos, msg) {
    chrome.storage.local.set({ repos }, () => {
      loadRepos();
      showStatus(msg, '#0f9d58');

      // 実行中のGeminiのタブを探して、リスト更新を通知する
      chrome.tabs.query({ url: "*://gemini.google.com/*" }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: "REFRESH_LIST" }).catch(() => {
            // タブが読み込み中の場合などはエラーが出るため無視
          });
        });
      });
    });
  }

  function showStatus(msg, color) {
    statusEl.textContent = msg;
    statusEl.style.color = color;
    setTimeout(() => {
      statusEl.textContent = '';
    }, 2000);
  }

  addBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();

    if (!url) {
      showStatus('内容を入力してください。', '#c5221f');
      return;
    }

    // セキュリティ＆UX向上のための簡易バリデーション
    const isWebUrl = /^https?:\/\//i.test(url);
    const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(url);
    const isUnixPath = /^\//.test(url);
    
    if (!isWebUrl && !isWindowsPath && !isUnixPath) {
      showStatus('無効なURLまたはパスです。', '#c5221f');
      return;
    }

    chrome.storage.local.get(['repos'], (result) => {
      const repos = result.repos || [];
      if (repos.some(r => r.url === url)) {
        showStatus('既に登録されています。', '#c5221f');
        return;
      }
      // 新規追加。初期状態はチェックON、インポート履歴なし(0)
      repos.push({ url, checked: true, lastImported: 0 });
      saveRepos(repos, '追加しました！');
      urlInput.value = '';
    });
  });

  loadRepos();
});