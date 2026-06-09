(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  if (!api || !document.querySelector('.analytics-layout')) return;

  const me = await api.redirectIfUnauthorized();
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let latest = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function numberText(value) {
    return window.SeigaI18n?.number?.(value) || Number(value || 0).toLocaleString('ko-KR');
  }

  function percent(value) {
    return `${Math.max(0, Math.round(Number(value || 0)))}%`;
  }

  function listMessage(target, message) {
    if (!target) return;
    target.innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(message)}</strong></div></div>`;
  }

  function renderLoading(range) {
    $('analyticsError')?.setAttribute('hidden', '');
    $('analyticsRangeBadge').textContent = range === '30d'
      ? t('analytics.range30d', {}, '30일')
      : t('analytics.range7d', {}, '7일');
    $('averageViewersValue').textContent = '-';
    $('weeklyViewsValue').textContent = '-';
    $('profileClickRateValue').textContent = '-';
    $('fanCardConversionValue').textContent = '-';
    listMessage($('analyticsChart'), t('analytics.chartLoading', {}, '차트 데이터를 불러오는 중입니다.'));
    listMessage($('fanCardStatusList'), t('analytics.fanCardStatsLoading', {}, '팬 카드 통계를 불러오는 중입니다.'));
    listMessage($('streamSnapshotList'), t('analytics.snapshotLoading', {}, '방송 스냅샷을 불러오는 중입니다.'));
    listMessage($('analyticsNotesList'), t('analytics.loading', {}, '통계 데이터를 불러오는 중입니다.'));
  }

  function renderError(error) {
    const message = error?.message || t('analytics.error', {}, '통계 데이터를 불러오지 못했습니다.');
    const box = $('analyticsError');
    if (box) {
      box.hidden = false;
      box.textContent = message;
    }
    listMessage($('analyticsChart'), t('analytics.chartError', {}, '차트 데이터를 불러오지 못했습니다.'));
    listMessage($('fanCardStatusList'), t('analytics.fanCardStatsError', {}, '팬 카드 통계를 불러오지 못했습니다.'));
    listMessage($('streamSnapshotList'), t('analytics.snapshotError', {}, '방송 스냅샷을 불러오지 못했습니다.'));
    listMessage($('analyticsNotesList'), t('analytics.error', {}, '통계 데이터를 불러오지 못했습니다.'));
  }

  function renderBars(items = []) {
    const chart = $('analyticsChart');
    if (!chart) return;
    if (!items.length) {
      listMessage(chart, t('analytics.noVisitData', {}, '선택한 기간의 방문 데이터가 없습니다.'));
      return;
    }
    const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
    chart.innerHTML = items.map((item) => {
      const label = new Date(item.date).toLocaleDateString(window.SeigaI18n?.localeTag?.() || 'ko-KR', { weekday: 'short' });
      const height = Math.max(8, Math.round((Number(item.value || 0) / max) * 94));
      return `<div class="bar" style="height:${height}%"><span>${api.escapeHtml(label)}</span></div>`;
    }).join('');
  }

  function renderFanCardStats(items = []) {
    const target = $('fanCardStatusList');
    if (!target) return;
    if (!items.length) {
      listMessage(target, t('analytics.noFanCardStats', {}, '팬 카드 통계 데이터가 없습니다.'));
      return;
    }
    const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0) || 1;
    target.innerHTML = items.map((item) => {
      const width = Math.round((Number(item.count || 0) / total) * 100);
      return `
        <div class="game-row">
          <div class="row-head"><span>${api.escapeHtml(item.status || 'UNKNOWN')}</span><span>${numberText(item.count)}</span></div>
          <div class="progress"><span style="width:${width}%"></span></div>
        </div>
      `;
    }).join('');
  }

  function renderStreamSnapshots(streams) {
    const target = $('streamSnapshotList');
    if (!target) return;
    const snapshots = streams.snapshots || [];
    if (!snapshots.length) {
      listMessage(target, t('analytics.noSnapshots', {}, '방송 스냅샷 데이터가 없습니다.'));
      return;
    }
    const liveCount = snapshots.filter((item) => item.isLive).length;
    const averageViewers = Math.round(
      snapshots.reduce((sum, item) => sum + Number(item.viewerCount || 0), 0) / snapshots.length
    );
    target.innerHTML = `
      <div class="list-item"><div class="item-icon">LIVE</div><div class="item-content"><strong>${api.escapeHtml(t('analytics.liveSnapshotCount', { count: numberText(liveCount) }, `${numberText(liveCount)}개 라이브 스냅샷`))}</strong><span>${api.escapeHtml(t('analytics.selectedRangeNote', {}, '선택 기간 기준'))}</span></div></div>
      <div class="list-item"><div class="item-icon">AVG</div><div class="item-content"><strong>${api.escapeHtml(t('analytics.viewerCount', { count: numberText(averageViewers) }, `${numberText(averageViewers)}명`))}</strong><span>${api.escapeHtml(t('analytics.averageViewersNote', {}, '스냅샷 평균 시청자'))}</span></div></div>
      <div class="list-item"><div class="item-icon">LOG</div><div class="item-content"><strong>${api.escapeHtml(t('analytics.snapshotCollectedCount', { count: numberText(snapshots.length) }, `${numberText(snapshots.length)}개 수집`))}</strong><span>${api.escapeHtml(t('analytics.totalSnapshotsNote', {}, '전체 스냅샷 수'))}</span></div></div>
    `;
  }

  function ruleNotes(summary, views, streams) {
    const notes = [];
    const viewTotal = (views.items || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
    if (Number(summary.fanCardCount || 0) === 0) notes.push(t('analytics.noteShareFanCardLink', {}, '팬 카드 작성 링크를 공유해보세요.'));
    if (viewTotal === 0) notes.push(t('analytics.notePinPublicLink', {}, '공개 프로필 링크를 Twitch/X에 고정해보세요.'));
    if (Number(summary.averageViewers || 0) === 0) notes.push(t('analytics.noteCheckTwitch', {}, 'Twitch 연동 또는 방송 스냅샷 수집 상태를 확인하세요.'));
    if ((streams.snapshots || []).length === 0) notes.push(t('analytics.noteCheckSnapshots', {}, '방송 스냅샷이 수집되는지 확인해보세요.'));
    if (!notes.length) notes.push(t('analytics.noteNoAction', {}, '현재 수집된 데이터 기준으로 즉시 조치가 필요한 항목은 없습니다.'));
    return notes;
  }

  function renderNotes(notes = []) {
    const target = $('analyticsNotesList');
    if (!target) return;
    target.innerHTML = notes.map((note) => `
      <div class="list-item">
        <div class="item-icon">•</div>
        <div class="item-content"><strong>${api.escapeHtml(note)}</strong></div>
      </div>
    `).join('');
  }

  function render({ range, summary, views, fanCards, streams }) {
    latest = { range, summary, views, fanCards, streams };
    $('analyticsError')?.setAttribute('hidden', '');
    const selectedViews = (views.items || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
    const todayRatio = summary.totalViews ? (Number(summary.todayViews || 0) / Number(summary.totalViews)) * 100 : 0;
    const fanRatio = summary.totalViews ? (Number(summary.fanCardCount || 0) / Number(summary.totalViews)) * 100 : 0;

    $('averageViewersValue').textContent = numberText(summary.averageViewers);
    $('weeklyViewsValue').textContent = numberText(selectedViews || summary.weeklyViews);
    $('profileClickRateValue').textContent = percent(todayRatio);
    $('fanCardConversionValue').textContent = percent(fanRatio);
    $('trafficSourcePanel').innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(t('analytics.noTrafficSource', {}, '유입 경로 데이터는 아직 수집되지 않았습니다.'))}</strong></div></div>`;

    renderBars(views.items || []);
    renderFanCardStats(fanCards.items || []);
    renderStreamSnapshots(streams);
    renderNotes(ruleNotes(summary, views, streams));
  }

  async function load(range = '7d') {
    renderLoading(range);
    try {
      const [summary, views, fanCards, streams] = await Promise.all([
        api.getJson('/api/analytics/summary'),
        api.getJson('/api/analytics/views', { range }),
        api.getJson('/api/analytics/fan-cards'),
        api.getJson('/api/analytics/streams', { range })
      ]);
      render({ range, summary, views, fanCards, streams });
      return true;
    } catch (error) {
      renderError(error);
      return false;
    }
  }

  function exportReport() {
    const blob = new Blob([JSON.stringify(latest || {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `analytics-${latest?.range || 'report'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  document.querySelectorAll('[data-analytics-range]').forEach((button) => {
    button.addEventListener('click', () => {
      load(button.dataset.analyticsRange).then((ok) => {
        if (ok) api.showToast(t('analytics.loadDone', {}, '통계 데이터를 불러왔습니다.'));
      });
    });
  });
  $('exportAnalyticsButton')?.addEventListener('click', exportReport);
  document.addEventListener('seiga:i18n-change', () => {
    if (latest) render(latest);
  });

  load('7d');
})();
