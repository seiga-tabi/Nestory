(async function () {
  const api = window.SeigaApi;
  if (!api || !document.querySelector('.settings-layout')) return;

  const me = await api.redirectIfUnauthorized();
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let settings = null;
  let twitchStatus = null;

  function setValue(id, value) {
    const node = $(id);
    if (node) node.value = value || '';
  }

  function updateThemePreview() {
    const main = $('settingsMainColor')?.value || '#7c3aed';
    const sub = $('settingsSubColor')?.value || '#f9a8d4';
    const preview = $('themePreview');
    if (!preview) return;
    preview.style.background = `radial-gradient(circle at 20% 18%, ${sub}, transparent 34%), linear-gradient(135deg, ${main}, #2d1b4a)`;
  }

  function renderLoading() {
    setValue('settingsDisplayName', '');
    setValue('settingsEmail', '');
    setValue('settingsPublicUrl', '');
    $('settingsRoleText').textContent = '불러오는 중입니다.';
    $('twitchStatusList').innerHTML = '<div class="list-item"><div class="item-content"><strong>Twitch 상태를 불러오는 중입니다.</strong></div></div>';
  }

  function renderSettings(data) {
    settings = data;
    const profile = data.profile || {};
    const user = data.user || {};
    setValue('settingsDisplayName', user.displayName);
    setValue('settingsEmail', user.email);
    $('settingsRoleText').textContent = user.role || '역할 없음';
    setValue('settingsPublicUrl', profile.slug ? `${location.origin}/streamer-detail.html?slug=${encodeURIComponent(profile.slug)}` : '');
    $('settingsPublicToggle').checked = Boolean(profile.isPublic);
    $('settingsNotificationToggle').checked = profile.notificationOpt !== false;
    $('settingsMainColor').value = profile.mainColor || '#7c3aed';
    $('settingsSubColor').value = profile.subColor || '#f9a8d4';
    updateThemePreview();
  }

  function renderTwitchStatus(status) {
    twitchStatus = status;
    const list = $('twitchStatusList');
    if (!list) return;
    const connectedText = status.connected ? `${status.twitchLogin} · 권한 저장됨` : '아직 Twitch 계정이 연결되지 않았습니다.';
    const configText = status.configured ? 'OAuth Client ID/Secret 설정 완료' : 'Twitch 환경변수 설정 필요';
    list.innerHTML = `
      <div class="list-item">
        <div class="item-icon">T</div>
        <div class="item-content"><strong>${status.connected ? 'Twitch 계정 연결됨' : 'Twitch 계정 미연결'}</strong><span>${api.escapeHtml(connectedText)}</span></div>
        <span class="pill ${status.connected ? 'ok' : 'warn'}">${status.connected ? 'ACTIVE' : 'WAIT'}</span>
      </div>
      <div class="list-item">
        <div class="item-icon">OAuth</div>
        <div class="item-content"><strong>OAuth 설정</strong><span>${api.escapeHtml(configText)}</span></div>
        <span class="pill ${status.configured ? 'ok' : 'warn'}">${status.configured ? 'READY' : 'CHECK'}</span>
      </div>
    `;
  }

  function renderError(error) {
    $('twitchStatusList').innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(error?.message || '설정 데이터를 불러오지 못했습니다.')}</strong></div></div>`;
  }

  async function load() {
    renderLoading();
    try {
      const [settingsPayload, twitchPayload] = await Promise.all([
        api.getJson('/api/settings'),
        api.getJson('/api/twitch/status')
      ]);
      renderSettings(settingsPayload);
      renderTwitchStatus(twitchPayload);
    } catch (error) {
      renderError(error);
    }
  }

  async function save() {
    await api.putJson('/api/settings/profile', {
      displayName: $('settingsDisplayName')?.value.trim() || settings?.user?.displayName,
      email: $('settingsEmail')?.value.trim() || settings?.user?.email,
      language: settings?.profile?.language,
      notificationOpt: Boolean($('settingsNotificationToggle')?.checked)
    });
    await api.putJson('/api/settings/privacy', { isPublic: Boolean($('settingsPublicToggle')?.checked) });
    api.showToast('설정이 저장되었습니다.');
    await load();
  }

  $('saveSettingsButton')?.addEventListener('click', () => {
    save().catch((error) => api.showToast(error.message));
  });

  $('resetThemeButton')?.addEventListener('click', () => {
    $('settingsMainColor').value = settings?.profile?.mainColor || '#7c3aed';
    $('settingsSubColor').value = settings?.profile?.subColor || '#f9a8d4';
    updateThemePreview();
    api.showToast('마지막으로 불러온 테마 색상으로 되돌렸습니다.');
  });

  $('settingsMainColor')?.addEventListener('input', updateThemePreview);
  $('settingsSubColor')?.addEventListener('input', updateThemePreview);

  $('reconnectTwitchButton')?.addEventListener('click', () => {
    location.href = '/auth/twitch';
  });

  $('disconnectTwitchButton')?.addEventListener('click', async () => {
    if (!twitchStatus?.connected) {
      api.showToast('연결된 Twitch 계정이 없습니다.');
      return;
    }
    await api.postJson('/api/twitch/disconnect', {});
    renderTwitchStatus(await api.getJson('/api/twitch/status'));
    api.showToast('Twitch 연동을 해제했습니다.');
  });

  $('logoutButton')?.addEventListener('click', async () => {
    await api.postJson('/api/auth/logout', {});
    location.href = 'login.html';
  });

  load();
})();
