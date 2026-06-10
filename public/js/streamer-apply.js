(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const form = document.getElementById('streamerApplyForm');
  if (!api || !form) return;

  const me = await api.redirectIfUnauthorized('login.html?next=streamer-apply.html');
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let currentStatus = null;
  let lastError = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function roleOf(auth = {}) {
    const role = String(auth.role || auth.user?.role || auth.raw?.role || 'USER').toUpperCase();
    return role === 'VIEWER' ? 'USER' : role;
  }

  function canUseStreamerTools(auth = me) {
    const role = roleOf(auth);
    return role === 'STREAMER' || role === 'ADMIN' || auth.user?.isStreamer === true || Boolean(auth.streamerProfile);
  }

  function setBadge(text, className = '') {
    const badge = $('streamerApplyStatusBadge');
    if (!badge) return;
    badge.className = `badge ${className}`.trim();
    badge.textContent = text;
  }

  function statusBox(key, fallback, descriptionKey, descriptionFallback, className = '') {
    return `
      <div class="status-box apply-status-card ${className}">
        <strong>${api.escapeHtml(t(key, {}, fallback))}</strong>
        <span>${api.escapeHtml(t(descriptionKey, {}, descriptionFallback))}</span>
      </div>
    `;
  }

  function setFormVisible(visible) {
    const panel = $('streamerApplyFormPanel');
    if (panel) panel.hidden = !visible;
    form.hidden = !visible;
  }

  function prefill() {
    const user = me.user || {};
    if ($('applyName') && !$('applyName').value) $('applyName').value = user.displayName || '';
    const twitchLogin = safeText(user.twitchLogin || user.twitchUserName || user.twitchId, '');
    if ($('applyTwitchId') && !$('applyTwitchId').value) $('applyTwitchId').value = twitchLogin;
    const twitchAccount = $('applyTwitchAccount');
    if (twitchAccount) {
      twitchAccount.textContent = twitchLogin
        ? `@${twitchLogin.replace(/^@/, '')}`
        : t('streamerApply.twitchNotConnected', {}, '연결된 Twitch 계정이 없습니다. 설정에서 Twitch를 연결할 수 있습니다.');
    }
  }

  function renderStatus(payload = currentStatus, error = lastError) {
    const target = $('streamerApplyStatus');
    if (!target) return;
    if (error) {
      setBadge(t('dashboard.statusError', {}, '오류'), 'is-error');
      target.innerHTML = statusBox('streamerApply.loadError', '신청 상태를 불러오지 못했습니다.', 'streamerApply.loadErrorText', '잠시 후 다시 시도해주세요.', 'is-error');
      setFormVisible(false);
      return;
    }

    const status = canUseStreamerTools() ? 'approved' : String(payload?.status || 'not_requested').toLowerCase();
    if (status === 'approved') {
      setBadge(t('dashboard.requestApprovedBadge', {}, 'APPROVED'), 'is-approved');
      target.innerHTML = `
        ${statusBox('dashboard.requestApprovedTitle', '스트리머 권한이 활성화되었습니다.', 'dashboard.requestApprovedText', '프로필 카드와 방송 관리 메뉴를 사용할 수 있습니다.', 'is-approved')}
        <div class="hero-actions"><a class="primary-btn" href="dashboard.html">${api.escapeHtml(t('nav.dashboard', {}, '대시보드'))}</a></div>
      `;
      setFormVisible(false);
      return;
    }

    if (status === 'pending') {
      setBadge(t('dashboard.requestPendingBadge', {}, 'PENDING'), 'is-pending');
      target.innerHTML = statusBox('dashboard.requestPendingTitle', '스트리머 등록 신청이 접수되었습니다.', 'dashboard.requestPendingText', '관리자 승인 전까지 중복 신청은 막아두었습니다.', 'is-pending');
      setFormVisible(false);
      return;
    }

    if (status === 'rejected') {
      setBadge(t('dashboard.requestRejectedBadge', {}, 'RETRY'), 'is-error');
      target.innerHTML = statusBox('dashboard.requestRejectedTitle', '이전 스트리머 등록 신청이 거절되었습니다.', 'dashboard.requestRejectedText', '일반 사용자 기능은 계속 사용할 수 있으며, 내용을 보완해 다시 신청할 수 있습니다.', 'is-error');
      setFormVisible(payload?.canApply !== false);
      return;
    }

    setBadge(t('dashboard.requestReadyBadge', {}, 'READY'));
    target.innerHTML = statusBox('dashboard.requestReadyTitle', '스트리머 등록 신청을 제출할 수 있습니다.', 'dashboard.requestReadyText', 'Twitch ID와 활동 내용을 입력하면 관리자 검토로 넘어갑니다.');
    setFormVisible(true);
  }

  async function loadStatus(showDone = false) {
    lastError = null;
    setBadge(t('common.loading', {}, '불러오는 중'));
    $('streamerApplyStatus').innerHTML = statusBox('streamerApply.loading', '신청 상태를 확인하는 중입니다.', 'streamerApply.loadingText', '잠시만 기다려주세요.');
    try {
      currentStatus = await api.getJson('/api/public/streamer-requests/me');
      renderStatus(currentStatus, null);
      if (showDone) api.showToast(t('streamerApply.refreshDone', {}, '신청 상태를 새로고침했습니다.'));
    } catch (error) {
      currentStatus = null;
      lastError = error;
      renderStatus(null, error);
    }
  }

  function composeMessage() {
    return [
      [t('dashboard.requestMainContent', {}, '주 콘텐츠'), $('applyMainContent')?.value],
      [t('dashboard.requestBio', {}, '자기소개'), $('applyBio')?.value],
      [t('dashboard.requestReason', {}, '신청 사유'), $('applyReason')?.value]
    ]
      .map(([label, value]) => {
        const text = safeText(value);
        return text ? `${label}: ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const button = $('submitStreamerApplyButton');
    button.disabled = true;
    button.textContent = t('dashboard.submittingStreamerRequest', {}, '신청 중...');

    const twitchId = safeText($('applyTwitchId')?.value).replace(/^@/, '');
    const twitchUrl = twitchId ? `https://twitch.tv/${encodeURIComponent(twitchId)}` : null;
    try {
      await api.postJson('/api/public/streamer-requests', {
        name: safeText($('applyName')?.value, me.user?.displayName),
        twitchUrl,
        message: composeMessage()
      });
      currentStatus = { status: 'pending', canApply: false };
      renderStatus(currentStatus, null);
      api.showToast(t('dashboard.streamerRequestDone', {}, '스트리머 등록 신청이 접수되었습니다.'));
    } catch (error) {
      const code = String(error?.payload?.code || '').toUpperCase();
      if (code === 'ACCESS_REQUEST_ALREADY_PENDING') {
        currentStatus = { status: 'pending', canApply: false };
        renderStatus(currentStatus, null);
        api.showToast(t('dashboard.streamerRequestAlreadyPending', {}, '이미 승인 대기 중인 신청이 있습니다.'));
      } else if (code === 'ACCESS_REQUEST_ALREADY_APPROVED') {
        currentStatus = { status: 'approved', canApply: false };
        renderStatus(currentStatus, null);
        api.showToast(t('dashboard.streamerRequestAlreadyApproved', {}, '이미 스트리머 권한이 있습니다.'));
      } else {
        api.showToast(error.message || t('dashboard.streamerRequestError', {}, '등록 신청을 제출하지 못했습니다.'));
      }
    } finally {
      button.disabled = false;
      button.textContent = t('dashboard.submitStreamerRequest', {}, '등록 신청 제출');
    }
  }

  prefill();
  $('refreshStreamerApplyButton')?.addEventListener('click', () => loadStatus(true));
  form.addEventListener('submit', submit);
  document.addEventListener('seiga:i18n-change', () => {
    prefill();
    renderStatus(currentStatus, lastError);
  });
  await loadStatus(false);
})();
