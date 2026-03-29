document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('githubUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // 保存済みのURLを読み込んで反映
  chrome.storage.local.get(['githubUrl'], (result) => {
    if (result.githubUrl) {
      urlInput.value = result.githubUrl;
    }
  });

  // 保存ボタンが押されたときの処理
  saveBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
      statusEl.textContent = 'URLを入力してください。';
      statusEl.style.color = '#c5221f';
      return;
    }
    chrome.storage.local.set({ githubUrl: url }, () => {
      statusEl.textContent = '保存しました！';
      statusEl.style.color = '#0f9d58';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    });
  });
});
