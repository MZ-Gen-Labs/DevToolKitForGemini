document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('githubUrl');
  const addBtn = document.getElementById('addBtn');
  const statusEl = document.getElementById('status');
  const repoListEl = document.getElementById('repoList');

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

  function saveRepos(repos, msg) {
    chrome.storage.local.set({ repos }, () => {
      loadRepos();
      showStatus(msg, '#0f9d58');
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
      showStatus('URLを入力してください。', '#c5221f');
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