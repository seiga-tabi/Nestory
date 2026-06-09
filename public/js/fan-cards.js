(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const list = document.getElementById('fanCardsList');
  if (!api || !list) return;

  const me = await api.redirectIfUnauthorized();
  if (!me) return;

  const statusMap = { all: '', pending: 'PENDING', approved: 'APPROVED', hidden: 'HIDDEN' };
  const $ = (id) => document.getElementById(id);
  let active = 'all';
  let lastItems = [];
  let allItems = [];
  let lastRenderState = 'loading';

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function numberText(value) {
    return window.SeigaI18n?.number?.(value) || Number(value || 0).toLocaleString('ko-KR');
  }

  function statusPill(status) {
    if (status === 'APPROVED') return 'ok';
    if (status === 'PENDING') return 'live';
    return 'warn';
  }

  function renderLoading() {
    lastRenderState = 'loading';
    list.innerHTML = `<article class="fan-card"><p class="fan-message" data-i18n="fanCards.loadingData">${api.escapeHtml(t('fanCards.loadingData', {}, '팬 카드 데이터를 불러오는 중입니다.'))}</p></article>`;
    $('fanCount').textContent = t('fanCards.loading', {}, '팬 카드를 불러오는 중입니다.');
    renderReadQueue([]);
  }

  function renderEmpty() {
    lastRenderState = 'empty';
    list.innerHTML = `<article class="fan-card"><p class="fan-message" data-i18n="fanCards.empty">${api.escapeHtml(t('fanCards.empty', {}, '표시할 팬 카드가 없습니다.'))}</p></article>`;
    $('fanCount').textContent = t('fanCards.empty', {}, '표시할 팬 카드가 없습니다.');
  }

  function renderError(error) {
    lastRenderState = 'error';
    list.innerHTML = `<article class="fan-card"><p class="fan-message">${api.escapeHtml(error?.message || t('fanCards.error', {}, '팬 카드 데이터를 불러오지 못했습니다.'))}</p></article>`;
    $('fanCount').textContent = t('fanCards.error', {}, '팬 카드 데이터를 불러오지 못했습니다.');
    renderReadQueue([]);
  }

  function renderCounts(counts = {}, total = 0) {
    $('fanStatAll').textContent = numberText(counts.all ?? total);
    $('fanStatPending').textContent = numberText(counts.pending);
    $('fanStatApproved').textContent = numberText(counts.approved);
    $('fanStatHidden').textContent = numberText(counts.hidden);
  }

  function renderCard(item) {
    const status = item.status || 'PENDING';
    const date = item.createdAt ? new Date(item.createdAt).toLocaleString(window.SeigaI18n?.localeTag?.() || 'ko-KR') : t('adminAccess.noDate', {}, '날짜 없음');
    return `
      <article class="fan-card" data-fan-id="${api.escapeHtml(item.id)}" data-fan-status="${api.escapeHtml(status)}">
        <div class="fan-card-head">
          <div class="fan-author">
            <div class="fan-avatar">${api.escapeHtml(Array.from(item.senderName || t('fanCards.anonymousShort', {}, '익명'))[0] || '?')}</div>
            <div><strong>${api.escapeHtml(item.senderName || t('dashboard.anonymousFan', {}, '익명 팬'))}</strong><span>${api.escapeHtml(date)} · ${api.escapeHtml(status)}</span></div>
          </div>
          <span class="pill ${statusPill(status)}">${api.escapeHtml(status)}</span>
        </div>
        <p class="fan-message">${api.escapeHtml(item.message || t('dashboard.fanCardNoMessage', {}, '내용 없는 팬 카드'))}</p>
        <div class="fan-actions">
          ${status !== 'APPROVED' ? `<button class="ghost-btn" data-status="APPROVED">${api.escapeHtml(t('fanCards.actionApprove', {}, '공개'))}</button>` : ''}
          ${status !== 'HIDDEN' ? `<button class="ghost-btn" data-status="HIDDEN">${api.escapeHtml(t('fanCards.actionHide', {}, '숨김'))}</button>` : ''}
          ${status !== 'PENDING' ? `<button class="ghost-btn" data-status="PENDING">${api.escapeHtml(t('fanCards.actionMovePending', {}, '신규로 이동'))}</button>` : ''}
          <button class="danger-btn" data-delete>${api.escapeHtml(t('common.delete', {}, '삭제'))}</button>
        </div>
      </article>
    `;
  }

  function renderReadQueue(items = []) {
    const queue = $('fanReadQueue');
    const badge = $('fanReadQueueBadge');
    if (!queue) return;
    const approved = items.filter((item) => item.status === 'APPROVED').slice(0, 5);
    if (badge) badge.textContent = t('dashboard.countItems', { count: numberText(approved.length) }, `${approved.length}개`);
    if (!approved.length) {
      queue.innerHTML = `<div class="list-item"><div class="item-content"><strong data-i18n="fanCards.readQueueEmpty">${api.escapeHtml(t('fanCards.readQueueEmpty', {}, '공개 승인된 팬 카드가 없습니다.'))}</strong></div></div>`;
      return;
    }
    queue.innerHTML = approved.map((item) => `
      <div class="list-item">
        <div class="item-icon">${api.escapeHtml(item.emoji || '💌')}</div>
        <div class="item-content">
          <strong>${api.escapeHtml(item.message || t('dashboard.fanCardNoMessage', {}, '내용 없는 팬 카드'))}</strong>
          <span>${api.escapeHtml(item.senderName || t('dashboard.anonymousFan', {}, '익명 팬'))}</span>
        </div>
      </div>
    `).join('');
  }

  function render(data, allData) {
    lastItems = data.items || [];
    allItems = allData.items || lastItems;
    lastRenderState = lastItems.length ? 'items' : 'empty';
    renderCounts(data.counts, data.total);
    $('fanCount').textContent = t('fanCards.count', { total: numberText(data.total), count: numberText(lastItems.length) }, `${numberText(data.total)}개의 팬 카드 중 ${numberText(lastItems.length)}개를 표시 중입니다.`);
    if (!lastItems.length) renderEmpty();
    else list.innerHTML = lastItems.map(renderCard).join('');
    renderReadQueue(allItems);
  }

  async function load() {
    renderLoading();
    try {
      const status = statusMap[active];
      const currentPromise = api.getJson('/api/fan-cards', status ? { status } : {});
      const allPromise = status ? api.getJson('/api/fan-cards') : currentPromise;
      const [currentData, allData] = await Promise.all([currentPromise, allPromise]);
      render(currentData, allData);
    } catch (error) {
      renderError(error);
    }
  }

  async function approveAllPending() {
    const pending = allItems.filter((item) => item.status === 'PENDING');
    await Promise.all(pending.map((item) => api.patchJson(`/api/fan-cards/${item.id}`, { status: 'APPROVED' })));
    await load();
    api.showToast(t('fanCards.approveAllDone', { count: numberText(pending.length) }, `${pending.length}개의 신규 팬 카드를 공개 처리했습니다.`));
  }

  async function copyWriteLink() {
    const mePayload = await api.getJson('/api/auth/me');
    const slug = mePayload.streamerProfile?.slug || '';
    if (!slug) {
      api.showToast(t('fanCards.noSlug', {}, '공개 프로필 slug가 없습니다.'));
      return;
    }
    const link = `${location.origin}/fan-card-write.html?slug=${encodeURIComponent(slug)}`;
    await navigator.clipboard.writeText(link);
    api.showToast(t('fanCards.copyDone', {}, '팬 카드 작성 링크를 복사했습니다.'));
  }

  document.querySelectorAll('[data-fan-filter]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-fan-filter]').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      active = tab.dataset.fanFilter;
      load();
    });
  });

  list.addEventListener('click', async (event) => {
    const article = event.target.closest('[data-fan-id]');
    if (!article) return;
    try {
      if (event.target.closest('[data-delete]')) {
        await api.deleteJson(`/api/fan-cards/${article.dataset.fanId}`);
        api.showToast(t('fanCards.deleteDone', {}, '팬 카드를 삭제했습니다.'));
      }
      const status = event.target.closest('[data-status]')?.dataset.status;
      if (status) {
        await api.patchJson(`/api/fan-cards/${article.dataset.fanId}`, { status });
        api.showToast(t('fanCards.statusChanged', {}, '팬 카드 상태가 변경되었습니다.'));
      }
      await load();
    } catch (error) {
      api.showToast(error.message);
    }
  });

  $('approvePendingButton')?.addEventListener('click', () => {
    approveAllPending().catch((error) => api.showToast(error.message));
  });
  $('copyFanCardLinkButton')?.addEventListener('click', () => {
    copyWriteLink().catch((error) => api.showToast(error.message));
  });

  document.addEventListener('seiga:i18n-change', () => {
    if (allItems.length || lastItems.length) render({ items: lastItems, total: allItems.length || lastItems.length, counts: {
      all: allItems.length || lastItems.length,
      pending: allItems.filter((item) => item.status === 'PENDING').length,
      approved: allItems.filter((item) => item.status === 'APPROVED').length,
      hidden: allItems.filter((item) => item.status === 'HIDDEN').length
    } }, { items: allItems });
    else if (lastRenderState === 'empty') renderEmpty();
    else if (lastRenderState === 'error') renderError();
    else renderLoading();
  });

  load();
})();
