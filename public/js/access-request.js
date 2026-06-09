(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const form = document.querySelector('form.form');
  if (!api || !form || !location.pathname.endsWith('access-request.html')) return;
  form.removeAttribute('data-demo-submit');

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

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
      api.showToast(t('accessRequest.submitDone', {}, '등록 요청이 접수되었습니다.'));
    } catch (error) {
      api.showToast(error.message);
    }
  });
})();
