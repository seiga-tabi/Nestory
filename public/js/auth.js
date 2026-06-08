(function () {
  const api = window.SeigaApi;
  const loginForm = document.getElementById('loginForm');
  const loginButton = document.getElementById('loginButton');
  const messageBox = document.getElementById('message');
  const twitchLoginButton = document.getElementById('twitchLoginButton');
  if (!api || !loginForm) return;

  function showMessage(type, text) {
    messageBox.className = `message ${type}`;
    messageBox.textContent = text;
  }

  api.getJson('/api/auth/me').then((me) => {
    if (me.authenticated) location.href = 'dashboard.html';
  }).catch(() => {});

  twitchLoginButton?.addEventListener('click', () => {
    location.href = '/auth/twitch';
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    loginButton.textContent = '로그인 중...';
    showMessage('', '');

    try {
      await api.postJson('/api/auth/login', {
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        rememberMe: document.getElementById('rememberMe')?.checked || false
      });
      showMessage('success', '로그인되었습니다. 대시보드로 이동합니다.');
      setTimeout(() => { location.href = 'dashboard.html'; }, 400);
    } catch (error) {
      showMessage('error', error.message || '로그인에 실패했습니다.');
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = '로그인';
    }
  });
})();
