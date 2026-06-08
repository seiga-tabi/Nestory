(async function () {
  await window.SeigaI18nReady;

  const api = window.SeigaApi;
  const list = document.getElementById('rankingsList');
  if (!api || !list || !location.pathname.endsWith('rankings.html')) return;

  const emptyState = document.getElementById('rankingsEmptyState');
  const errorState = document.getElementById('rankingsErrorState');
  const metrics = document.getElementById('rankingMetrics');
  let lastItems = [];

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function avatar(profile) {
    if (profile.avatarUrl) {
      return `<img src="${api.escapeHtml(profile.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
    }
    return api.escapeHtml(Array.from(profile.name || '?')[0] || '?');
  }

  function renderLoading() {
    emptyState.hidden = true;
    errorState.hidden = true;
    list.hidden = false;
    list.innerHTML = `<div class="liquid-card rank-card"><div class="rank-info"><strong>${t('rankings.loading', {}, '랭킹 데이터를 불러오는 중입니다.')}</strong></div></div>`;
    renderMetricsLoading();
  }

  function renderEmpty() {
    list.hidden = true;
    list.innerHTML = '';
    emptyState.hidden = false;
    errorState.hidden = true;
    renderMetrics([]);
  }

  function renderError(error) {
    list.hidden = true;
    list.innerHTML = '';
    emptyState.hidden = true;
    errorState.hidden = false;
    errorState.textContent = error?.message || t('rankings.error', {}, '랭킹 데이터를 불러오지 못했습니다.');
    if (metrics) {
      metrics.innerHTML = `<div class="liquid-card feature-card"><div class="feature-icon">!</div><h3>${t('common.error', {}, '오류')}</h3><p>${t('rankings.metricsError', {}, '랭킹 지표를 불러오지 못했습니다.')}</p></div>`;
    }
  }

  function metricCard(icon, title, value, note) {
    return `
      <div class="liquid-card feature-card">
        <div class="feature-icon">${api.escapeHtml(icon)}</div>
        <h3>${api.escapeHtml(value)}</h3>
        <p><strong>${api.escapeHtml(title)}</strong><br />${api.escapeHtml(note)}</p>
      </div>
    `;
  }

  function renderMetricsLoading() {
    if (!metrics) return;
    metrics.innerHTML = `<div class="liquid-card feature-card"><div class="feature-icon">…</div><h3>${t('common.loading', {}, '불러오는 중')}</h3><p>${t('rankings.loading', {}, '랭킹 데이터를 불러오는 중입니다.')}</p></div>`;
  }

  function renderMetrics(items = []) {
    if (!metrics) return;
    if (!items.length) {
      metrics.innerHTML = `<div class="liquid-card feature-card"><div class="feature-icon">0</div><h3>${t('common.noData', {}, '데이터 없음')}</h3><p>${t('rankings.metricsEmpty', {}, '랭킹 지표로 계산할 공개 프로필이 없습니다.')}</p></div>`;
      return;
    }

    const liveCount = items.filter((profile) => profile.isLive).length;
    const fanCardTotal = items.reduce((sum, profile) => sum + Number(profile.fanCardCount || 0), 0);
    const viewTotal = items.reduce((sum, profile) => sum + Number(profile.viewCount || 0), 0);
    const linkTotal = items.reduce((sum, profile) => sum + (profile.links || []).length, 0);

    metrics.innerHTML = [
      metricCard('LIVE', t('rankings.liveStreamers', {}, '라이브 스트리머'), t('rankings.peopleCount', { count: liveCount.toLocaleString('ko-KR') }, `${liveCount.toLocaleString('ko-KR')}명`), t('rankings.liveStreamersNote', {}, '현재 공개 랭킹 응답 기준')),
      metricCard('💌', t('rankings.publicFanCards', {}, '공개 팬 카드'), t('rankings.cardCount', { count: fanCardTotal.toLocaleString('ko-KR') }, `${fanCardTotal.toLocaleString('ko-KR')}개`), t('rankings.publicFanCardsNote', {}, '승인된 공개 팬 카드 합계')),
      metricCard('👀', t('rankings.profileViews', {}, '프로필 방문'), t('rankings.viewCount', { count: viewTotal.toLocaleString('ko-KR') }, `${viewTotal.toLocaleString('ko-KR')}회`), t('rankings.profileViewsNote', {}, '공개 프로필 방문 로그 합계')),
      metricCard('🔗', t('rankings.registeredLinks', {}, '등록 링크'), t('rankings.linkCount', { count: linkTotal.toLocaleString('ko-KR') }, `${linkTotal.toLocaleString('ko-KR')}개`), t('rankings.registeredLinksNote', {}, '공개 프로필에 표시되는 링크 합계'))
    ].join('');
  }

  function render(items = []) {
    if (!items.length) {
      renderEmpty();
      return;
    }
    list.hidden = false;
    emptyState.hidden = true;
    errorState.hidden = true;
    lastItems = items;
    list.innerHTML = items.slice(0, 10).map((profile, index) => `
      <div class="liquid-card rank-card" data-profile-slug="${api.escapeHtml(profile.slug || '')}">
        <div class="rank-no">${profile.rank || index + 1}</div>
        <div class="rank-avatar">${avatar(profile)}</div>
        <div class="rank-info"><strong>${api.escapeHtml(profile.name || t('index.noName', {}, '이름 없는 스트리머'))}</strong><span>${api.escapeHtml([profile.handle, profile.mainContent, profile.language].filter(Boolean).join(' · ') || t('rankings.noProfileInfo', {}, '프로필 정보 없음'))}</span></div>
        <span class="live-pill ${profile.isLive ? '' : 'off'}"><span class="dot"></span>${profile.isLive ? t('common.live', {}, 'LIVE') : t('common.offline', {}, 'OFF')}</span>
      </div>
    `).join('');
    renderMetrics(items);
  }

  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-profile-slug]');
    if (item?.dataset.profileSlug) {
      location.href = `streamer-detail.html?slug=${encodeURIComponent(item.dataset.profileSlug)}`;
    }
  });

  renderLoading();
  try {
    const data = await api.getJson('/api/public/rankings');
    render(data.items || []);
  } catch (error) {
    renderError(error);
  }

  document.addEventListener('seiga:i18n-change', () => {
    if (lastItems.length) render(lastItems);
  });
})();
