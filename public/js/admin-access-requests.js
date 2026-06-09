(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const root = document.getElementById('adminAccessRequestsPage');
  const list = document.getElementById('accessRequestList');
  if (!api || !root || !list) return;

  const $ = (id) => document.getElementById(id);
  const statusOrder = ['PENDING', 'APPROVED', 'REJECTED'];
  let activeStatus = 'PENDING';
  let items = [];
  let selectedId = '';

  function t(key, fallback = key, params = {}) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function normalizeStatus(value) {
    const status = String(value || 'PENDING').trim().toUpperCase();
    return statusOrder.includes(status) ? status : 'PENDING';
  }

  function numberText(value) {
    return window.SeigaI18n?.number?.(value) || Number(value || 0).toLocaleString('ko-KR');
  }

  function dateText(value) {
    if (!value) return t('adminAccess.noDate', '날짜 없음');
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) return t('adminAccess.noDate', '날짜 없음');
    return time.toLocaleString(window.SeigaI18n?.locale === 'ja' ? 'ja-JP' : 'ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function statusLabel(status) {
    const normalized = normalizeStatus(status);
    const labels = {
      PENDING: t('adminAccess.statusPending', '검토 대기'),
      APPROVED: t('adminAccess.statusApproved', '승인 완료'),
      REJECTED: t('adminAccess.statusRejected', '거절됨')
    };
    return labels[normalized] || normalized || '-';
  }

  function statusClass(status) {
    const normalized = normalizeStatus(status);
    if (normalized === 'APPROVED') return 'ok';
    if (normalized === 'REJECTED') return 'warn';
    return 'live';
  }

  function requesterInitial(item) {
    return api.escapeHtml(Array.from(safeText(item.name, '?'))[0] || '?');
  }

  function twitchId(value) {
    const text = safeText(value);
    if (!text) return t('adminAccess.noTwitch', '미입력');
    try {
      const url = new URL(text.startsWith('http') ? text : `https://${text}`);
      const match = url.pathname.split('/').filter(Boolean)[0];
      return safeText(match, text).replace(/^@/, '');
    } catch {
      return text.replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/^@/, '') || text;
    }
  }

  function filteredItems() {
    return items.filter((item) => normalizeStatus(item.status) === activeStatus);
  }

  function renderCounts() {
    const counts = statusOrder.reduce((acc, status) => {
      acc[status] = items.filter((item) => normalizeStatus(item.status) === status).length;
      return acc;
    }, {});
    $('requestStatAll').textContent = numberText(items.length);
    $('requestStatPending').textContent = numberText(counts.PENDING);
    $('requestStatApproved').textContent = numberText(counts.APPROVED);
    $('requestStatRejected').textContent = numberText(counts.REJECTED);
  }

  function renderLoading() {
    $('accessRequestCount').textContent = t('adminAccess.loading', '등록 요청을 불러오는 중입니다.');
    list.innerHTML = `<article class="request-card"><p class="request-empty">${api.escapeHtml(t('adminAccess.loading', '등록 요청을 불러오는 중입니다.'))}</p></article>`;
  }

  function renderError(error) {
    $('accessRequestCount').textContent = t('adminAccess.error', '등록 요청을 불러오지 못했습니다.');
    list.innerHTML = `<article class="request-card"><p class="request-empty">${api.escapeHtml(error?.message || t('adminAccess.error', '등록 요청을 불러오지 못했습니다.'))}</p></article>`;
    renderDetail(null);
  }

  function renderForbidden() {
    $('accessRequestCount').textContent = t('adminAccess.forbidden', '관리자 권한이 필요합니다.');
    list.innerHTML = `<article class="request-card"><p class="request-empty">${api.escapeHtml(t('adminAccess.forbiddenDescription', '이 화면은 관리자 계정으로 로그인한 경우에만 사용할 수 있습니다.'))}</p></article>`;
    renderDetail(null);
  }

  function renderCard(item) {
    const status = normalizeStatus(item.status);
    const isPending = status === 'PENDING';
    const isSelected = item.id === selectedId;
    const message = safeText(item.message, t('adminAccess.noReason', '신청 사유가 없습니다.'));
    return `
      <article class="request-card${isSelected ? ' selected' : ''}" data-request-id="${api.escapeHtml(item.id)}">
        <div class="request-person">
          <div class="request-avatar">${requesterInitial(item)}</div>
          <div class="request-person-text">
            <strong>${api.escapeHtml(safeText(item.name, t('adminAccess.noName', '이름 없음')))}</strong>
            <span>${api.escapeHtml(safeText(item.email, t('adminAccess.noEmail', '이메일 없음')))}</span>
          </div>
        </div>
        <div class="request-field">
          <span>${api.escapeHtml(t('adminAccess.twitchId', 'Twitch ID'))}</span>
          <strong>${api.escapeHtml(twitchId(item.twitchUrl))}</strong>
        </div>
        <p class="request-reason">${api.escapeHtml(message)}</p>
        <div class="request-date">${api.escapeHtml(dateText(item.createdAt))}</div>
        <span class="pill ${statusClass(status)}">${api.escapeHtml(statusLabel(status))}</span>
        <div class="request-actions">
          <button class="ghost-btn" type="button" data-detail>${api.escapeHtml(t('adminAccess.detailButton', '상세 보기'))}</button>
          <button class="primary-btn" type="button" data-action="approve" ${isPending ? '' : 'disabled'}>${api.escapeHtml(t('adminAccess.approve', '승인'))}</button>
          <button class="danger-btn" type="button" data-action="reject" ${isPending ? '' : 'disabled'}>${api.escapeHtml(t('adminAccess.reject', '거절'))}</button>
        </div>
      </article>
    `;
  }

  function renderList() {
    renderCounts();
    const visibleItems = filteredItems();
    $('accessRequestCount').textContent = t(
      'adminAccess.count',
      `${numberText(items.length)}개 중 ${numberText(visibleItems.length)}개 표시`,
      { total: numberText(items.length), count: numberText(visibleItems.length) }
    );

    if (!visibleItems.length) {
      list.innerHTML = `<article class="request-card"><p class="request-empty">${api.escapeHtml(t('adminAccess.empty', '현재 탭에 표시할 요청이 없습니다.'))}</p></article>`;
      return;
    }

    list.innerHTML = visibleItems.map(renderCard).join('');
  }

  function detailRow(label, value) {
    return `
      <div class="detail-row">
        <span>${api.escapeHtml(label)}</span>
        <strong>${api.escapeHtml(value)}</strong>
      </div>
    `;
  }

  function renderDetail(item) {
    const body = $('accessRequestDetailBody');
    const badge = $('detailStatusBadge');
    if (!body || !badge) return;
    if (!item) {
      badge.textContent = '-';
      badge.className = 'badge';
      body.className = 'detail-empty';
      body.textContent = t('adminAccess.detailEmpty', '왼쪽 목록에서 요청을 선택하세요.');
      return;
    }

    const status = normalizeStatus(item.status);
    badge.textContent = statusLabel(status);
    badge.className = `pill ${statusClass(status)}`;
    body.className = 'detail-grid';
    body.innerHTML = [
      detailRow(t('adminAccess.requesterName', '요청자 이름'), safeText(item.name, t('adminAccess.noName', '이름 없음'))),
      detailRow(t('adminAccess.email', '이메일'), safeText(item.email, t('adminAccess.noEmail', '이메일 없음'))),
      detailRow(t('adminAccess.twitchUrl', 'Twitch URL'), safeText(item.twitchUrl, t('adminAccess.noTwitch', '미입력'))),
      detailRow(t('adminAccess.twitchId', 'Twitch ID'), twitchId(item.twitchUrl)),
      detailRow(t('adminAccess.submittedAt', '제출일'), dateText(item.createdAt)),
      detailRow(t('adminAccess.reviewedAt', '검토일'), dateText(item.reviewedAt || item.approvedAt || item.rejectedAt)),
      `<div class="detail-row detail-row--wide"><span>${api.escapeHtml(t('adminAccess.reason', '신청 사유'))}</span><p>${api.escapeHtml(safeText(item.message, t('adminAccess.noReason', '신청 사유가 없습니다.')))}</p></div>`
    ].join('');
  }

  function renderAll() {
    renderList();
    renderDetail(items.find((item) => item.id === selectedId) || null);
  }

  async function load() {
    renderLoading();
    try {
      const me = await api.redirectIfUnauthorized();
      if (!me) return;
      if (me.user?.role !== 'ADMIN') {
        renderForbidden();
        return;
      }
      const data = await api.getJson('/api/admin/access-requests');
      items = Array.isArray(data.items) ? data.items : [];
      if (selectedId && !items.some((item) => item.id === selectedId)) selectedId = '';
      renderAll();
    } catch (error) {
      renderError(error);
    }
  }

  async function updateRequest(id, action) {
    const item = items.find((entry) => entry.id === id);
    if (!item || normalizeStatus(item.status) !== 'PENDING') return;
    await api.postJson(`/api/admin/access-requests/${encodeURIComponent(id)}/${action}`, {});
    api.showToast(action === 'approve'
      ? t('adminAccess.approveDone', '등록 요청을 승인했습니다.')
      : t('adminAccess.rejectDone', '등록 요청을 거절했습니다.'));
    selectedId = id;
    await load();
  }

  document.querySelectorAll('[data-request-filter]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-request-filter]').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      activeStatus = tab.dataset.requestFilter || 'PENDING';
      renderAll();
    });
  });

  list.addEventListener('click', async (event) => {
    const card = event.target.closest('[data-request-id]');
    if (!card) return;
    const id = card.dataset.requestId;
    if (event.target.closest('[data-detail]')) {
      selectedId = id;
      renderAll();
      return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    try {
      await updateRequest(id, action);
    } catch (error) {
      api.showToast(error.message || t('adminAccess.actionError', '요청 상태를 변경하지 못했습니다.'));
    }
  });

  $('refreshAccessRequestsButton')?.addEventListener('click', () => {
    load().catch((error) => api.showToast(error.message));
  });

  document.addEventListener('seiga:i18n-change', renderAll);

  load();
})();
