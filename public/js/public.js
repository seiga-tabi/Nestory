(async function () {
  await window.SeigaI18nReady;

  const file = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-public-nav]').forEach((link) => {
    if (link.getAttribute('href') === file) link.classList.add('active');
  });

  const toast = document.createElement('div');
  toast.className = 'toast';
  document.body.appendChild(toast);

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__publicToastTimer);
    window.__publicToastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }
  window.showToast = window.showToast || showToast;

  document.querySelectorAll('[data-demo-submit]').forEach((form) => {
    if (window.SeigaApi) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      showToast(form.dataset.demoSubmit || publicT('common.requestDone', {}, '요청을 처리했습니다.'));
      form.reset();
    });
  });

  document.querySelectorAll('[data-toast]').forEach((button) => {
    button.addEventListener('click', () => showToast(button.dataset.toast));
  });

  initAuthAwarePublicNav();
  initPublicStreamerList();
})();

function publicT(key, params = {}, fallback = key) {
  return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
}

async function initAuthAwarePublicNav() {
  const api = window.SeigaApi;
  if (!api) return;
  if (window.SeigaAuth?.syncAuthUi) {
    await window.SeigaAuth.syncAuthUi();
    return;
  }
  try {
    const me = await api.getJson('/api/auth/me');
    if (!me.authenticated) return;

    document.querySelectorAll('.header-actions .ghost-btn, .header-actions .primary-btn').forEach((node) => {
      const href = node.getAttribute('href');
      const onclick = node.getAttribute('onclick') || '';
      if (href === 'login.html' || onclick.includes('login.html')) {
        const isPrimary = node.classList.contains('primary-btn');
        node.textContent = isPrimary ? publicT('nav.dashboard', {}, '대시보드') : publicT('nav.publicHome', {}, '공개 홈');
        node.removeAttribute('onclick');
        if (node.tagName === 'A') node.href = isPrimary ? 'dashboard.html' : 'index.html';
        else node.addEventListener('click', () => { location.href = isPrimary ? 'dashboard.html' : 'index.html'; });
      }
    });
  } catch {
    // Public pages should remain browsable even if auth status cannot be loaded.
  }
}

