(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  if (!api || !document.querySelector('.settings-layout')) return;

  const me = await api.redirectIfUnauthorized('login.html?next=settings.html');
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let settings = null;
  let twitchStatus = null;
  let twitchNotice = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function setValue(id, value) {
    const node = $(id);
    if (node) node.value = value || '';
  }

  function setTwitchNotice(type, key, fallback) {
    twitchNotice = type ? { type, key, fallback } : null;
    const node = $('settingsTwitchNotice');
    if (!node) return;
    if (!type) {
      node.hidden = true;
      node.className = 'settings-notice';
      node.textContent = '';
      return;
    }
    node.hidden = false;
    node.className = `settings-notice ${type}`;
    node.textContent = t(key, {}, fallback);
  }

  function messageForTwitchError(code) {
    const messages = {
      twitch_already_linked: ['settings.twitchAlreadyLinked', '이 Twitch 계정은 다른 사용자에게 이미 연결되어 있습니다.'],
      twitch_reconnect_failed: ['settings.twitchReconnectFailed', 'Twitch 재연동에 실패했습니다. 다시 시도해주세요.'],
      twitch_not_configured: ['settings.twitchNotConfigured', 'Twitch 연동 설정이 완료되지 않았습니다. 관리자에게 설정을 요청해주세요.'],
      approval_required: ['settings.twitchApprovalRequired', '계정 승인 후 Twitch 재연동을 사용할 수 있습니다.'],
      twitch_session_required: ['settings.twitchSessionRequired', '로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 재연동해주세요.'],
      twitch_user: ['settings.twitchUserFailed', 'Twitch 계정 정보를 불러오지 못했습니다. 다시 시도해주세요.']
    };
    return messages[code] || ['settings.twitchUnknownError', 'Twitch 재연동 처리 중 오류가 발생했습니다. 다시 시도해주세요.'];
  }

  function consumeTwitchQuery() {
    const params = new URLSearchParams(location.search);
    const success = params.get('twitch') === 'reconnected';
    const errorCode = params.get('error');

    if (success) {
      setTwitchNotice('success', 'settings.twitchReconnectSuccess', 'Twitch 계정을 다시 연결했습니다.');
      api.showToast(t('settings.twitchReconnectSuccess', {}, 'Twitch 계정을 다시 연결했습니다.'));
    } else if (errorCode) {
      const [key, fallback] = messageForTwitchError(errorCode);
      setTwitchNotice('error', key, fallback);
      api.showToast(t(key, {}, fallback));
    }

    if (success || errorCode) {
      params.delete('twitch');
      params.delete('error');
      const nextQuery = params.toString();
      history.replaceState(null, '', `${location.pathname}${nextQuery ? `?${nextQuery}` : ''}${location.hash}`);
    }
  }

  function reconnectTwitchUrl() {
    const url = new URL('/auth/twitch', location.origin);
    url.searchParams.set('intent', 'reconnect');
    url.searchParams.set('returnTo', '/settings.html?twitch=reconnected');
    return `${url.pathname}${url.search}`;
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
    $('settingsRoleText').textContent = t('common.loading', {}, '불러오는 중입니다.');
    $('twitchStatusList').innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(t('settings.twitchLoading', {}, 'Twitch 상태를 불러오는 중입니다.'))}</strong></div></div>`;
  }

  function renderSettings(data) {
    settings = data;
    const profile = data.profile || {};
    const user = data.user || {};
    setValue('settingsDisplayName', user.displayName);
    setValue('settingsEmail', user.email);
    $('settingsRoleText').textContent = user.role || t('settings.noRole', {}, '역할 없음');
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
    const connectedText = status.connected
      ? t('settings.twitchPermissionSaved', { login: status.twitchLogin }, `${status.twitchLogin} · 권한 저장됨`)
      : t('settings.twitchNotConnectedDescription', {}, '아직 Twitch 계정이 연결되지 않았습니다.');
    const configText = status.configured
      ? t('settings.oauthConfigured', {}, 'OAuth Client ID/Secret 설정 완료')
      : t('settings.oauthNeedsEnv', {}, 'Twitch 환경변수 설정 필요');
    list.innerHTML = `
      <div class="list-item">
        <div class="item-icon">T</div>
        <div class="item-content"><strong>${api.escapeHtml(status.connected ? t('settings.twitchConnected', {}, 'Twitch 계정 연결됨') : t('settings.twitchNotConnected', {}, 'Twitch 계정 미연결'))}</strong><span>${api.escapeHtml(connectedText)}</span></div>
        <span class="pill ${status.connected ? 'ok' : 'warn'}">${status.connected ? 'ACTIVE' : 'WAIT'}</span>
      </div>
      <div class="list-item">
        <div class="item-icon">OAuth</div>
        <div class="item-content"><strong>${api.escapeHtml(t('settings.oauthTitle', {}, 'OAuth 설정'))}</strong><span>${api.escapeHtml(configText)}</span></div>
        <span class="pill ${status.configured ? 'ok' : 'warn'}">${status.configured ? 'READY' : 'CHECK'}</span>
      </div>
    `;
  }

  function renderError(error) {
    $('twitchStatusList').innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(error?.message || t('settings.error', {}, '설정 데이터를 불러오지 못했습니다.'))}</strong></div></div>`;
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
    api.showToast(t('settings.saveDone', {}, '설정이 저장되었습니다.'));
    await load();
  }

  $('saveSettingsButton')?.addEventListener('click', () => {
    save().catch((error) => api.showToast(error.message));
  });

  $('resetThemeButton')?.addEventListener('click', () => {
    $('settingsMainColor').value = settings?.profile?.mainColor || '#7c3aed';
    $('settingsSubColor').value = settings?.profile?.subColor || '#f9a8d4';
    updateThemePreview();
    api.showToast(t('settings.resetThemeDone', {}, '마지막으로 불러온 테마 색상으로 되돌렸습니다.'));
  });

  $('settingsMainColor')?.addEventListener('input', updateThemePreview);
  $('settingsSubColor')?.addEventListener('input', updateThemePreview);

  $('reconnectTwitchButton')?.addEventListener('click', () => {
    if (!me.authenticated) {
      location.href = 'login.html?next=settings.html';
      return;
    }
    location.href = reconnectTwitchUrl();
  });

  $('disconnectTwitchButton')?.addEventListener('click', async () => {
    if (!twitchStatus?.connected) {
      api.showToast(t('settings.noConnectedTwitch', {}, '연결된 Twitch 계정이 없습니다.'));
      return;
    }
    await api.postJson('/api/twitch/disconnect', {});
    renderTwitchStatus(await api.getJson('/api/twitch/status'));
    api.showToast(t('settings.disconnectDone', {}, 'Twitch 연동을 해제했습니다.'));
  });

  $('logoutButton')?.addEventListener('click', async () => {
    await api.logout('login.html');
  });
  document.addEventListener('seiga:i18n-change', () => {
    if (settings) renderSettings(settings);
    if (twitchStatus) renderTwitchStatus(twitchStatus);
    if (twitchNotice) setTwitchNotice(twitchNotice.type, twitchNotice.key, twitchNotice.fallback);
  });

  consumeTwitchQuery();
  load();
})();
