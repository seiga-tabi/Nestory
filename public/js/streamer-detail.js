(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  if (!api || !document.querySelector('.profile-head')) return;

  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) {
    location.href = '404.html';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const languageLabels = { KR: '한국어', JA: '日本語', 'KR/JA': 'KR / JA', 'JA/KR': 'JA / KR' };
  let currentProfile = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function localeTag() {
    return window.SeigaI18n?.localeTag?.() || 'ko-KR';
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function profileStringValue(value) {
    if (typeof value === 'string') return safeText(value, '');
    if (value && typeof value === 'object') {
      return safeText(value.url || value.src || value.path || '', '');
    }
    return '';
  }

  function firstProfileString(profile, keys) {
    for (const key of keys) {
      const value = profileStringValue(profile?.[key]);
      if (value) return value;
    }
    return '';
  }

  function normalizeImageUrl(value) {
    const text = safeText(value, '');
    if (!text) return '';
    if (/^(data:image\/|blob:)/i.test(text)) return text;
    try {
      return new URL(text, location.origin).href;
    } catch (_error) {
      return text;
    }
  }

  function coverImageUrl(profile = {}) {
    return normalizeImageUrl(firstProfileString(profile, [
      'backgroundImage',
      'backgroundImageUrl',
      'coverImage',
      'coverImageUrl',
      'backgroundUrl',
      'coverUrl',
      'profileBackground'
    ]));
  }

  function renderCover(profile = {}, state = 'ready') {
    const cover = $('detailCover');
    const image = $('detailCoverImage');
    const placeholder = $('detailCoverPlaceholder');
    if (!cover || !image) return;

    cover.classList.toggle('is-loading', state === 'loading');
    cover.classList.toggle('is-error', state === 'error');

    const imageUrl = state === 'ready' ? coverImageUrl(profile) : '';
    if (imageUrl) {
      image.onload = () => {
        cover.classList.add('has-background');
        if (placeholder) placeholder.hidden = true;
      };
      image.onerror = () => {
        image.removeAttribute('src');
        cover.classList.remove('has-background');
        if (placeholder) placeholder.hidden = false;
      };
      image.src = imageUrl;
      cover.classList.add('has-background');
      if (placeholder) placeholder.hidden = true;
      return;
    }

    image.removeAttribute('src');
    cover.classList.remove('has-background');
    if (placeholder) placeholder.hidden = false;
  }

  function avatarMarkup(profile) {
    const initial = api.escapeHtml(Array.from(safeText(profile.name, '?'))[0] || '?');
    const imageUrl = safeText(profile.avatarUrl || profile.profileImage || '');
    if (imageUrl) {
      const alt = api.escapeHtml(t('common.imageAlt', {}, '프로필 이미지'));
      return `<img src="${api.escapeHtml(imageUrl)}" alt="${alt}" loading="lazy" decoding="async" /><span aria-hidden="true">${initial}</span>`;
    }
    return `<span aria-hidden="true">${initial}</span>`;
  }

  function renderAvatarNode(id, profile = {}, state = 'ready') {
    const node = $(id);
    if (!node) return;
    const hasImage = Boolean(safeText(profile.avatarUrl || profile.profileImage || ''));
    node.classList.toggle('has-image', state === 'ready' && hasImage);
    node.classList.toggle('is-loading', state === 'loading');
    node.classList.toggle('is-error', state === 'error');
    node.innerHTML = avatarMarkup(profile);
  }

  function renderAllAvatars(profile = {}, state = 'ready') {
    ['detailHeroAvatar', 'detailSideAvatar'].forEach((id) => renderAvatarNode(id, profile, state));
  }

  function numberText(value) {
    return window.SeigaI18n?.number?.(value) || Number(value || 0).toLocaleString('ko-KR');
  }

  function dayText(dayOfWeek) {
    return t(`common.day.${dayOfWeek}`, {}, dayOfWeek || '-');
  }

  function displayLanguage(value) {
    const text = safeText(value, '');
    return languageLabels[text] || text;
  }

  function activeSchedule(schedule = []) {
    return schedule.filter((item) => item?.isActive !== false && (item?.startTime || item?.title));
  }

  function renderDetailProfileCard(profile = {}, options = {}) {
    const slot = $('detailProfileCardSlot');
    const renderer = window.SeigaProfileCard;
    if (!slot || !renderer) return;

    const isLive = Boolean(profile?.isLive);
    const name = safeText(profile?.name, options.loading ? t('common.loading', {}, '불러오는 중입니다.') : t('index.noName', {}, '이름 없는 스트리머'));
    const handle = safeText(profile?.handle, t('index.noHandle', {}, '핸들 없음'));
    const bio = options.error
      ? safeText(options.message, t('streamerDetail.profileLoadError', {}, '프로필 데이터를 불러오지 못했습니다.'))
      : safeText(profile?.subtitle || profile?.description, t('index.noSubtitle', {}, '소개가 등록되지 않았습니다.'));
    const fanCards = Array.isArray(profile?.fanCards) ? profile.fanCards.length : profile?.fanCardCount;

    slot.innerHTML = renderer.renderProfileCard(profile || {}, {
      className: `detail-profile-card${options.loading ? ' profile-card--skeleton' : ''}`,
      slug: profile?.slug || slug,
      name,
      handle,
      bio,
      imageUrl: profile?.avatarUrl || profile?.profileImage || profile?.coverImage || '',
      verified: profile?.isPublic !== false,
      isLive,
      tags: [profile?.mainContent, displayLanguage(profile?.language)].filter(Boolean),
      stats: [
        { icon: '♡', value: options.loading ? '-' : numberText(profile?.viewCount || profile?.viewerCount), label: t('rankings.profileViews', {}, '프로필 방문'), format: false },
        { icon: '▣', value: options.loading ? '-' : numberText(fanCards), label: t('profileCard.statFanCards', {}, '팬 카드'), format: false },
        { icon: '●', value: options.error ? 'ERR' : (isLive ? 'LIVE' : 'OFF'), label: t('profileCard.statStatus', {}, '상태'), format: false }
      ],
      actions: [
        { label: t('common.follow', {}, '팔로우'), icon: '+', loginRequired: true }
      ]
    });
  }

  function firstStreamLink(links = []) {
    return links.find((link) => String(link.type || '').toUpperCase() === 'TWITCH') || links[0];
  }

  function renderLoading() {
    renderCover({}, 'loading');
    renderAllAvatars({ name: '?' }, 'loading');
    $('detailHeroName').textContent = t('streamerDetail.heroLoadingName', {}, '프로필을 불러오는 중입니다.');
    $('detailHeroSubtitle').textContent = t('streamerDetail.heroLoadingSubtitle', {}, '잠시만 기다려주세요.');
    renderDetailProfileCard({}, { loading: true });
  }

  function renderEmpty(target, message, className = 'fan-item') {
    if (!target) return;
    target.innerHTML = `<div class="${className}"><div class="item-text"><strong>${api.escapeHtml(message)}</strong></div></div>`;
  }

  function renderError(error) {
    const message = error?.message || t('streamerDetail.profileLoadError', {}, '프로필 데이터를 불러오지 못했습니다.');
    renderCover({}, 'error');
    renderAllAvatars({ name: '?' }, 'error');
    $('detailLiveBadge').innerHTML = '<span class="dot"></span>ERROR';
    $('detailHeroName').textContent = t('streamerDetail.profileLoadError', {}, '프로필 데이터를 불러오지 못했습니다.');
    $('detailHeroSubtitle').textContent = message;
    renderDetailProfileCard({}, { error: true, message });
    $('detailSideName').textContent = t('common.noData', {}, '데이터 없음');
    renderEmpty($('detailFanList'), t('streamerDetail.profileLoadError', {}, '프로필 데이터를 불러오지 못했습니다.'));
    renderEmpty($('detailScheduleList'), t('streamerDetail.scheduleLoadError', {}, '방송 일정을 불러오지 못했습니다.'), 'schedule-item');
    renderEmpty($('detailLinkList'), t('streamerDetail.linksLoadError', {}, '링크를 불러오지 못했습니다.'), 'link-item');
  }

  function renderLinks(profile) {
    const links = profile.links || [];
    const chips = $('detailLinkChips');
    const list = $('detailLinkList');
    const twitchNode = $('detailTwitchLink');
    if (twitchNode) twitchNode.hidden = true;
    if (!links.length) {
      const emptyText = t('common.noLinks', {}, '등록된 링크가 없습니다.');
      if (chips) chips.innerHTML = `<span class="detail-link-chip">${api.escapeHtml(emptyText)}</span>`;
      if (list) list.innerHTML = `<div class="link-item"><div class="item-text"><strong>${api.escapeHtml(emptyText)}</strong></div></div>`;
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
    if (twitch?.url && twitchNode) {
      const node = twitchNode;
      node.hidden = false;
      node.href = twitch.url;
      node.textContent = t('streamerDetail.linkView', { label: twitch.label || twitch.type || 'Link' }, `${twitch.label || twitch.type || 'Link'} 보기`);
    }
  }

  function renderFanCards(cards = []) {
    const list = $('detailFanList');
    if (!list) return;
    if (!cards.length) {
      renderEmpty(list, t('streamerDetail.fanEmpty', {}, '아직 공개 팬 카드가 없습니다.'));
      return;
    }
    list.innerHTML = cards.map((card) => `
      <div class="fan-item">
        <div class="item-icon">${api.escapeHtml(card.emoji || '💌')}</div>
        <div class="item-text">
          <strong>${api.escapeHtml(card.message || t('dashboard.fanCardNoMessage', {}, '내용 없는 팬 카드'))}</strong>
          <span>${api.escapeHtml(card.senderName || t('dashboard.anonymousFan', {}, '익명 팬'))} · ${card.createdAt ? new Date(card.createdAt).toLocaleDateString(localeTag()) : t('adminAccess.noDate', {}, '날짜 없음')}</span>
        </div>
      </div>
    `).join('');
  }

  function renderSchedule(schedule = []) {
    const list = $('detailScheduleList');
    if (!list) return;
    const items = activeSchedule(schedule);
    if (!items.length) {
      renderEmpty(list, t('profileCard.noSchedule', {}, '등록된 방송 일정이 없습니다.'), 'schedule-item');
      return;
    }
    list.innerHTML = items.map((item) => `
      <div class="schedule-item">
        <div class="item-icon">${api.escapeHtml(dayText(item.dayOfWeek))}</div>
        <div class="item-text"><strong>${api.escapeHtml(item.startTime || t('profileCard.timeUnknown', {}, '미정'))}</strong><span>${api.escapeHtml(item.title || t('streamerDetail.scheduleFallback', {}, '방송 일정'))}</span></div>
      </div>
    `).join('');
  }

  function render(profile) {
    currentProfile = profile;
    const isLive = Boolean(profile.isLive);
    const name = safeText(profile.name, t('index.noName', {}, '이름 없는 스트리머'));
    const handle = safeText(profile.handle, t('index.noHandle', {}, '핸들 없음'));
    const subtitle = safeText(profile.subtitle, t('index.noSubtitle', {}, '소개가 등록되지 않았습니다.'));
    const language = safeText(profile.language, t('profileCard.noLanguage', {}, '언어 미등록'));
    const languageText = displayLanguage(language);
    const mainContent = safeText(profile.mainContent, t('profileCard.noContent', {}, '콘텐츠 미등록'));
    const mainColor = profile.mainColor || '#7c3aed';
    const subColor = profile.subColor || '#f9a8d4';

    document.documentElement.style.setProperty('--primary', mainColor);
    document.documentElement.style.setProperty('--pink', subColor);

    renderCover(profile);
    renderAllAvatars(profile);

    $('detailLiveBadge').innerHTML = `<span class="dot"></span>${isLive ? t('streamerDetail.liveNow', {}, '라이브 중') : t('common.offline', {}, 'OFFLINE')}`;
    $('detailHeroName').textContent = name;
    $('detailHeroSubtitle').textContent = subtitle;
    renderDetailProfileCard(profile);
    $('detailSideName').textContent = name;
    $('detailSideMeta').innerHTML = `${api.escapeHtml(t('streamerDetail.broadcastingSuffix', { language: languageText }, `${languageText} 방송`))}<br />${api.escapeHtml(mainContent)}`;

    $('detailStatStatus').textContent = isLive ? 'LIVE' : 'OFFLINE';
    $('detailStatViewers').textContent = numberText(profile.viewerCount);
    $('detailStatStart').textContent = profile.streamStatus?.startedAt
      ? new Date(profile.streamStatus.startedAt).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })
      : safeText(activeSchedule(profile.schedule)[0]?.startTime, t('profileCard.timeUnknown', {}, '미정'));
    $('detailStatLanguage').textContent = languageText;

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
  document.addEventListener('seiga:i18n-change', () => {
    if (currentProfile) render(currentProfile);
    else renderLoading();
  });
  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const holder = image.closest('.avatar, .side-avatar');
    if (!holder) return;
    const fallback = holder.querySelector('span[aria-hidden="true"]');
    image.remove();
    holder.classList.remove('has-image');
    holder.classList.remove('is-loading');
    if (fallback && !fallback.textContent.trim()) fallback.textContent = '?';
  }, true);

  renderLoading();
  try {
    const profile = await api.getJson(`/api/public/streamers/${encodeURIComponent(slug)}`);
    render(profile);
  } catch (error) {
    renderError(error);
  }
})();
