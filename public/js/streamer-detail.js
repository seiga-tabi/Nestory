(async function () {
  const api = window.SeigaApi;
  if (!api || !document.querySelector('.profile-head')) return;

  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) {
    location.href = '404.html';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const dayLabel = { MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토', SUN: '일' };
  const designToUi = { CLEAN_WHITE: 'style-clean', SOFT_OVERLAY: 'style-soft', DARK_GLASS: 'style-dark' };

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function avatarMarkup(profile) {
    if (profile.avatarUrl) {
      return `<img src="${api.escapeHtml(profile.avatarUrl)}" alt="" />`;
    }
    return api.escapeHtml(Array.from(safeText(profile.name, '?'))[0] || '?');
  }

  function applyCardDesign(profile) {
    const card = $('detailProfileCard');
    if (!card) return;
    card.classList.remove('style-clean', 'style-soft', 'style-dark');
    card.classList.add(designToUi[profile.cardDesign] || 'style-dark');
  }

  function numberText(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  function activeSchedule(schedule = []) {
    return schedule.filter((item) => item?.isActive !== false && (item?.startTime || item?.title));
  }

  function firstStreamLink(links = []) {
    return links.find((link) => String(link.type || '').toUpperCase() === 'TWITCH') || links[0];
  }

  function renderLoading() {
    $('detailHeroName').textContent = '프로필을 불러오는 중입니다.';
    $('detailHeroSubtitle').textContent = '잠시만 기다려주세요.';
  }

  function renderEmpty(target, message, className = 'fan-item') {
    if (!target) return;
    target.innerHTML = `<div class="${className}"><div class="item-text"><strong>${api.escapeHtml(message)}</strong></div></div>`;
  }

  function renderError(error) {
    const message = error?.message || '프로필 데이터를 불러오지 못했습니다.';
    $('detailLiveBadge').innerHTML = '<span class="dot"></span>ERROR';
    $('detailHeroName').textContent = '프로필 데이터를 불러오지 못했습니다.';
    $('detailHeroSubtitle').textContent = message;
    $('detailCardName').textContent = '데이터 없음';
    $('detailSideName').textContent = '데이터 없음';
    renderEmpty($('detailFanList'), '프로필 데이터를 불러오지 못했습니다.');
    renderEmpty($('detailScheduleList'), '방송 일정을 불러오지 못했습니다.', 'schedule-item');
    renderEmpty($('detailLinkList'), '링크를 불러오지 못했습니다.', 'link-item');
  }

  function renderLinks(profile) {
    const links = profile.links || [];
    const chips = $('detailLinkChips');
    const list = $('detailLinkList');
    if (!links.length) {
      if (chips) chips.innerHTML = '<span class="detail-link-chip">등록된 링크가 없습니다</span>';
      if (list) list.innerHTML = '<div class="link-item"><div class="item-text"><strong>등록된 링크가 없습니다</strong></div></div>';
      return;
    }

    if (chips) {
      chips.innerHTML = links.map((link) => `
        <a class="detail-link-chip" href="${api.escapeHtml(link.url)}" target="_blank" rel="noopener">${api.escapeHtml(link.label || link.type || 'Link')}</a>
      `).join('');
    }
    if (list) {
      list.innerHTML = links.map((link) => `
        <a class="link-item" href="${api.escapeHtml(link.url)}" target="_blank" rel="noopener">
          <div class="item-icon">${api.escapeHtml(Array.from(link.type || link.label || 'L')[0] || 'L')}</div>
          <div class="item-text"><strong>${api.escapeHtml(link.label || link.type || 'Link')}</strong><span>${api.escapeHtml(link.url)}</span></div>
        </a>
      `).join('');
    }

    const twitch = firstStreamLink(links);
    if (twitch?.url) {
      const node = $('detailTwitchLink');
      node.hidden = false;
      node.href = twitch.url;
      node.textContent = `${twitch.label || twitch.type || 'Link'} 보기`;
    }
  }

  function renderFanCards(cards = []) {
    const list = $('detailFanList');
    if (!list) return;
    if (!cards.length) {
      renderEmpty(list, '아직 공개 팬 카드가 없습니다.');
      return;
    }
    list.innerHTML = cards.map((card) => `
      <div class="fan-item">
        <div class="item-icon">${api.escapeHtml(card.emoji || '💌')}</div>
        <div class="item-text">
          <strong>${api.escapeHtml(card.message || '내용 없는 팬 카드')}</strong>
          <span>${api.escapeHtml(card.senderName || '익명 팬')} · ${card.createdAt ? new Date(card.createdAt).toLocaleDateString('ko-KR') : '날짜 없음'}</span>
        </div>
      </div>
    `).join('');
  }

  function renderSchedule(schedule = []) {
    const list = $('detailScheduleList');
    if (!list) return;
    const items = activeSchedule(schedule);
    if (!items.length) {
      renderEmpty(list, '등록된 방송 일정이 없습니다.', 'schedule-item');
      return;
    }
    list.innerHTML = items.map((item) => `
      <div class="schedule-item">
        <div class="item-icon">${api.escapeHtml(dayLabel[item.dayOfWeek] || item.dayOfWeek || '-')}</div>
        <div class="item-text"><strong>${api.escapeHtml(item.startTime || '미정')}</strong><span>${api.escapeHtml(item.title || '방송 일정')}</span></div>
      </div>
    `).join('');
  }

  function render(profile) {
    const isLive = Boolean(profile.isLive);
    const name = safeText(profile.name, '이름 없는 스트리머');
    const handle = safeText(profile.handle, '핸들 없음');
    const subtitle = safeText(profile.subtitle, '소개가 등록되지 않았습니다.');
    const language = safeText(profile.language, '언어 미등록');
    const mainContent = safeText(profile.mainContent, '콘텐츠 미등록');
    const mainColor = profile.mainColor || '#7c3aed';
    const subColor = profile.subColor || '#f9a8d4';

    document.documentElement.style.setProperty('--primary', mainColor);
    document.documentElement.style.setProperty('--pink', subColor);
    $('detailProfileCard')?.style.setProperty('--card-main', mainColor);
    $('detailProfileCard')?.style.setProperty('--card-sub', subColor);
    applyCardDesign(profile);

    ['detailHeroAvatar', 'detailCardAvatar', 'detailSideAvatar'].forEach((id) => {
      const node = $(id);
      if (node) node.innerHTML = avatarMarkup(profile);
    });

    $('detailLiveBadge').innerHTML = `<span class="dot"></span>${isLive ? 'LIVE NOW' : 'OFFLINE'}`;
    $('detailHeroName').textContent = name;
    $('detailHeroSubtitle').textContent = subtitle;
    $('detailCardName').textContent = name;
    $('detailCardHandle').textContent = handle;
    $('detailCardSubtitle').textContent = subtitle;
    $('detailSideName').textContent = name;
    $('detailSideMeta').innerHTML = `${api.escapeHtml(language)} 방송<br />${api.escapeHtml(mainContent)}`;

    $('detailStatStatus').textContent = isLive ? 'LIVE' : 'OFFLINE';
    $('detailStatViewers').textContent = numberText(profile.viewerCount);
    $('detailStatStart').textContent = profile.streamStatus?.startedAt
      ? new Date(profile.streamStatus.startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : safeText(activeSchedule(profile.schedule)[0]?.startTime, '미정');
    $('detailStatLanguage').textContent = language;

    const writeHref = `fan-card-write.html?slug=${encodeURIComponent(profile.slug)}`;
    $('detailFanCardLink').href = writeHref;
    $('detailSideFanCardButton').onclick = () => { location.href = writeHref; };

    renderLinks(profile);
    renderFanCards(profile.fanCards || []);
    renderSchedule(profile.schedule || []);
  }

  function loginToast(event) {
    const target = event.target.closest('[data-login-required]');
    if (!target) return;
    event.preventDefault();
    const toast = document.getElementById('loginToast');
    toast?.classList.add('show');
    clearTimeout(window.__loginToastTimer);
    window.__loginToastTimer = setTimeout(() => toast?.classList.remove('show'), 2200);
  }

  document.addEventListener('click', loginToast);

  renderLoading();
  try {
    const profile = await api.getJson(`/api/public/streamers/${encodeURIComponent(slug)}`);
    render(profile);
  } catch (error) {
    renderError(error);
  }
})();
