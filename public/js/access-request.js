(function () {
  const api = window.SeigaApi;
  const form = document.querySelector('form.form');
  if (!api || !form || !location.pathname.endsWith('access-request.html')) return;
  form.removeAttribute('data-demo-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api.postJson('/api/access-requests', {
        name: document.getElementById('streamerName').value.trim(),
        email: document.getElementById('email').value.trim(),
        twitchUrl: document.getElementById('twitchUrl').value.trim(),
        message: document.getElementById('reason').value.trim()
      });
      form.reset();
      api.showToast('등록 요청이 접수되었습니다.');
    } catch (error) {
      api.showToast(error.message);
    }
  });
})();
