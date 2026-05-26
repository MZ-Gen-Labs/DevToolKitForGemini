document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('githubUrl');
  const addBtn = document.getElementById('addBtn');
  const statusEl = document.getElementById('status');
  const repoListEl = document.getElementById('repoList');

  // 🌟 修正：パネル表示設定要素を追加
  const panelVisible = document.getElementById('panelVisible');
  const sbEnabled = document.getElementById('sbEnabled');
  const sbWidth = document.getElementById('sbWidth');
  const sbWidthValue = document.getElementById('sbWidthValue');
  const sbTransparent = document.getElementById('sbTransparent');
  const modelSwitchEnabled = document.getElementById('modelSwitchEnabled'); // 🌟 追加

  // 🌟 修正：設定の読み込みに modelSwitchEnabled を追加
  chrome.storage.local.get(['panelVisible', 'sbEnabled', 'sbWidth', 'sbTransparent', 'modelSwitchEnabled'], (result) => {
    panelVisible.checked = result.panelVisible !== false; // 初期値 true
    sbEnabled.checked = result.sbEnabled !== false; // 初期値 true
    sbWidth.value = result.sbWidth || 8;
    sbWidthValue.textContent = sbWidth.value;
    sbTransparent.checked = result.sbTransparent !== false; // 初期値 true
    modelSwitchEnabled.checked = result.modelSwitchEnabled !== false; // 🌟 追加 (初期値 true)
  });

  // 🌟 修正：設定の保存に modelSwitchEnabled を追加
  const saveDisplaySettings = () => {
    chrome.storage.local.set({
      panelVisible: panelVisible.checked,
      sbEnabled: sbEnabled.checked,
      sbWidth: parseInt(sbWidth.value, 10),
      sbTransparent: sbTransparent.checked,
      modelSwitchEnabled: modelSwitchEnabled.checked // 🌟 追加
    });
  };

  // 🌟 修正：イベントリスナーの登録
  modelSwitchEnabled.addEventListener('change', saveDisplaySettings);
  panelVisible.addEventListener('change', saveDisplaySettings);
  sbEnabled.addEventListener('change', saveDisplaySettings);
  sbWidth.addEventListener('input', () => {
    sbWidthValue.textContent = sbWidth.value;
    saveDisplaySettings();
  });
  sbTransparent.addEventListener('change', saveDisplaySettings);

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