(async function () {
  if (!location.pathname.endsWith('admin-streamer-requests.html')) return;
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const endpoint = '/api/admin/streamer-requests';
  const listEl = document.getElementById('streamerRequestList');
  const stateEl = document.getElementById('streamerRequestState');
  const statusBadge = document.getElementById('streamerRequestStatusBadge');
  const refreshButton = document.getElementById('refreshStreamerRequestsButton');
  const counters = {
    pending: document.getElementById('pendingRequestCount'),
    approved: document.getElementById('approvedRequestCount'),
    rejected: document.getElementById('rejectedRequestCount')
  };

  if (!api || !listEl || !stateEl) return;

  const state = {
    mode: 'loading',
    items: [],
    message: '',
    actionKey: ''
  };

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function escape(value) {
    return api.escapeHtml(value);
  }

  function normalizeStatus(value) {
    return String(value || 'pending').trim().toLowerCase();
  }

  function statusMeta(status) {
    const normalized = normalizeStatus(status);
    if (normalized === 'approved') {
      return { label: t('adminRequests.statusApproved', {}, '승인됨'), className: 'ok' };
    }
    if (normalized === 'rejected') {
      return { label: t('adminRequests.statusRejected', {}, '거절됨'), className: 'live' };
    }
    return { label: t('adminRequests.statusPending', {}, '대기 중'), className: 'warn' };
  }

  function localeTag() {
    return window.SeigaI18n?.locale === 'ja' ? 'ja-JP' : 'ko-KR';
  }

  function formatDate(value) {
    if (!value) return t('adminRequests.notReviewed', {}, '아직 검토 전');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('adminRequests.notReviewed', {}, '아직 검토 전');
    return new Intl.DateTimeFormat(localeTag(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function countByStatus(status) {
    return state.items.filter((item) => normalizeStatus(item.status) === status).length;
  }

  function updateSummary() {
    counters.pending.textContent = state.mode === 'loading' ? '-' : String(countByStatus('pending'));
    counters.approved.textContent = state.mode === 'loading' ? '-' : String(countByStatus('approved'));
    counters.rejected.textContent = state.mode === 'loading' ? '-' : String(countByStatus('rejected'));
  }

  function setBadge(text, className = '') {
    statusBadge.textContent = text;
    statusBadge.className = `badge ${className}`.trim();
  }

  function renderState(kind, title, message, actionHtml = '') {
    stateEl.hidden = false;
    stateEl.innerHTML = `
      <div class="admin-state-card admin-state-${escape(kind)}">
        <strong>${escape(title)}</strong>
        <p>${escape(message)}</p>
        ${actionHtml}
      </div>
    `;
  }

  function clearState() {
    stateEl.hidden = true;
    stateEl.innerHTML = '';
  }

  function renderSkeleton() {
    listEl.innerHTML = Array.from({ length: 4 }).map(() => `
      <div class="list-item admin-request-item is-loading">
        <div class="admin-request-head">
          <div class="admin-skeleton admin-skeleton-title"></div>
          <div class="admin-skeleton admin-skeleton-badge"></div>
        </div>
        <div class="admin-skeleton admin-skeleton-line"></div>
        <div class="admin-skeleton admin-skeleton-line short"></div>
      </div>
    `).join('');
  }

  function renderItem(item) {
    const id = String(item.id || '');
    const status = statusMeta(item.status);
    const isPending = normalizeStatus(item.status) === 'pending';
    const approveKey = `approve:${id}`;
    const rejectKey = `reject:${id}`;
    const busy = state.actionKey === approveKey || state.actionKey === rejectKey;
    const twitchUrl = item.twitchUrl || '';
    const message = item.message || item.rejectionReason || t('adminRequests.noMessage', {}, '전달 메시지가 없습니다.');
    const reviewedText = item.reviewedAt || item.approvedAt || item.rejectedAt;

    return `
      <article class="list-item admin-request-item" data-request-id="${escape(id)}">
        <div class="admin-request-head">
          <div class="item-content">
            <strong>${escape(item.name || t('adminRequests.noName', {}, '이름 없음'))}</strong>
            <span>${escape(item.email || t('adminRequests.noEmail', {}, '이메일 없음'))}</span>
          </div>
          <span class="pill ${escape(status.className)}">${escape(status.label)}</span>
        </div>
        <dl class="admin-request-meta">
          <div>
            <dt>${escape(t('adminRequests.twitchUrl', {}, 'Twitch URL'))}</dt>
            <dd>${twitchUrl ? `<a href="${escape(twitchUrl)}" target="_blank" rel="noreferrer">${escape(twitchUrl)}</a>` : escape(t('adminRequests.noTwitchUrl', {}, '등록된 Twitch URL 없음'))}</dd>
          </div>
          <div>
            <dt>${escape(t('adminRequests.createdAt', {}, '신청일'))}</dt>
            <dd>${escape(formatDate(item.createdAt))}</dd>
          </div>
          <div>
            <dt>${escape(t('adminRequests.reviewedAt', {}, '검토일'))}</dt>
            <dd>${escape(formatDate(reviewedText))}</dd>
          </div>
        </dl>
        <p class="admin-request-message">${escape(message)}</p>
        <div class="admin-request-actions">
          ${isPending ? `
            <button class="primary-btn" type="button" data-request-action="approve" data-request-id="${escape(id)}" ${busy ? 'disabled' : ''}>
              ${escape(state.actionKey === approveKey ? t('adminRequests.approving', {}, '승인 중') : t('adminRequests.approve', {}, '승인'))}
            </button>
            <button class="danger-btn" type="button" data-request-action="reject" data-request-id="${escape(id)}" ${busy ? 'disabled' : ''}>
              ${escape(state.actionKey === rejectKey ? t('adminRequests.rejecting', {}, '거절 중') : t('adminRequests.reject', {}, '거절'))}
            </button>
          ` : `
            <span class="badge">${escape(t('adminRequests.reviewComplete', {}, '검토 완료'))}</span>
          `}
        </div>
      </article>
    `;
  }

  function renderList() {
    updateSummary();

    if (state.mode === 'loading') {
      setBadge(t('common.loading', {}, '불러오는 중'));
      renderState(
        'loading',
        t('adminRequests.loadingTitle', {}, '등록 요청을 불러오는 중입니다.'),
        t('adminRequests.loadingMessage', {}, '관리자 API 응답을 기다리고 있습니다.')
      );
      renderSkeleton();
      return;
    }

    if (state.mode === 'unauthorized') {
      setBadge(t('adminRequests.unauthorizedBadge', {}, '권한 없음'), 'pill warn');
      renderState(
        'unauthorized',
        t('adminRequests.unauthorizedTitle', {}, '관리자 권한이 필요합니다.'),
        state.message || t('adminRequests.unauthorizedMessage', {}, '이 화면은 관리자만 사용할 수 있습니다.'),
        `<div class="hero-actions"><a class="primary-btn" href="login.html">${escape(t('nav.login', {}, '로그인'))}</a><a class="ghost-btn" href="index.html">${escape(t('nav.publicHome', {}, '공개 홈'))}</a></div>`
      );
      listEl.innerHTML = '';
      return;
    }

    if (state.mode === 'error') {
      setBadge(t('dashboard.statusError', {}, '오류'), 'pill live');
      renderState(
        'error',
        t('adminRequests.errorTitle', {}, '등록 요청을 불러오지 못했습니다.'),
        state.message || t('adminRequests.errorMessage', {}, '잠시 후 다시 시도해주세요.'),
        `<div class="hero-actions"><button class="primary-btn" type="button" data-retry-streamer-requests>${escape(t('adminRequests.retry', {}, '다시 시도'))}</button></div>`
      );
      listEl.innerHTML = '';
      return;
    }

    if (!state.items.length) {
      setBadge(t('common.noData', {}, '데이터 없음'));
      renderState(
        'empty',
        t('adminRequests.emptyTitle', {}, '대기 중인 등록 요청이 없습니다.'),
        t('adminRequests.emptyMessage', {}, '새 신청이 접수되면 이 화면에 표시됩니다.')
      );
      listEl.innerHTML = '';
      return;
    }

    clearState();
    setBadge(t('adminRequests.countBadge', { count: state.items.length }, `${state.items.length}건`));
    listEl.innerHTML = state.items.map(renderItem).join('');
  }

  function setMode(mode, message = '') {
    state.mode = mode;
    state.message = message;
    renderList();
  }

  function isAdminAuthState(me) {
    if (window.SeigaAuth?.isAdmin) return window.SeigaAuth.isAdmin(me);
    const role = String(me?.role || me?.user?.role || '').toUpperCase();
    return Boolean(me?.authenticated && (role === 'ADMIN' || me?.isAdmin === true || me?.user?.isAdmin === true));
  }

  function redirectToLogin() {
    window.SeigaAuth?.clearAuthStorage?.();
    const next = location.pathname.split('/').pop() || 'admin-streamer-requests.html';
    location.href = `login.html?next=${encodeURIComponent(next)}`;
  }

  async function loadRequests() {
    setMode('loading');
    try {
      const payload = await api.getJson(endpoint);
      state.items = Array.isArray(payload.items) ? payload.items : [];
      setMode(state.items.length ? 'ready' : 'empty');
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      if (error.status === 403) {
        setMode('unauthorized', error.message || t('adminRequests.unauthorizedMessage', {}, '이 화면은 관리자만 사용할 수 있습니다.'));
        return;
      }
      setMode('error', error.message || t('adminRequests.errorMessage', {}, '잠시 후 다시 시도해주세요.'));
    }
  }

  async function ensureAdmin() {
    try {
      const me = window.SeigaAuth?.getAuthState
        ? await window.SeigaAuth.getAuthState({ force: true })
        : await api.getJson('/api/auth/me');
      if (!me.authenticated) {
        redirectToLogin();
        return false;
      }
      if (!isAdminAuthState(me)) {
        setMode('unauthorized', t('adminRequests.adminRequiredMessage', {}, '현재 계정에는 관리자 권한이 없습니다.'));
        return false;
      }
      return true;
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return false;
      }
      setMode('error', error.message || t('adminRequests.authCheckFailed', {}, '권한 확인에 실패했습니다.'));
      return false;
    }
  }

  async function runAction(button) {
    const id = button.dataset.requestId;
    const action = button.dataset.requestAction;
    if (!id || !['approve', 'reject'].includes(action) || state.actionKey) return;

    state.actionKey = `${action}:${id}`;
    renderList();

    try {
      const result = await api.postJson(`${endpoint}/${encodeURIComponent(id)}/${action}`, {});
      if (action === 'approve' && result.passwordSetup?.setupUrl) {
        api.showToast(t(
          'adminRequests.approveDoneWithSetupUrl',
          { url: result.passwordSetup.setupUrl },
          `승인되었습니다. 비밀번호 설정 링크: ${result.passwordSetup.setupUrl}`
        ));
      } else if (action === 'approve' && result.passwordSetup?.delivery === 'email') {
        api.showToast(t(
          'adminRequests.approveDoneWithSetupEmail',
          {},
          '승인되었습니다. 비밀번호 설정 안내를 이메일로 발송했습니다.'
        ));
      } else {
        api.showToast(action === 'approve'
          ? t('adminRequests.approveDone', {}, '승인 처리했습니다.')
          : t('adminRequests.rejectDone', {}, '거절 처리했습니다.'));
      }
      state.actionKey = '';
      await loadRequests();
    } catch (error) {
      state.actionKey = '';
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      if (error.status === 403) {
        setMode('unauthorized', error.message || t('adminRequests.unauthorizedMessage', {}, '이 화면은 관리자만 사용할 수 있습니다.'));
        return;
      }
      api.showToast(error.message || t('adminRequests.actionFailed', {}, '요청 처리에 실패했습니다.'));
      renderList();
    }
  }

  refreshButton?.addEventListener('click', loadRequests);
  listEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-request-action]');
    if (button) runAction(button);
  });
  stateEl.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-streamer-requests]')) loadRequests();
  });
  document.addEventListener('seiga:i18n-change', renderList);

  if (await ensureAdmin()) {
    await loadRequests();
  }
})();
