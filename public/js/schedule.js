(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const form = document.getElementById('scheduleForm');
  if (!api || !form) return;

  const me = await api.redirectIfUnauthorized();
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const days = [
    ['MON', '월'], ['TUE', '화'], ['WED', '수'], ['THU', '목'], ['FRI', '금'], ['SAT', '토'], ['SUN', '일']
  ];
  let items = [];

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function dayText(dayOfWeek) {
    return t(`common.day.${dayOfWeek}`, {}, dayOfWeek || '-');
  }

  function renderLoading() {
    $('scheduleWeekGrid').innerHTML = `<div class="day-card"><strong>${api.escapeHtml(t('common.loading', {}, '로딩'))}</strong><div class="schedule-event"><b>${api.escapeHtml(t('dashboard.statusLoading', {}, '불러오는 중'))}</b><span>${api.escapeHtml(t('schedule.loading', {}, '방송 일정을 불러오는 중입니다.'))}</span></div></div>`;
    $('upcomingList').innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(t('schedule.upcomingLoading', {}, '다가오는 일정을 불러오는 중입니다.'))}</strong></div></div>`;
  }

  function renderEmpty() {
    $('upcomingList').innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(t('profileCard.noSchedule', {}, '등록된 방송 일정이 없습니다.'))}</strong></div></div>`;
  }

  function renderError(error) {
    const message = error?.message || t('schedule.error', {}, '방송 일정을 불러오지 못했습니다.');
    $('scheduleWeekGrid').innerHTML = `<div class="day-card"><strong>${api.escapeHtml(t('common.error', {}, '오류'))}</strong><div class="schedule-event"><b>${api.escapeHtml(t('schedule.failed', {}, '실패'))}</b><span>${api.escapeHtml(message)}</span></div></div>`;
    $('upcomingList').innerHTML = `<div class="list-item"><div class="item-content"><strong>${api.escapeHtml(message)}</strong></div></div>`;
  }

  function activeItems() {
    return items.filter((item) => item.isActive && (item.startTime || item.title));
  }

  function render() {
    $('scheduleWeekGrid').innerHTML = days.map(([en, ko]) => {
      const item = items.find((entry) => entry.dayOfWeek === en);
      const active = item?.isActive && (item.startTime || item.title);
      return `<div class="day-card"><strong>${api.escapeHtml(dayText(en) || ko)}</strong><div class="schedule-event"><b>${api.escapeHtml(active ? (item.startTime || t('profileCard.timeUnknown', {}, '미정')) : t('profileCard.scheduleNoneShort', {}, '일정 없음'))}</b><span>${api.escapeHtml(active ? (item.title || t('streamerDetail.scheduleFallback', {}, '방송 일정')) : t('schedule.noDaySchedule', {}, '등록된 일정이 없습니다.'))}</span></div></div>`;
    }).join('');

    const upcoming = activeItems();
    if (!upcoming.length) {
      renderEmpty();
      return;
    }

    $('upcomingList').innerHTML = upcoming.map((item) => {
      const label = dayText(item.dayOfWeek);
      return `
        <div class="list-item">
          <div class="item-icon">${api.escapeHtml(label)}</div>
          <div class="item-content"><strong>${api.escapeHtml(item.startTime || t('profileCard.timeUnknown', {}, '미정'))}</strong><span>${api.escapeHtml(item.title || t('streamerDetail.scheduleFallback', {}, '방송 일정'))}</span></div>
        </div>
      `;
    }).join('');
  }

  async function load() {
    renderLoading();
    try {
      const data = await api.getJson('/api/schedule');
      items = data.items || [];
      render();
    } catch (error) {
      renderError(error);
    }
  }

  async function save() {
    const data = await api.putJson('/api/schedule', { items });
    items = data.items || items;
    render();
    api.showToast(t('schedule.saveDone', {}, '방송 일정이 저장되었습니다.'));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const dayOfWeek = $('scheduleDay').value;
    const next = {
      dayOfWeek,
      startTime: $('scheduleTime').value || null,
      title: $('scheduleTitle').value.trim() || null,
      isActive: Boolean($('scheduleTime').value || $('scheduleTitle').value.trim())
    };
    items = items.filter((item) => item.dayOfWeek !== dayOfWeek).concat(next);
    try {
      await save();
      form.reset();
    } catch (error) {
      api.showToast(error.message);
    }
  });

  $('saveScheduleButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    save().catch((error) => api.showToast(error.message));
  });

  $('copyScheduleButton')?.addEventListener('click', async () => {
    const text = activeItems()
      .map((item) => {
        const label = dayText(item.dayOfWeek);
        return `${label} ${item.startTime || t('profileCard.timeUnknown', {}, '미정')} ${item.title || ''}`.trim();
      })
      .join('\n');
    if (!text) {
      api.showToast(t('schedule.copyEmpty', {}, '복사할 방송 일정이 없습니다.'));
      return;
    }
    await navigator.clipboard.writeText(text);
    api.showToast(t('schedule.copyDone', {}, '방송 일정을 복사했습니다.'));
  });
  document.addEventListener('seiga:i18n-change', render);

  load();
})();
