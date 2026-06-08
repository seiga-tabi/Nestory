(function () {
  const api = window.SeigaApi;
  const form = document.querySelector('form.form');
  if (!api || !form || !location.pathname.endsWith('forgot-password.html')) return;
  form.removeAttribute('data-demo-submit');
  const token = new URLSearchParams(location.search).get('token');

  if (token) {
    const field = document.querySelector('.field');
    field.insertAdjacentHTML('afterend', '<div class="field"><label for="newPassword">새 비밀번호</label><input id="newPassword" type="password" minlength="8" required /></div>');
    form.querySelector('button[type="submit"]').textContent = '비밀번호 변경';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      if (token) {
        await api.postJson('/api/auth/reset-password', {
          token,
          password: document.getElementById('newPassword').value
        });
        api.showToast('비밀번호가 변경되었습니다.');
        setTimeout(() => { location.href = 'login.html'; }, 600);
      } else {
        await api.postJson('/api/auth/forgot-password', {
          email: document.getElementById('email').value.trim()
        });
        form.reset();
        api.showToast('계정이 존재하면 재설정 안내를 발송했습니다.');
      }
    } catch (error) {
      api.showToast(error.message);
    }
  });
})();
