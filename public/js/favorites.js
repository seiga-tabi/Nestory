(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const list = document.getElementById('favoritesList');
  if (!api || !list) return;

  const me = await api.redirectIfUnauthorized('login.html?next=favorites.html');
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let favorites = [];
  let lastError = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function localeTag() {
    return window.SeigaI18n?.locale === 'ja' ? 'ja-JP' : 'ko-KR';
  }

  function numberText(value) {
    return Number(value || 0).toLocaleString(localeTag());
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function streamerFromFavorite(item = {}) {
    return item.streamer || item.streamerProfile || item.profile || item;
  }

  function profileHref(streamer = {}) {
    if (streamer.profileUrl || streamer.detailUrl) return streamer.profileUrl || streamer.detailUrl;
    if (streamer.slug) return `streamer-detail.html?slug=${encodeURIComponent(streamer.slug)}`;
    return 'index.html';
  }

  function normalizeFavorite(item = {}) {
    const streamer = streamerFromFavorite(item);
    const handle = safeText(streamer.handle || streamer.username || streamer.twitchLogin, '').replace(/^@/, '');
    return {
      favoriteId: item.id || '',
      streamerId: streamer.id || item.streamerProfileId || item.streamerId || '',
      name: safeText(streamer.displayName || streamer.name, t('index.noName', {}, '이름 없는 스트리머')),
      handle,
      mainContent: safeText(streamer.mainContent || streamer.category, t('profileCard.noContent', {}, '콘텐츠 미등록')),
      imageUrl: safeText(streamer.avatarUrl || streamer.profileImage || streamer.coverImageUrl || streamer.coverImage, ''),
      liveStatus: safeText(streamer.liveStatus || streamer.streamStatus || '', ''),
      href: profileHref(streamer)
    };
  }

  function stateHtml(key, fallback, icon = '♡', description = '', actionHtml = '') {
    return `
      <div class="list-item viewer-empty-state">
        <div class="item-icon">${api.escapeHtml(icon)}</div>
        <div class="item-content">
          <strong>${api.escapeHtml(t(key, {}, fallback))}</strong>
          ${description ? `<span>${api.escapeHtml(description)}</span>` : ''}
        </div>
        ${actionHtml}
      </div>
    `;
  }

  function avatarHtml(item) {
    if (item.imageUrl) return `<img src="${api.escapeHtml(item.imageUrl)}" alt="" loading="lazy" />`;
    return `<span>${api.escapeHtml(Array.from(item.name || '?')[0] || '?')}</span>`;
  }

  function render(items = favorites, error = lastError) {
    const badge = $('favoritesCountBadge');
    if (error) {
      if (badge) badge.textContent = '0';
      list.innerHTML = stateHtml('favorites.error', '즐겨찾기 목록을 불러오지 못했습니다.', '!', error.message || '');
      return;
    }

    const normalized = items.map(normalizeFavorite).filter((item) => item.streamerId || item.href);
    if (badge) badge.textContent = numberText(normalized.length);
    if (!normalized.length) {
      const actionHtml = `<div class="item-actions"><a class="primary-btn" href="index.html">${api.escapeHtml(t('favorites.browseStreamers', {}, '스트리머 둘러보기'))}</a></div>`;
      list.innerHTML = stateHtml('favorites.empty', '아직 즐겨찾기한 스트리머가 없습니다.', '♡', t('favorites.emptyHint', {}, '공개 프로필에서 즐겨찾기를 추가하면 이곳에 표시됩니다.'), actionHtml);
      return;
    }

    list.innerHTML = normalized.map((item) => `
      <article class="dashboard-favorite-card" data-favorite-card="${api.escapeHtml(item.streamerId || item.favoriteId)}">
        <div class="dashboard-favorite-avatar">${avatarHtml(item)}</div>
        <div class="dashboard-favorite-body">
          <strong>${api.escapeHtml(item.name)}</strong>
          <span>${api.escapeHtml([item.handle ? `@${item.handle}` : '', item.mainContent].filter(Boolean).join(' · '))}</span>
          ${item.liveStatus ? `<span>${api.escapeHtml(item.liveStatus)}</span>` : ''}
        </div>
        <div class="viewer-card-actions">
          <a class="ghost-btn" href="${api.escapeHtml(item.href)}">${api.escapeHtml(t('dashboard.followedViewProfile', {}, '프로필 보기'))}</a>
          <button class="danger-btn" type="button" data-remove-favorite="${api.escapeHtml(item.streamerId)}">${api.escapeHtml(t('favorites.remove', {}, '즐겨찾기 해제'))}</button>
        </div>
      </article>
    `).join('');
  }

  async function loadFavorites(showDone = false) {
    lastError = null;
    list.innerHTML = stateHtml('favorites.loading', '즐겨찾기 목록을 불러오는 중입니다.', '♡');
    try {
      const payload = await api.getJson('/api/public/favorites');
      favorites = Array.isArray(payload?.items) ? payload.items : [];
      render(favorites, null);
      if (showDone) api.showToast(t('favorites.refreshDone', {}, '즐겨찾기 목록을 새로고침했습니다.'));
    } catch (error) {
      favorites = [];
      lastError = error;
      render([], error);
    }
  }

  async function removeFavorite(streamerId) {
    if (!streamerId) return;
    try {
      await api.deleteJson(`/api/public/favorites/${encodeURIComponent(streamerId)}`);
      favorites = favorites.filter((item) => String(streamerFromFavorite(item).id || '') !== String(streamerId));
      render(favorites, null);
      api.showToast(t('favorites.removeDone', {}, '즐겨찾기를 해제했습니다.'));
    } catch (error) {
      api.showToast(error.message || t('favorites.removeFailed', {}, '즐겨찾기를 해제하지 못했습니다.'));
    }
  }

  $('refreshFavoritesButton')?.addEventListener('click', () => loadFavorites(true));
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-favorite]');
    if (!button) return;
    button.disabled = true;
    Promise.resolve(removeFavorite(button.dataset.removeFavorite)).finally(() => {
      button.disabled = false;
    });
  });

  document.addEventListener('seiga:i18n-change', () => render(favorites, lastError));
  await loadFavorites(false);
})();
