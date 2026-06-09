(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const form = document.querySelector('form.form');
  const select = document.getElementById('targetStreamer');
  if (!api || !form || !select) return;

  form.removeAttribute('data-demo-submit');

  const params = new URLSearchParams(location.search);
  const requestedSlug = params.get('slug');
  const state = document.getElementById('fanCardWriteState');
  const previewTitle = document.getElementById('fanCardPreviewTitle');
  const previewMessage = document.getElementById('fanCardPreviewMessage');
  const previewSender = document.getElementById('fanCardPreviewSender');
  const previewVisibility = document.getElementById('fanCardPreviewVisibility');
  const messageInput = document.getElementById('message');
  const nicknameInput = document.getElementById('nickname');
  const submitButton = form.querySelector('button[type="submit"]');
  let streamers = [];

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function setFormDisabled(disabled) {
    form.querySelectorAll('input, select, textarea, button').forEach((node) => {
      if (node.closest('.submit-row') && node.tagName === 'A') return;
      node.disabled = disabled;
    });
  }

  function renderLoading() {
    setFormDisabled(true);
    if (state) {
      state.hidden = false;
      state.textContent = t('fanCardWrite.loadingStreamers', {}, '공개 스트리머 목록을 불러오는 중입니다.');
    }
    select.innerHTML = '';
    updatePreview();
  }

  function renderEmpty() {
    setFormDisabled(true);
    if (state) {
      state.hidden = false;
      state.textContent = t('fanCardWrite.emptyStreamers', {}, '팬 카드를 보낼 공개 스트리머가 없습니다.');
    }
    select.innerHTML = '';
    updatePreview();
  }

  function renderError(error) {
    setFormDisabled(true);
    if (state) {
      state.hidden = false;
      state.textContent = error?.message || t('fanCardWrite.streamerLoadError', {}, '공개 스트리머 목록을 불러오지 못했습니다.');
    }
    select.innerHTML = '';
    updatePreview();
  }

  function render(items = []) {
    streamers = items;
    if (!streamers.length) {
      renderEmpty();
      return;
    }
    setFormDisabled(false);
    if (state) {
      state.hidden = true;
      state.textContent = '';
    }
    select.innerHTML = streamers
      .map((profile) => `<option value="${api.escapeHtml(profile.slug)}">${api.escapeHtml(profile.name || t('index.noName', {}, '이름 없는 스트리머'))}</option>`)
      .join('');
    if (requestedSlug && streamers.some((profile) => profile.slug === requestedSlug)) {
      select.value = requestedSlug;
    }
    updatePreview();
  }

  function selectedStreamer() {
    return streamers.find((profile) => profile.slug === select.value);
  }

  function updatePreview() {
    const streamer = selectedStreamer();
    const message = messageInput?.value.trim();
    const sender = nicknameInput?.value.trim();
    if (previewTitle) previewTitle.textContent = streamer ? `To. ${streamer.name || t('index.noName', {}, '이름 없는 스트리머')}` : t('fanCardWrite.selectStreamer', {}, '대상 스트리머를 선택하세요.');
    if (previewMessage) previewMessage.textContent = message || t('fanCardWrite.previewMessagePlaceholder', {}, '응원 메시지를 입력하면 이곳에 표시됩니다.');
    if (previewSender) previewSender.textContent = sender || t('dashboard.anonymousFan', {}, '익명 팬');
    if (previewVisibility) {
      const visibilityValue = document.querySelector('input[name="visibility"]:checked')?.value || 'public';
      previewVisibility.textContent = visibilityValue === 'public'
        ? t('fanCardWrite.visibilityPublic', {}, '공개 가능')
        : t('fanCardWrite.visibilityPrivate', {}, '스트리머만 보기');
    }
  }

  async function loadStreamers() {
    renderLoading();
    try {
      const data = await api.getJson('/api/public/streamers');
      render(data.items || []);
    } catch (error) {
      renderError(error);
    }
  }

  select.addEventListener('change', updatePreview);
  messageInput?.addEventListener('input', updatePreview);
  nicknameInput?.addEventListener('input', updatePreview);
  document.querySelectorAll('input[name="visibility"]').forEach((input) => input.addEventListener('change', updatePreview));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const targetSlug = select.value;
    if (!targetSlug) return api.showToast(t('fanCardWrite.selectStreamerRequired', {}, '대상 스트리머를 선택해주세요.'));

    const message = messageInput.value.trim();
    if (!message) return api.showToast(t('fanCardWrite.messageRequired', {}, '응원 메시지를 입력해주세요.'));

    try {
      submitButton.disabled = true;
      await api.postJson(`/api/public/streamers/${encodeURIComponent(targetSlug)}/fan-cards`, {
        senderName: nicknameInput.value.trim() || null,
        message,
        emoji: '💌',
        isPublic: (document.querySelector('input[name="visibility"]:checked')?.value || 'public') === 'public'
      });
      const keepSlug = targetSlug;
      form.reset();
      select.value = keepSlug;
      updatePreview();
      api.showToast(t('fanCardWrite.submitDone', {}, '팬 카드가 검토 대기 상태로 저장되었습니다.'));
    } catch (error) {
      api.showToast(error.message);
    } finally {
      submitButton.disabled = false;
    }
  });

  loadStreamers();
  document.addEventListener('seiga:i18n-change', () => {
    updatePreview();
    if (!streamers.length) renderEmpty();
  });
})();