async function initPublicStreamerList() {
  const api = window.SeigaApi;
  const streamerGrid = document.getElementById('streamerGrid');
  if (!api || !streamerGrid) return;

  const searchInput = document.getElementById('searchInput');
  const searchButton = document.getElementById('searchButton');
  const resultText = document.getElementById('resultText');
  const emptyState = document.getElementById('emptyState');
  const errorState = document.getElementById('errorState');
  const popularList = document.getElementById('popularStreamersList');
  const heroTagList = document.getElementById('heroTagList');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const sortSelect = document.querySelector('.sort-select');
  const loginToast = document.getElementById('loginToast');

  const filters = { status: 'all', category: '', language: '' };
  let allItems = [];

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function numberText(value) {
    return window.SeigaI18n?.number?.(value) || Number(value || 0).toLocaleString('ko-KR');
  }

  function firstValue(profile, keys, fallback = '') {
    for (const key of keys) {
      const value = profile?.[key];
      if (Array.isArray(value) && value.length) return value;
      if (safeText(value)) return value;
    }
    return fallback;
  }

  function asList(value) {
    if (Array.isArray(value)) return value.map((item) => safeText(item)).filter(Boolean);
    return safeText(value)
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function profileTags(profile) {
    const tags = [
      firstValue(profile, ['mainContent', 'category']),
      firstValue(profile, ['language', 'languages']),
      ...asList(firstValue(profile, ['tags', 'styleTags', 'playStyleTags']))
    ].flat().map((tag) => safeText(tag)).filter(Boolean);
    return Array.from(new Set(tags)).slice(0, 4);
  }

  function profileName(profile) {
    return safeText(firstValue(profile, ['displayName', 'name', 'username']), publicT('index.noName', {}, '이름 없는 스트리머'));
  }

  function profileHandle(profile) {
    return safeText(firstValue(profile, ['handle', 'username', 'twitchLogin']), publicT('index.noHandle', {}, '핸들 없음'));
  }

  function profileBio(profile) {
    return safeText(firstValue(profile, ['bio', 'description', 'subtitle']), publicT('index.noSubtitle', {}, '소개가 등록되지 않았습니다.'));
  }

  function profileAvatar(profile) {
    return safeText(firstValue(profile, ['avatarImage', 'profileImage', 'avatarUrl']));
  }

  function profileCover(profile) {
    return safeText(firstValue(profile, ['coverImage', 'backgroundImage', 'coverUrl', 'backgroundUrl']));
  }

  function profileDetailUrl(profile) {
    const explicitUrl = safeText(firstValue(profile, ['profileUrl', 'detailUrl']));
    if (/^(https?:\/\/|\/|[a-z0-9_-]+\.html(?:\?|$))/i.test(explicitUrl)) return explicitUrl;
    const slug = safeText(profile.slug);
    return slug ? `streamer-detail.html?slug=${encodeURIComponent(slug)}` : '';
  }

  function isLiveProfile(profile) {
    const value = firstValue(profile, ['isLive', 'liveStatus', 'isStreaming']);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    const text = safeText(value).toLowerCase();
    return ['live', 'online', 'streaming', 'true', 'on'].includes(text);
  }

  function followerLikeCount(profile) {
    return Number(firstValue(profile, ['favoriteCount', 'followerCount', 'followers', 'viewCount', 'viewerCount'], 0) || 0);
  }

  function fanCardCount(profile) {
    return Number(firstValue(profile, ['fanCardCount', 'fanCardsCount'], 0) || 0);
  }

  function updatedTime(profile) {
    const value = firstValue(profile, ['updatedAt', 'lastStreamedAt', 'createdAt']);
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function popularityCompare(a, b) {
    return Number(isLiveProfile(b)) - Number(isLiveProfile(a))
      || followerLikeCount(b) - followerLikeCount(a)
      || fanCardCount(b) - fanCardCount(a)
      || updatedTime(b) - updatedTime(a)
      || profileName(a).localeCompare(profileName(b));
  }

  function sortProfiles(items, mode = 'popular') {
    const sorted = [...items];
    if (mode === 'name') return sorted.sort((a, b) => profileName(a).localeCompare(profileName(b)));
    if (mode === 'recent') return sorted.sort((a, b) => updatedTime(b) - updatedTime(a) || popularityCompare(a, b));
    return sorted.sort(popularityCompare);
  }

  function matchesSearch(profile, query) {
    const text = safeText(query).toLowerCase();
    if (!text) return true;
    const searchable = [
      profileName(profile),
      profileHandle(profile),
      profileBio(profile),
      firstValue(profile, ['mainContent', 'category']),
      firstValue(profile, ['language', 'languages']),
      ...profileTags(profile)
    ].join(' ').toLowerCase();
    return searchable.includes(text);
  }

  function matchesFilters(profile) {
    if (filters.status === 'live' && !isLiveProfile(profile)) return false;
    if (filters.status === 'offline' && isLiveProfile(profile)) return false;

    if (filters.category) {
      const category = safeText(firstValue(profile, ['mainContent', 'category'])).toLowerCase();
      if (!category.includes(filters.category.toLowerCase())) return false;
    }

    if (filters.language) {
      const language = safeText(firstValue(profile, ['language', 'languages'])).toUpperCase();
      if (filters.language === 'KR/JA') {
        if (!(language.includes('KR') && language.includes('JA'))) return false;
      } else if (!language.includes(filters.language.toUpperCase())) {
        return false;
      }
    }

    return true;
  }

  function applyControls() {
    const query = searchInput?.value || '';
    const filtered = allItems.filter((profile) => matchesSearch(profile, query) && matchesFilters(profile));
    render(sortProfiles(filtered, sortValue()));
  }

  function safeStyleUrl(value) {
    const url = safeText(value).replace(/["'\\]/g, '');
    if (!url) return '';
    if (/^(https?:\/\/|\/|data:image\/)/.test(url)) return url;
    return '';
  }

  function avatarMarkup(profile) {
    const avatar = profileAvatar(profile);
    const initial = api.escapeHtml(Array.from(profileName(profile))[0] || '?');
    if (avatar) {
      return `<img src="${api.escapeHtml(avatar)}" alt="" /><span aria-hidden="true">${initial}</span>`;
    }
    return `<span aria-hidden="true">${initial}</span>`;
  }

  function renderStreamerCard(profile) {
    const slug = safeText(profile.slug);
    const detailUrl = profileDetailUrl(profile);
    const tags = profileTags(profile);
    const isLive = isLiveProfile(profile);
    const favoriteCount = numberText(followerLikeCount(profile));
    const fanCards = numberText(fanCardCount(profile));
    const verified = profile.verified === true || profile.isVerified === true || profile.isPublic !== false;
    return window.SeigaProfileCard.renderProfileCard(profile, {
      className: 'streamer-card',
      slug,
      name: profileName(profile),
      handle: profileHandle(profile),
      bio: profileBio(profile),
      imageUrl: profileAvatar(profile) || profileCover(profile),
      verified,
      isLive,
      tags,
      stats: [
        { icon: '♡', value: favoriteCount, label: publicT('profileCard.statFollowers', {}, '팔로워'), format: false },
        { icon: '▣', value: fanCards, label: publicT('profileCard.statFanCards', {}, '팬 카드'), format: false },
        { icon: '●', value: isLive ? 'LIVE' : 'OFF', label: publicT('profileCard.statStatus', {}, '상태'), format: false }
      ],
      actions: [
        { label: publicT('index.profileView', {}, '프로필 보기'), icon: '+', detailUrl, disabled: !detailUrl },
        { label: publicT('index.fanCard', {}, 'Fan Card'), icon: '›', fanWrite: slug, disabled: !slug }
      ]
    });
  }

  streamerGrid.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const avatar = image.closest('.profile-card__image');
    if (!avatar) return;
    image.remove();
    avatar.classList.remove('has-image');
  }, true);

  function renderPopularStreamers(items = []) {
    if (!popularList) return;
    popularList.classList.add('profile-card-grid', 'profile-card-grid--featured');
    const popularItems = sortProfiles(items, 'popular').slice(0, 3);
    if (!popularItems.length) {
      popularList.innerHTML = `
        <div class="empty-state empty-state--popular">
          ${stateCardHtml({
            variant: 'popular',
            icon: 'LIVE',
            title: publicT('index.popularEmptyTitle', {}, '오늘의 인기 스트리머가 없습니다.'),
            message: publicT('index.popularEmptyDescription', {}, '공개 프로필이 등록되면 라이브 상태와 반응 지표를 기준으로 표시됩니다.')
          })}
        </div>
      `;
      return;
    }
    popularList.innerHTML = popularItems.map((profile, index) => {
      const detailUrl = profileDetailUrl(profile);
      const isLive = isLiveProfile(profile);
      return window.SeigaProfileCard.renderProfileCard(profile, {
        className: 'streamer-card streamer-card--popular',
        rank: index + 1,
        slug: safeText(profile.slug),
        name: profileName(profile),
        handle: profileHandle(profile),
        bio: profileBio(profile),
        imageUrl: profileAvatar(profile) || profileCover(profile),
        isLive,
        tags: profileTags(profile),
        stats: [
          { icon: '♡', value: numberText(followerLikeCount(profile)), label: publicT('profileCard.statFollowers', {}, '팔로워'), format: false },
          { icon: '▣', value: numberText(fanCardCount(profile)), label: publicT('profileCard.statFanCards', {}, '팬 카드'), format: false },
          { icon: '●', value: isLive ? 'LIVE' : 'OFF', label: publicT('profileCard.statStatus', {}, '상태'), format: false }
        ],
        actions: [
          { label: publicT('index.profileView', {}, '프로필 보기'), icon: '+', detailUrl, disabled: !detailUrl }
        ]
      });
    }).join('');
  }

  function renderHeroTags(items = []) {
    if (!heroTagList) return;
    const tags = [];
    items.forEach((profile) => {
      profileTags(profile).forEach((value) => {
        const text = safeText(value);
        if (text && !tags.includes(text)) tags.push(text);
      });
      if (isLiveProfile(profile) && !tags.includes(publicT('common.live', {}, 'LIVE'))) tags.push(publicT('common.live', {}, 'LIVE'));
    });

    if (!tags.length) {
      heroTagList.innerHTML = `<span class="hero-tag">${publicT('index.tagEmpty', {}, '등록된 태그가 없습니다.')}</span>`;
      return;
    }

    heroTagList.innerHTML = tags
      .slice(0, 6)
      .map((tag) => `<span class="hero-tag">#${api.escapeHtml(tag)}</span>`)
      .join('');
  }

  function stateCardHtml(options = {}) {
    const variant = safeText(options.variant, 'empty');
    const icon = safeText(options.icon, '0');
    const title = safeText(options.title);
    const message = safeText(options.message);
    const actionLabel = safeText(options.actionLabel);
    const actionKind = safeText(options.actionKind);
    const actionHref = safeText(options.actionHref);
    let actionHtml = '';

    if (actionLabel && actionKind === 'retry') {
      actionHtml = `<button class="primary-btn" type="button" data-retry-streamers>${api.escapeHtml(actionLabel)}</button>`;
    } else if (actionLabel && actionKind === 'clear') {
      actionHtml = `<button class="ghost-btn" type="button" data-clear-streamer-filters>${api.escapeHtml(actionLabel)}</button>`;
    } else if (actionLabel && actionHref) {
      actionHtml = `<a class="primary-btn" href="${api.escapeHtml(actionHref)}">${api.escapeHtml(actionLabel)}</a>`;
    }

    return `
      <div class="index-state-card index-state-card--${api.escapeHtml(variant)}">
        <div class="index-state-icon" aria-hidden="true">${api.escapeHtml(icon)}</div>
        <strong>${api.escapeHtml(title)}</strong>
        <p>${api.escapeHtml(message)}</p>
        ${actionHtml ? `<div class="index-state-actions">${actionHtml}</div>` : ''}
      </div>
    `;
  }

  function streamerSkeletonMarkup() {
    return Array.from({ length: 3 }).map(() => `
      <article class="streamer-card streamer-card--skeleton" aria-hidden="true">
        <div class="cover">
          <span class="skeleton-block skeleton-pill"></span>
        </div>
        <div class="card-body">
          <span class="skeleton-block skeleton-title"></span>
          <span class="skeleton-block skeleton-line"></span>
          <span class="skeleton-block skeleton-line short"></span>
          <div class="card-actions">
            <span class="skeleton-block skeleton-button"></span>
            <span class="skeleton-block skeleton-button"></span>
          </div>
        </div>
      </article>
    `).join('');
  }

  function popularSkeletonMarkup() {
    return Array.from({ length: 3 }).map(() => `
      <article class="ranking-item ranking-item--skeleton" aria-hidden="true">
        <span class="skeleton-block rank-no"></span>
        <span class="skeleton-block rank-avatar"></span>
        <span class="rank-info">
          <span class="skeleton-block skeleton-line"></span>
          <span class="skeleton-block skeleton-line short"></span>
        </span>
        <span class="skeleton-block skeleton-chip"></span>
      </article>
    `).join('');
  }

  function renderLoading() {
    if (emptyState) emptyState.hidden = true;
    if (errorState) errorState.hidden = true;
    streamerGrid.hidden = false;
    streamerGrid.classList.remove('has-results', 'is-short');
    streamerGrid.classList.add('is-loading');
    streamerGrid.innerHTML = streamerSkeletonMarkup();
    if (popularList) popularList.innerHTML = popularSkeletonMarkup();
    if (heroTagList) heroTagList.innerHTML = `<span class="hero-tag">${publicT('index.tagLoading', {}, '태그 데이터를 불러오는 중입니다.')}</span>`;
    if (resultText) resultText.textContent = publicT('index.loading', {}, '스트리머 데이터를 불러오는 중입니다.');
  }

  function renderEmpty(hasSourceData = allItems.length > 0) {
    streamerGrid.hidden = true;
    streamerGrid.classList.remove('has-results', 'is-short', 'is-loading');
    streamerGrid.innerHTML = '';
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.innerHTML = hasSourceData
        ? stateCardHtml({
          variant: 'filtered',
          icon: '0',
          title: publicT('index.filteredEmptyTitle', {}, '조건에 맞는 스트리머를 찾을 수 없습니다.'),
          message: publicT('index.filteredEmptyDescription', {}, '검색어와 필터를 조정하면 더 많은 공개 프로필을 볼 수 있습니다.'),
          actionLabel: publicT('index.filteredEmptyAction', {}, '검색/필터 초기화'),
          actionKind: 'clear'
        })
        : stateCardHtml({
          variant: 'empty',
          icon: 'S',
          title: publicT('index.emptyTitle', {}, '등록된 스트리머가 아직 없습니다.'),
          message: publicT('index.emptyDescription', {}, '첫 번째 스트리머 프로필을 등록해 보세요. 관리자 승인 대기 중인 스트리머가 있을 수 있습니다.'),
          actionLabel: publicT('index.emptyAction', {}, '스트리머 등록 문의'),
          actionHref: 'access-request.html'
        });
    }
    if (errorState) errorState.hidden = true;
    if (resultText) resultText.textContent = publicT('index.resultZero', { count: 0 }, '공개 프로필 0명을 표시 중입니다.');
    renderPopularStreamers(hasSourceData ? allItems : []);
    renderHeroTags(hasSourceData ? allItems : []);
  }

  function renderError(error) {
    streamerGrid.hidden = true;
    streamerGrid.classList.remove('has-results', 'is-short', 'is-loading');
    streamerGrid.innerHTML = '';
    if (emptyState) emptyState.hidden = true;
    if (errorState) {
      errorState.hidden = false;
      errorState.innerHTML = stateCardHtml({
        variant: 'error',
        icon: '!',
        title: publicT('index.errorTitle', {}, '스트리머 데이터를 불러오지 못했습니다.'),
        message: publicT('index.errorDescription', {}, 'API 응답을 확인한 뒤 다시 시도해주세요.'),
        actionLabel: publicT('index.errorAction', {}, '다시 시도'),
        actionKind: 'retry'
      });
    }
    if (resultText) resultText.textContent = publicT('index.error', {}, '스트리머 데이터를 불러오지 못했습니다.');
    if (popularList) {
      popularList.innerHTML = `
        <div class="empty-state empty-state--popular">
          ${stateCardHtml({
            variant: 'error',
            icon: '!',
            title: publicT('index.popularErrorTitle', {}, '인기 스트리머를 불러오지 못했습니다.'),
            message: publicT('index.popularErrorDescription', {}, '공개 스트리머 API 응답을 확인해주세요.'),
            actionLabel: publicT('index.errorAction', {}, '다시 시도'),
            actionKind: 'retry'
          })}
        </div>
      `;
    }
    if (heroTagList) heroTagList.innerHTML = `<span class="hero-tag">${publicT('index.tagError', {}, '태그 데이터를 불러오지 못했습니다.')}</span>`;
  }

  function render(items = []) {
    if (!items.length) {
      renderEmpty();
      return;
    }
    if (emptyState) emptyState.hidden = true;
    if (errorState) errorState.hidden = true;
    streamerGrid.hidden = false;
    streamerGrid.classList.remove('is-loading');
    streamerGrid.classList.add('has-results');
    streamerGrid.classList.toggle('is-short', items.length < 3);
    streamerGrid.innerHTML = items.map(renderStreamerCard).join('');
    renderPopularStreamers(allItems);
    renderHeroTags(items);
    if (resultText) resultText.textContent = publicT('index.resultCount', { count: items.length }, `공개 프로필 ${items.length}명을 표시 중입니다.`);
  }

  function resetControls() {
    if (searchInput) searchInput.value = '';
    filters.status = 'all';
    filters.category = '';
    filters.language = '';
    syncFilterButtonStates();
    if (sortSelect) sortSelect.value = 'popular';
    applyControls();
  }

  function setFilterButtonState(button, active) {
    button.classList.toggle('active', active);
    button.classList.toggle('selected', active);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function syncFilterButtonStates() {
    filterButtons.forEach((button) => {
      const group = button.dataset.filterGroup || button.closest('[data-filter-group]')?.dataset.filterGroup;
      const value = button.dataset.filter || '';
      const active = group === 'status'
        ? (filters.status || 'all') === value
        : Boolean(value && filters[group] === value);
      setFilterButtonState(button, active);
    });
  }

  function sortValue() {
    const value = sortSelect?.value || '';
    if (value) return value;
    const selected = sortSelect?.selectedOptions?.[0]?.textContent || '';
    if (selected.includes('이름')) return 'name';
    if (selected.includes('최근')) return 'recent';
    return 'popular';
  }

  async function load() {
    renderLoading();
    try {
      // TODO(Backend/API): move tag/follower/cover-aware search to the server when the public directory grows beyond the current API page size.
      const data = await api.getJson('/api/public/streamers', { status: 'all', sort: 'popular' });
      allItems = Array.isArray(data.items) ? data.items : [];
      applyControls();
    } catch (error) {
      renderError(error);
    }
  }

  function toastLogin(event) {
    event.preventDefault();
    if (!loginToast) return;
    loginToast.classList.add('show');
    clearTimeout(window.__loginToastTimer);
    window.__loginToastTimer = setTimeout(() => loginToast.classList.remove('show'), 2200);
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.dataset.filterGroup || button.closest('[data-filter-group]')?.dataset.filterGroup;
      if (!group) return;

      const value = button.dataset.filter || '';
      const wasSelected = filters[group] === value || (group === 'status' && (filters.status || 'all') === value);
      if (group === 'status') {
        filters.status = value === 'all' || wasSelected ? 'all' : value;
      } else {
        filters[group] = wasSelected ? '' : value;
      }

      syncFilterButtonStates();
      applyControls();
    });
  });

  searchButton?.addEventListener('click', applyControls);
  searchInput?.addEventListener('input', () => {
    clearTimeout(window.__streamerSearchTimer);
    window.__streamerSearchTimer = setTimeout(applyControls, 250);
  });
  sortSelect?.addEventListener('change', applyControls);
  emptyState?.addEventListener('click', (event) => {
    if (event.target.closest('[data-clear-streamer-filters]')) resetControls();
    if (event.target.closest('[data-retry-streamers]')) load();
  });
  errorState?.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-streamers]')) load();
  });

  streamerGrid.addEventListener('click', (event) => {
    const loginButton = event.target.closest('[data-login-required]');
    if (loginButton) return toastLogin(event);

    const profileButton = event.target.closest('[data-detail-url]');
    if (profileButton?.dataset.detailUrl) {
      location.href = profileButton.dataset.detailUrl;
    }

    const fanButton = event.target.closest('[data-fan-write]');
    if (fanButton?.dataset.fanWrite) {
      location.href = `fan-card-write.html?slug=${encodeURIComponent(fanButton.dataset.fanWrite)}`;
    }
  });

  popularList?.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-streamers]')) {
      load();
      return;
    }
    const row = event.target.closest('[data-detail-url]');
    if (row?.dataset.detailUrl) {
      location.href = row.dataset.detailUrl;
      return;
    }
    const card = event.target.closest('[data-profile-slug]');
    if (card?.dataset.profileSlug) {
      location.href = `streamer-detail.html?slug=${encodeURIComponent(card.dataset.profileSlug)}`;
    }
  });

  syncFilterButtonStates();
  load();
  document.addEventListener('seiga:i18n-change', () => {
    if (allItems.length) {
      applyControls();
    }
    else load();
  });
}
