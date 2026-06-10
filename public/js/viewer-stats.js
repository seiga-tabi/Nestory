(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const list = document.getElementById('viewerChannelList');
  if (!api || !list) return;

  const me = await api.redirectIfUnauthorized('login.html?next=viewer-stats.html');
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let statsPayload = null;
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

  function formatDate(value) {
    if (!value) return t('adminAccess.noDate', {}, '날짜 없음');
    try {
      return new Date(value).toLocaleString(localeTag(), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_error) {
      return t('adminAccess.noDate', {}, '날짜 없음');
    }
  }

  function channelName(channel = {}) {
    return safeText(channel.displayName || channel.streamerName || channel.name || channel.channelName || channel.login, t('viewerStats.unknownChannel', {}, '이름 없는 방송'));
  }

  function channelHref(channel = {}) {
    if (channel.profileUrl || channel.detailUrl) return channel.profileUrl || channel.detailUrl;
    if (channel.slug) return `streamer-detail.html?slug=${encodeURIComponent(channel.slug)}`;
    return '';
  }

  function normalizeChannel(channel = {}) {
    return {
      id: channel.id || channel.streamerId || channel.channelId || channel.slug || channel.login || '',
      name: channelName(channel),
      handle: safeText(channel.handle || channel.username || channel.login || channel.twitchLogin, '').replace(/^@/, ''),
      imageUrl: safeText(channel.avatarUrl || channel.profileImage || channel.profileImageUrl || channel.thumbnailUrl || channel.coverImageUrl || '', ''),
      messageCount: Number(channel.messageCount || channel.messages || channel.totalMessages || 0),
      lastChattedAt: channel.lastChattedAt || channel.lastMessageAt || channel.updatedAt || null,
      href: channelHref(channel)
    };
  }

  function channelAvatarHtml(channel = {}) {
    if (channel.imageUrl) {
      return `<img src="${api.escapeHtml(channel.imageUrl)}" alt="" loading="lazy" />`;
    }
    return `<span>${api.escapeHtml(Array.from(channel.name || '?')[0] || '?')}</span>`;
  }

  function stateHtml(key, fallback, icon = '•', description = '') {
    return `
      <div class="list-item">
        <div class="item-icon">${api.escapeHtml(icon)}</div>
        <div class="item-content">
          <strong>${api.escapeHtml(t(key, {}, fallback))}</strong>
          ${description ? `<span>${api.escapeHtml(description)}</span>` : ''}
        </div>
      </div>
    `;
  }

  function setSummary(payload = {}) {
    const summary = payload.summary || {};
    const channels = Array.isArray(payload.channels) ? payload.channels.map(normalizeChannel) : [];
    const top = summary.topChannel ? normalizeChannel(summary.topChannel) : channels.slice().sort((a, b) => b.messageCount - a.messageCount)[0];
    const recent = channels.slice().sort((a, b) => new Date(b.lastChattedAt || 0) - new Date(a.lastChattedAt || 0))[0];
    $('viewerTotalMessages').textContent = numberText(summary.totalMessages || channels.reduce((sum, item) => sum + item.messageCount, 0));
    $('viewerActiveChannels').textContent = numberText(summary.activeChannels || channels.length);
    $('viewerTopChannel').textContent = top ? top.name : '-';
    $('viewerTopChannelNote').textContent = top ? t('viewerStats.messageCount', { count: numberText(top.messageCount) }, `${numberText(top.messageCount)}개 메시지`) : '-';
    $('viewerRecentChannel').textContent = recent ? recent.name : '-';
    $('viewerRecentChannelNote').textContent = recent ? formatDate(recent.lastChattedAt) : '-';
    $('viewerChannelCountBadge').textContent = numberText(channels.length);
  }

  function render(payload = statsPayload, error = lastError) {
    const state = $('viewerStatsState');
    if (error) {
      setSummary({ summary: {}, channels: [] });
      list.innerHTML = stateHtml('viewerStats.error', '채팅 통계를 불러오지 못했습니다.', '!', error.message || '');
      if (state) state.innerHTML = '';
      return;
    }

    const channels = Array.isArray(payload?.channels) ? payload.channels.map(normalizeChannel) : [];
    setSummary(payload || {});
    if (state) {
      const note = safeText(payload?.note, t('viewerStats.collectionNote', {}, '이 통계는 Nestory가 수집을 시작한 이후의 데이터만 표시됩니다.'));
      state.innerHTML = `<div class="status-box"><strong>${api.escapeHtml(t('viewerStats.collectionNoteTitle', {}, '수집 범위 안내'))}</strong><span>${api.escapeHtml(note)}</span></div>`;
    }

    if (!channels.length) {
      list.innerHTML = stateHtml('viewerStats.empty', '아직 표시할 채팅 통계가 없습니다.', '0', t('viewerStats.emptyHint', {}, 'Nestory가 채팅 이벤트를 수집하기 시작하면 채널별 통계가 표시됩니다.'));
      return;
    }

    list.innerHTML = channels.map((channel) => `
      <div class="list-item viewer-channel-item">
        <div class="viewer-channel-avatar">${channelAvatarHtml(channel)}</div>
        <div class="item-content">
          <strong>${api.escapeHtml(channel.name)}</strong>
          <span>${api.escapeHtml([channel.handle ? `@${channel.handle}` : '', t('viewerStats.messageCount', { count: numberText(channel.messageCount) }, `${numberText(channel.messageCount)}개 메시지`)].filter(Boolean).join(' · '))}</span>
          <span>${api.escapeHtml(t('viewerStats.lastChattedAt', { date: formatDate(channel.lastChattedAt) }, `마지막 채팅: ${formatDate(channel.lastChattedAt)}`))}</span>
        </div>
        ${channel.href ? `<div class="item-actions"><a class="ghost-btn" href="${api.escapeHtml(channel.href)}">${api.escapeHtml(t('dashboard.followedViewProfile', {}, '프로필 보기'))}</a></div>` : ''}
      </div>
    `).join('');
  }

  async function loadStats(showDone = false) {
    lastError = null;
    list.innerHTML = stateHtml('viewerStats.loading', '채팅 통계를 불러오는 중입니다.', '…');
    try {
      statsPayload = await api.getJson('/api/viewer-stats/me');
      render(statsPayload, null);
      if (showDone) api.showToast(t('viewerStats.refreshDone', {}, '채팅 통계를 새로고침했습니다.'));
    } catch (error) {
      statsPayload = null;
      lastError = error;
      render(null, error);
    }
  }

  $('refreshViewerStatsButton')?.addEventListener('click', () => loadStats(true));
  document.addEventListener('seiga:i18n-change', () => render(statsPayload, lastError));
  await loadStats(false);
})();
