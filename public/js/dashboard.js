(async function () {
  const api = window.SeigaApi;
  if (!api || !document.querySelector('.hero-card')) return;

  const me = await api.redirectIfUnauthorized();
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let lastSummary = null;

  function numberText(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  function renderListState(target, message) {
    if (!target) return;
    target.innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(message)}</strong></div></div>`;
  }

  function renderLoading() {
    $('dashboardError')?.setAttribute('hidden', '');
    $('todayViewsValue').textContent = '-';
    $('fanCardCountValue').textContent = '-';
    $('publicProfileStatusValue').textContent = '-';
    $('cardCompletionValue').textContent = '-';
    $('todayViewsNote').textContent = '데이터를 불러오는 중입니다.';
    $('fanCardCountNote').textContent = '데이터를 불러오는 중입니다.';
    $('publicProfileStatusNote').textContent = '데이터를 불러오는 중입니다.';
    $('cardCompletionNote').textContent = '데이터를 불러오는 중입니다.';
    $('dashboardHeroStatus').innerHTML = '<span class="dot"></span>LOADING';
    $('dashboardHeroTitle').textContent = '대시보드 데이터를 불러오는 중입니다.';
    $('dashboardHeroText').textContent = '잠시만 기다려주세요.';
    $('dashboardPreviewTitle').textContent = '방송 상태';
    $('dashboardPreviewMeta').textContent = '데이터를 불러오는 중입니다.';
    $('recentActivityBadge').textContent = 'LOADING';
    renderListState($('recentActivityList'), '최근 활동을 불러오는 중입니다.');
    renderListState($('recentFanCardsList'), '팬 카드를 불러오는 중입니다.');
  }

  function renderEmpty() {
    renderListState($('recentActivityList'), '표시할 최근 활동이 없습니다.');
    renderListState($('recentFanCardsList'), '아직 팬 카드가 없습니다.');
  }

  function renderError(error) {
    const message = error?.message || '대시보드 데이터를 불러오지 못했습니다.';
    const errorBox = $('dashboardError');
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = message;
    }
    $('dashboardHeroStatus').innerHTML = '<span class="dot"></span>ERROR';
    $('dashboardHeroTitle').textContent = '대시보드 데이터를 불러오지 못했습니다.';
    $('dashboardHeroText').textContent = message;
    renderListState($('recentActivityList'), '대시보드 데이터를 불러오지 못했습니다.');
    renderListState($('recentFanCardsList'), '팬 카드 데이터를 불러오지 못했습니다.');
  }

  function renderRecentFanCards(items = []) {
    const list = $('recentFanCardsList');
    if (!list) return;
    if (!items.length) {
      renderListState(list, '아직 팬 카드가 없습니다.');
      return;
    }
    list.innerHTML = items.map((card) => `
      <div class="list-item">
        <div class="item-icon">${api.escapeHtml(card.emoji || '💌')}</div>
        <div class="item-content">
          <strong>${api.escapeHtml(card.message || '내용 없는 팬 카드')}</strong>
          <span>${api.escapeHtml(card.senderName || '익명 팬')} · ${api.escapeHtml(card.status || '상태 없음')}</span>
        </div>
      </div>
    `).join('');
  }

  function renderRecentActivity(items = []) {
    const list = $('recentActivityList');
    if (!list) return;
    $('recentActivityBadge').textContent = `${items.length}개`;
    if (!items.length) {
      renderListState(list, '표시할 최근 활동이 없습니다.');
      return;
    }
    list.innerHTML = items.map((item) => `
      <div class="list-item">
        <div class="item-icon">•</div>
        <div class="item-content">
          <strong>${api.escapeHtml(item.label || '활동')}</strong>
          <span>${api.escapeHtml(item.value || '')}</span>
        </div>
      </div>
    `).join('');
  }

  function render(summary) {
    lastSummary = summary;
    $('dashboardError')?.setAttribute('hidden', '');

    $('todayViewsValue').textContent = numberText(summary.todayViews);
    $('fanCardCountValue').textContent = numberText(summary.fanCardCount);
    $('publicProfileStatusValue').textContent = summary.publicProfileStatus || 'UNKNOWN';
    $('cardCompletionValue').textContent = `${Number(summary.cardCompletion || 0)}%`;
    $('todayViewsNote').textContent = '오늘 DB 집계 기준';
    $('fanCardCountNote').textContent = '전체 팬 카드 기준';
    $('publicProfileStatusNote').textContent = '공개 프로필 상태';
    $('cardCompletionNote').textContent = '링크, 일정, 이미지 기준';

    const isLive = Boolean(summary.streamStatus?.isLive);
    $('dashboardHeroStatus').className = `pill ${isLive ? 'live' : 'warn'}`;
    $('dashboardHeroStatus').innerHTML = `<span class="dot"></span>${isLive ? 'LIVE' : 'OFFLINE'}`;
    $('dashboardHeroTitle').textContent = isLive ? '현재 방송 중입니다.' : '현재 방송은 오프라인입니다.';
    $('dashboardHeroText').textContent = summary.streamStatus?.title || '최근 방송 상태를 기준으로 표시합니다.';
    $('dashboardPreviewTitle').textContent = summary.profile?.name || '공개 프로필';
    $('dashboardPreviewMeta').textContent = summary.profile?.handle || '프로필 정보를 불러왔습니다.';

    renderRecentFanCards(summary.recentFanCards || []);
    renderRecentActivity(summary.recentActivity || []);
    if (!(summary.recentFanCards || []).length && !(summary.recentActivity || []).length) renderEmpty();
  }

  async function loadSummary(showDone = false) {
    renderLoading();
    try {
      const summary = await api.getJson('/api/dashboard/summary');
      render(summary);
      if (showDone) api.showToast('대시보드 데이터를 새로고침했습니다.');
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

  loadSummary();
})();
