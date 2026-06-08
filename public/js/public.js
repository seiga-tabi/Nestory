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
  let lastItems = [];

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function avatarMarkup(profile) {
    if (profile.avatarUrl) {
      return `<img src="${api.escapeHtml(profile.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
    }
    return api.escapeHtml(Array.from(safeText(profile.name, '?'))[0] || '?');
  }

  function renderStreamerCard(profile) {
    const slug = safeText(profile.slug);
    const name = safeText(profile.name, publicT('index.noName', {}, '이름 없는 스트리머'));
    const handle = safeText(profile.handle, publicT('index.noHandle', {}, '핸들 없음'));
    const subtitle = safeText(profile.subtitle, publicT('index.noSubtitle', {}, '소개가 등록되지 않았습니다.'));
    const isLive = Boolean(profile.isLive);
    const statusClass = isLive ? '' : ' off';
    const statusText = isLive ? publicT('common.live', {}, 'LIVE') : publicT('common.offline', {}, 'OFFLINE');
    const keywords = [name, handle, subtitle, profile.mainContent, profile.language, statusText].join(' ').toLowerCase();

    return `
      <article class="streamer-card" data-keywords="${api.escapeHtml(keywords)}" data-slug="${api.escapeHtml(slug)}">
        <div class="cover" style="--cover: linear-gradient(135deg, var(--pink), var(--primary))">
          <div class="status-badge${statusClass}"><span class="dot"></span>${statusText}</div>
        </div>
        <div class="profile-avatar">${avatarMarkup(profile)}</div>
        <button class="favorite-btn" type="button" data-login-required aria-label="${api.escapeHtml(publicT('index.favoriteAria', {}, '즐겨찾기'))}">♡</button>
        <div class="card-body">
          <div class="streamer-name">
            <h3>${api.escapeHtml(name)}</h3>
            ${profile.isPublic !== false ? '<span class="verified">✓</span>' : ''}
          </div>
          <p class="streamer-handle">${api.escapeHtml(handle)}</p>
          <p class="streamer-desc">${api.escapeHtml(subtitle)}</p>
          <div class="card-actions">
            <button class="view-btn" type="button" data-profile-view="${api.escapeHtml(slug)}" ${slug ? '' : 'disabled'}>${publicT('index.profileView', {}, '프로필 보기')}</button>
            <button class="mini-btn" type="button" data-fan-write="${api.escapeHtml(slug)}" ${slug ? '' : 'disabled'}>${publicT('index.fanCard', {}, 'Fan Card')}</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderPopularStreamers(items = []) {
    if (!popularList) return;
    if (!items.length) {
      popularList.innerHTML = `<div class="empty-state">${publicT('index.popularEmpty', {}, '표시할 인기 스트리머가 없습니다.')}</div>`;
      return;
    }
    popularList.innerHTML = items.slice(0, 3).map((profile, index) => {
      const name = safeText(profile.name, publicT('index.noName', {}, '이름 없는 스트리머'));
      const meta = [profile.mainContent, profile.language].map((item) => safeText(item)).filter(Boolean).join(' · ') || publicT('rankings.noProfileInfo', {}, '프로필 정보 없음');
      return `
        <article class="ranking-item" data-profile-view="${api.escapeHtml(safeText(profile.slug))}">
          <div class="rank-no">${index + 1}</div>
          <div class="rank-avatar">${avatarMarkup(profile)}</div>
          <div class="rank-info">
            <strong>${api.escapeHtml(name)}</strong>
            <span>${api.escapeHtml(meta)}</span>
          </div>
          <div class="live-chip${profile.isLive ? '' : ' off'}"><span class="dot"></span>${profile.isLive ? publicT('common.live', {}, 'LIVE') : publicT('common.offline', {}, 'OFFLINE')}</div>
        </article>
      `;
    }).join('');
  }

  function renderHeroTags(items = []) {
    if (!heroTagList) return;
    const tags = [];
    items.forEach((profile) => {
      [profile.mainContent, profile.language].forEach((value) => {
        const text = safeText(value);
        if (text && !tags.includes(text)) tags.push(text);
      });
      if (profile.isLive && !tags.includes(publicT('common.live', {}, 'LIVE'))) tags.push(publicT('common.live', {}, 'LIVE'));
    });

    if (!tags.length) {
      heroTagList.innerHTML = `<span class="hero-tag">${publicT('common.noTags', {}, '표시할 태그가 없습니다.')}</span>`;
      return;
    }

    heroTagList.innerHTML = tags
      .slice(0, 6)
      .map((tag) => `<span class="hero-tag">#${api.escapeHtml(tag)}</span>`)
      .join('');
  }

  function renderLoading() {
    if (emptyState) emptyState.hidden = true;
    if (errorState) errorState.hidden = true;
    streamerGrid.hidden = false;
    streamerGrid.innerHTML = `
      <article class="streamer-card">
        <div class="card-body">
          <p class="streamer-desc">${publicT('index.loading', {}, '스트리머 데이터를 불러오는 중입니다.')}</p>
        </div>
      </article>
    `;
    if (popularList) popularList.innerHTML = `<div class="empty-state">${publicT('index.popularLoading', {}, '인기 스트리머 데이터를 불러오는 중입니다.')}</div>`;
    if (heroTagList) heroTagList.innerHTML = `<span class="hero-tag">${publicT('index.tagLoading', {}, '태그 데이터를 불러오는 중입니다.')}</span>`;
    if (resultText) resultText.textContent = publicT('index.loading', {}, '스트리머 데이터를 불러오는 중입니다.');
  }

  function renderEmpty() {
    streamerGrid.hidden = true;
    streamerGrid.innerHTML = '';
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.textContent = publicT('index.empty', {}, '등록된 스트리머가 없습니다.');
    }
    if (errorState) errorState.hidden = true;
    if (resultText) resultText.textContent = publicT('index.resultZero', { count: 0 }, '공개 프로필 0명을 표시 중입니다.');
    renderPopularStreamers([]);
    renderHeroTags([]);
  }

  function renderError(error) {
    streamerGrid.hidden = true;
    streamerGrid.innerHTML = '';
    if (emptyState) emptyState.hidden = true;
    if (errorState) {
      errorState.hidden = false;
      errorState.textContent = error?.message || publicT('index.error', {}, '스트리머 데이터를 불러오지 못했습니다.');
    }
    if (resultText) resultText.textContent = publicT('index.error', {}, '스트리머 데이터를 불러오지 못했습니다.');
    if (popularList) popularList.innerHTML = `<div class="empty-state">${publicT('index.popularError', {}, '인기 스트리머 데이터를 불러오지 못했습니다.')}</div>`;
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
    lastItems = items;
    streamerGrid.innerHTML = items.map(renderStreamerCard).join('');
    renderPopularStreamers(items);
    renderHeroTags(items);
    if (resultText) resultText.textContent = publicT('index.resultCount', { count: items.length }, `공개 프로필 ${items.length}명을 표시 중입니다.`);
  }

  function sortValue() {
    const value = sortSelect?.value || '';
    if (value) return value;
    const selected = sortSelect?.selectedOptions?.[0]?.textContent || '';
    if (selected.includes('이름')) return 'name';
    if (selected.includes('최근')) return 'recent';
    return 'popular';
  }

  function requestParams() {
    return {
      q: searchInput?.value || '',
      status: filters.status,
      category: filters.category,
      language: filters.language,
      sort: sortValue()
    };
  }

  async function load() {
    renderLoading();
    try {
      const data = await api.getJson('/api/public/streamers', requestParams());
      render(data.items || []);
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

      const wasActive = button.classList.contains('active');
      button.closest('[data-filter-group]')?.querySelectorAll('.filter-btn').forEach((item) => item.classList.remove('active'));

      if (group === 'status' || !wasActive) {
        button.classList.add('active');
        filters[group] = button.dataset.filter || '';
      } else {
        filters[group] = '';
      }

      if (group === 'status' && !filters.status) filters.status = 'all';
      load();
    });
  });

  searchButton?.addEventListener('click', load);
  searchInput?.addEventListener('input', () => {
    clearTimeout(window.__streamerSearchTimer);
    window.__streamerSearchTimer = setTimeout(load, 250);
  });
  sortSelect?.addEventListener('change', load);

  streamerGrid.addEventListener('click', (event) => {
    const loginButton = event.target.closest('[data-login-required]');
    if (loginButton) return toastLogin(event);

    const profileButton = event.target.closest('[data-profile-view]');
    if (profileButton?.dataset.profileView) {
      location.href = `streamer-detail.html?slug=${encodeURIComponent(profileButton.dataset.profileView)}`;
    }

    const fanButton = event.target.closest('[data-fan-write]');
    if (fanButton?.dataset.fanWrite) {
      location.href = `fan-card-write.html?slug=${encodeURIComponent(fanButton.dataset.fanWrite)}`;
    }
  });

  popularList?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-profile-view]');
    if (row?.dataset.profileView) {
      location.href = `streamer-detail.html?slug=${encodeURIComponent(row.dataset.profileView)}`;
    }
  });

  load();
  document.addEventListener('seiga:i18n-change', () => {
    if (lastItems.length) render(lastItems);
    else load();
  });
}
