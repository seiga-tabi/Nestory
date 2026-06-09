(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  if (!api || !document.querySelector('.hero-card')) return;

  const me = await api.redirectIfUnauthorized();
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let lastSummary = null;
  let lastError = null;
  let renderState = 'idle';

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function localeTag() {
    return window.SeigaI18n?.locale === 'ja' ? 'ja-JP' : 'ko-KR';
  }

  function numberText(value) {
    return Number(value || 0).toLocaleString(localeTag());
  }

  function translatedHtml(key, params = {}, fallback = key) {
    return api.escapeHtml(t(key, params, fallback));
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function renderListState(target, key, fallback) {
    if (!target) return;
    target.innerHTML = `<div class="list-item"><div class="item-content"><strong data-i18n="${api.escapeHtml(key)}">${translatedHtml(key, {}, fallback)}</strong></div></div>`;
  }

  function renderDashboardProfileCard(summary = {}, options = {}) {
    const slot = $('dashboardProfileCardSlot');
    const renderer = window.SeigaProfileCard;
    if (!slot || !renderer) return;

    const profile = summary?.profile || {};
    const streamStatus = summary?.streamStatus || {};
    const isLive = Boolean(streamStatus.isLive);
    const statusText = options.loading
      ? t('common.loading', {}, '불러오는 중')
      : (isLive ? 'LIVE' : 'OFF');
    const bio = options.error
      ? safeText(options.message, t('dashboard.error', {}, '대시보드 데이터를 불러오지 못했습니다.'))
      : safeText(streamStatus.title || profile.subtitle || profile.description, t('dashboard.streamFallback', {}, '최근 방송 상태를 기준으로 표시합니다.'));

    slot.innerHTML = renderer.renderProfileCard(profile, {
      className: `dashboard-preview-card${options.loading ? ' profile-card--skeleton' : ''}`,
      slug: profile.slug || '',
      name: safeText(profile.name || profile.displayName, options.loading ? t('common.loading', {}, '불러오는 중입니다.') : t('dashboard.previewProfileFallback', {}, '공개 프로필')),
      handle: safeText(profile.handle || profile.username, t('dashboard.previewMetaFallback', {}, '프로필 정보를 불러왔습니다.')),
      bio,
      imageUrl: profile.avatarUrl || profile.profileImage || profile.coverImage || '',
      verified: profile.isPublic !== false,
      isLive,
      tags: [profile.mainContent, profile.language].filter(Boolean),
      stats: [
        { icon: '♡', value: options.loading ? '-' : numberText(summary.todayViews), label: t('dashboard.todayVisitors', {}, '오늘 방문자'), format: false },
        { icon: '▣', value: options.loading ? '-' : numberText(summary.fanCardCount), label: t('profileCard.statFanCards', {}, '팬 카드'), format: false },
        { icon: '●', value: statusText, label: t('profileCard.statStatus', {}, '상태'), format: false }
      ],
      actions: [
        { label: t('dashboard.editProfileCard', {}, '프로필 카드 수정'), icon: '+', href: 'profile-card.html' }
      ]
    });
  }

  function renderLoading() {
    renderState = 'loading';
    lastError = null;
    $('dashboardError')?.setAttribute('hidden', '');
    $('todayViewsValue').textContent = '-';
    $('fanCardCountValue').textContent = '-';
    $('publicProfileStatusValue').textContent = '-';
    $('cardCompletionValue').textContent = '-';
    $('todayViewsNote').textContent = t('dashboard.loadingData', {}, '데이터를 불러오는 중입니다.');
    $('fanCardCountNote').textContent = t('dashboard.loadingData', {}, '데이터를 불러오는 중입니다.');
    $('publicProfileStatusNote').textContent = t('dashboard.loadingData', {}, '데이터를 불러오는 중입니다.');
    $('cardCompletionNote').textContent = t('dashboard.loadingData', {}, '데이터를 불러오는 중입니다.');
    $('dashboardHeroStatus').innerHTML = `<span class="dot"></span>${translatedHtml('dashboard.statusLoading', {}, 'LOADING')}`;
    $('dashboardHeroTitle').textContent = t('dashboard.heroLoadingTitle', {}, '대시보드 데이터를 불러오는 중입니다.');
    $('dashboardHeroText').textContent = t('dashboard.heroLoadingText', {}, '잠시만 기다려주세요.');
    renderDashboardProfileCard({}, { loading: true });
    $('recentActivityBadge').textContent = t('dashboard.statusLoading', {}, 'LOADING');
    renderListState($('recentActivityList'), 'dashboard.recentActivityLoading', '최근 활동을 불러오는 중입니다.');
    renderListState($('recentFanCardsList'), 'dashboard.fanCardsLoading', '팬 카드를 불러오는 중입니다.');
  }

  function renderEmpty() {
    renderListState($('recentActivityList'), 'dashboard.activityEmpty', '표시할 최근 활동이 없습니다.');
    renderListState($('recentFanCardsList'), 'dashboard.fanCardsEmpty', '아직 팬 카드가 없습니다.');
  }

  function renderError(error) {
    renderState = 'error';
    lastError = error;
    const message = error?.message || t('dashboard.error', {}, '대시보드 데이터를 불러오지 못했습니다.');
    const errorBox = $('dashboardError');
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = message;
    }
    $('dashboardHeroStatus').innerHTML = `<span class="dot"></span>${translatedHtml('dashboard.statusError', {}, 'ERROR')}`;
    $('dashboardHeroTitle').textContent = t('dashboard.error', {}, '대시보드 데이터를 불러오지 못했습니다.');
    $('dashboardHeroText').textContent = message;
    renderDashboardProfileCard({}, { error: true, message });
    renderListState($('recentActivityList'), 'dashboard.error', '대시보드 데이터를 불러오지 못했습니다.');
    renderListState($('recentFanCardsList'), 'dashboard.fanCardsError', '팬 카드 데이터를 불러오지 못했습니다.');
  }

  function renderRecentFanCards(items = []) {
    const list = $('recentFanCardsList');
    if (!list) return;
    if (!items.length) {
      renderListState(list, 'dashboard.fanCardsEmpty', '아직 팬 카드가 없습니다.');
      return;
    }
    list.innerHTML = items.map((card) => `
      <div class="list-item">
        <div class="item-icon">${api.escapeHtml(card.emoji || '💌')}</div>
        <div class="item-content">
          <strong>${api.escapeHtml(card.message || t('dashboard.fanCardNoMessage', {}, '내용 없는 팬 카드'))}</strong>
          <span>${api.escapeHtml(card.senderName || t('dashboard.anonymousFan', {}, '익명 팬'))} · ${api.escapeHtml(card.status || t('dashboard.noStatus', {}, '상태 없음'))}</span>
        </div>
      </div>
    `).join('');
  }

  function renderRecentActivity(items = []) {
    const list = $('recentActivityList');
    if (!list) return;
    $('recentActivityBadge').textContent = t('dashboard.countItems', { count: numberText(items.length) }, `${items.length}개`);
    if (!items.length) {
      renderListState(list, 'dashboard.activityEmpty', '표시할 최근 활동이 없습니다.');
      return;
    }
    list.innerHTML = items.map((item) => `
      <div class="list-item">
        <div class="item-icon">•</div>
        <div class="item-content">
          <strong>${api.escapeHtml(item.label || t('dashboard.activityFallback', {}, '활동'))}</strong>
          <span>${api.escapeHtml(item.value || '')}</span>
        </div>
      </div>
    `).join('');
  }

  function render(summary) {
    renderState = 'summary';
    lastSummary = summary;
    lastError = null;
    $('dashboardError')?.setAttribute('hidden', '');

    $('todayViewsValue').textContent = numberText(summary.todayViews);
    $('fanCardCountValue').textContent = numberText(summary.fanCardCount);
    $('publicProfileStatusValue').textContent = summary.publicProfileStatus || t('dashboard.unknownStatus', {}, 'UNKNOWN');
    $('cardCompletionValue').textContent = `${Number(summary.cardCompletion || 0)}%`;
    $('todayViewsNote').textContent = t('dashboard.todayViewsNote', {}, '오늘 DB 집계 기준');
    $('fanCardCountNote').textContent = t('dashboard.fanCardCountNote', {}, '전체 팬 카드 기준');
    $('publicProfileStatusNote').textContent = t('dashboard.publicProfileStatusNote', {}, '공개 프로필 상태');
    $('cardCompletionNote').textContent = t('dashboard.cardCompletionNote', {}, '링크, 일정, 이미지 기준');

    const isLive = Boolean(summary.streamStatus?.isLive);
    $('dashboardHeroStatus').className = `pill ${isLive ? 'live' : 'warn'}`;
    $('dashboardHeroStatus').innerHTML = `<span class="dot"></span>${translatedHtml(isLive ? 'common.live' : 'common.offline', {}, isLive ? 'LIVE' : 'OFFLINE')}`;
    $('dashboardHeroTitle').textContent = isLive
      ? t('dashboard.heroLiveTitle', {}, '현재 방송 중입니다.')
      : t('dashboard.heroOfflineTitle', {}, '현재 방송은 오프라인입니다.');
    $('dashboardHeroText').textContent = summary.streamStatus?.title || t('dashboard.streamFallback', {}, '최근 방송 상태를 기준으로 표시합니다.');
    renderDashboardProfileCard(summary);

    renderRecentFanCards(summary.recentFanCards || []);
    renderRecentActivity(summary.recentActivity || []);
    if (!(summary.recentFanCards || []).length && !(summary.recentActivity || []).length) renderEmpty();
  }

  async function loadSummary(showDone = false) {
    renderLoading();
    try {
      const summary = await api.getJson('/api/dashboard/summary');
      render(summary);
      if (showDone) api.showToast(t('dashboard.refreshDone', {}, '대시보드 데이터를 새로고침했습니다.'));
    } catch (error) {
      renderError(error);
    }
  }

  function downloadDashboardJson() {
    const blob = new Blob([JSON.stringify(lastSummary || {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'dashboard-summary.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  $('refreshDashboardButton')?.addEventListener('click', () => loadSummary(true));
  $('prepareBroadcastButton')?.addEventListener('click', () => { location.href = 'profile-card.html'; });
  $('downloadDashboardJsonButton')?.addEventListener('click', downloadDashboardJson);

  document.addEventListener('seiga:i18n-change', () => {
    if (renderState === 'summary' && lastSummary) {
      render(lastSummary);
    } else if (renderState === 'error') {
      renderError(lastError);
    } else if (renderState === 'loading') {
      renderLoading();
    }
  });

  loadSummary();
})();
