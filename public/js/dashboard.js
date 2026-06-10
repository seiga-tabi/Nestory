(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  if (!api || !document.querySelector('.topbar')) return;

  const me = await api.redirectIfUnauthorized('login.html?next=dashboard.html');
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const roleState = normalizeRoleState(me);
  if (!roleState.canUseStreamerTools) {
    location.replace('viewer-stats.html');
    return;
  }

  let lastSummary = null;
  let lastError = null;
  let renderState = 'idle';
  let twitchStatus = null;
  let followedItems = [];
  let publicStreamers = [];
  let favoriteItems = [];
  const followedInitialLimit = 6;
  const followedExpanded = { registered: false, unregistered: false };

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function localeTag() {
    return window.SeigaI18n?.locale === 'ja' ? 'ja-JP' : 'ko-KR';
  }

  function numberText(value) {
    return Number(value || 0).toLocaleString(localeTag());
  }

  function translatedHtml(key, params = {}, fallback = key) {
    return api.escapeHtml(t(key, params, fallback));
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function roleOf(auth = {}) {
    const value = String(auth.role || auth.user?.role || auth.raw?.role || 'USER').toUpperCase();
    return value === 'VIEWER' ? 'USER' : value;
  }

  function normalizeRoleState(auth = {}) {
    const role = roleOf(auth);
    const isAdmin = role === 'ADMIN' || auth.isAdmin === true || auth.user?.isAdmin === true;
    const canUseStreamerTools = role === 'STREAMER'
      || role === 'ADMIN'
      || auth.user?.isStreamer === true
      || Boolean(auth.streamerProfile);
    return {
      role,
      isAdmin,
      canUseStreamerTools,
      user: auth.user || {},
      streamerProfile: auth.streamerProfile || null
    };
  }

  function userStorageKey(suffix) {
    const userKey = safeText(roleState.user.id || roleState.user.email, 'guest');
    return `seiga_dashboard_${suffix}_${userKey}`;
  }

  function buildTwitchUrl(intent = 'link') {
    const returnTo = encodeURIComponent('/dashboard.html?twitch=connected');
    return `/auth/twitch?intent=${encodeURIComponent(intent)}&returnTo=${returnTo}`;
  }

  function listStateHtml(key, fallback, icon = '•', description = '') {
    return `
      <div class="list-item">
        <div class="item-icon">${api.escapeHtml(icon)}</div>
        <div class="item-content">
          <strong data-i18n="${api.escapeHtml(key)}">${translatedHtml(key, {}, fallback)}</strong>
          ${description ? `<span>${api.escapeHtml(description)}</span>` : ''}
        </div>
      </div>
    `;
  }

  function renderListState(target, key, fallback, icon = '•', description = '') {
    if (!target) return;
    target.innerHTML = listStateHtml(key, fallback, icon, description);
  }

  function roleLabel(role = roleState.role) {
    if (role === 'ADMIN') return t('dashboard.roleAdmin', {}, '관리자');
    if (role === 'STREAMER') return t('dashboard.roleStreamer', {}, '스트리머');
    return t('dashboard.roleUser', {}, '일반 사용자');
  }

  function applyDashboardShell() {
    document.documentElement.classList.toggle('dashboard-streamer', roleState.canUseStreamerTools);

    document.querySelectorAll('[data-streamer-dashboard]').forEach((section) => {
      section.hidden = false;
    });

    const userPanel = $('userDashboardPanel');
    if (userPanel) userPanel.hidden = true;

    const followPanel = $('followedChannelsPanel');
    if (followPanel) followPanel.hidden = true;

    const roleBadge = $('dashboardUserRoleBadge');
    if (roleBadge) roleBadge.textContent = roleLabel().toUpperCase();

    const title = $('dashboardUserTitle');
    const text = $('dashboardUserText');
    if (title && text) {
      if (roleState.isAdmin) {
        title.textContent = t('dashboard.adminWelcomeTitle', {}, '관리자 대시보드');
        text.textContent = t('dashboard.adminWelcomeText', {}, '스트리머 등록 요청 관리와 일반 사용자 기능을 함께 사용할 수 있습니다.');
      } else if (roleState.canUseStreamerTools) {
        title.textContent = t('dashboard.streamerWelcomeTitle', {}, '스트리머 기능이 활성화되었습니다.');
        text.textContent = t('dashboard.streamerWelcomeText', {}, '프로필 카드, 방송 정보, 팬 카드와 일반 사용자 기능을 함께 사용할 수 있습니다.');
      } else {
        title.textContent = t('dashboard.userWelcomeTitle', {}, '일반 사용자 화면');
        text.textContent = t('dashboard.userWelcomeText', {}, 'Twitch 계정을 연결하고 스트리머 등록 신청을 준비할 수 있습니다.');
      }
    }
  }

  function renderDashboardProfileCard(summary = {}, options = {}) {
    const slot = $('dashboardProfileCardSlot');
    const renderer = window.SeigaProfileCard;
    if (!slot || !renderer) return;

    const profile = summary?.profile || {};
    const streamStatus = summary?.streamStatus || {};
    const isLive = Boolean(streamStatus.isLive);
    const statusText = options.loading
      ? t('common.loading', {}, '불러오는 중')
      : (isLive ? 'LIVE' : 'OFF');
    const bio = options.error
      ? safeText(options.message, t('dashboard.error', {}, '대시보드 데이터를 불러오지 못했습니다.'))
      : safeText(streamStatus.title || profile.subtitle || profile.description, t('dashboard.streamFallback', {}, '최근 방송 상태를 기준으로 표시합니다.'));

    slot.innerHTML = renderer.renderProfileCard(profile, {
      className: `dashboard-preview-card${options.loading ? ' profile-card--skeleton' : ''}`,
      slug: profile.slug || '',
      name: safeText(profile.name || profile.displayName, options.loading ? t('common.loading', {}, '불러오는 중입니다.') : t('dashboard.previewProfileFallback', {}, '공개 프로필')),
      handle: safeText(profile.handle || profile.username, t('dashboard.previewMetaFallback', {}, '프로필 정보를 불러왔습니다.')),
      bio,
      imageUrl: profile.avatarUrl || profile.profileImage || profile.coverImage || '',
      verified: profile.isPublic !== false,
      isLive,
      tags: [profile.mainContent, profile.language].filter(Boolean),
      stats: [
        { icon: '♡', value: options.loading ? '-' : numberText(summary.todayViews), label: t('dashboard.todayVisitors', {}, '오늘 방문자'), format: false },
        { icon: '▣', value: options.loading ? '-' : numberText(summary.fanCardCount), label: t('profileCard.statFanCards', {}, '팬 카드'), format: false },
        { icon: '●', value: statusText, label: t('profileCard.statStatus', {}, '상태'), format: false }
      ],
      actions: [
        { label: t('dashboard.editProfileCard', {}, '프로필 카드 수정'), icon: '+', href: 'profile-card.html' }
      ]
    });
  }

  function renderStreamerLoading() {
    renderState = 'loading';
    lastError = null;
    $('dashboardError')?.setAttribute('hidden', '');
    $('todayViewsValue').textContent = '-';
    $('fanCardCountValue').textContent = '-';
    $('publicProfileStatusValue').textContent = '-';
    $('cardCompletionValue').textContent = '-';
    $('todayViewsNote').textContent = t('dashboard.loadingData', {}, '데이터를 불러오는 중입니다.');
    $('fanCardCountNote').textContent = t('dashboard.loadingData', {}, '데이터를 불러오는 중입니다.');
    $('publicProfileStatusNote').textContent = t('dashboard.loadingData', {}, '데이터를 불러오는 중입니다.');
    $('cardCompletionNote').textContent = t('dashboard.loadingData', {}, '데이터를 불러오는 중입니다.');
    $('dashboardHeroStatus').innerHTML = `<span class="dot"></span>${translatedHtml('dashboard.statusLoading', {}, 'LOADING')}`;
    $('dashboardHeroTitle').textContent = t('dashboard.heroLoadingTitle', {}, '대시보드 데이터를 불러오는 중입니다.');
    $('dashboardHeroText').textContent = t('dashboard.heroLoadingText', {}, '잠시만 기다려주세요.');
    renderDashboardProfileCard({}, { loading: true });
    $('recentActivityBadge').textContent = t('dashboard.statusLoading', {}, 'LOADING');
    renderListState($('recentActivityList'), 'dashboard.recentActivityLoading', '최근 활동을 불러오는 중입니다.');
    renderListState($('recentFanCardsList'), 'dashboard.fanCardsLoading', '팬 카드를 불러오는 중입니다.');
  }

  function renderStreamerEmpty() {
    renderListState($('recentActivityList'), 'dashboard.activityEmpty', '표시할 최근 활동이 없습니다.');
    renderListState($('recentFanCardsList'), 'dashboard.fanCardsEmpty', '아직 팬 카드가 없습니다.');
  }

  function renderStreamerError(error) {
    renderState = 'error';
    lastError = error;
    const message = error?.message || t('dashboard.error', {}, '대시보드 데이터를 불러오지 못했습니다.');
    const errorBox = $('dashboardError');
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = message;
    }
    $('dashboardHeroStatus').innerHTML = `<span class="dot"></span>${translatedHtml('dashboard.statusError', {}, 'ERROR')}`;
    $('dashboardHeroTitle').textContent = t('dashboard.error', {}, '대시보드 데이터를 불러오지 못했습니다.');
    $('dashboardHeroText').textContent = message;
    renderDashboardProfileCard({}, { error: true, message });
    renderListState($('recentActivityList'), 'dashboard.error', '대시보드 데이터를 불러오지 못했습니다.');
    renderListState($('recentFanCardsList'), 'dashboard.fanCardsError', '팬 카드 데이터를 불러오지 못했습니다.');
  }

  function renderRecentFanCards(items = []) {
    const list = $('recentFanCardsList');
    if (!list) return;
    if (!items.length) {
      renderListState(list, 'dashboard.fanCardsEmpty', '아직 팬 카드가 없습니다.');
      return;
    }
    list.innerHTML = items.map((card) => `
      <div class="list-item">
        <div class="item-icon">${api.escapeHtml(card.emoji || '💌')}</div>
        <div class="item-content">
          <strong>${api.escapeHtml(card.message || t('dashboard.fanCardNoMessage', {}, '내용 없는 팬 카드'))}</strong>
          <span>${api.escapeHtml(card.senderName || t('dashboard.anonymousFan', {}, '익명 팬'))} · ${api.escapeHtml(card.status || t('dashboard.noStatus', {}, '상태 없음'))}</span>
        </div>
      </div>
    `).join('');
  }

  function renderRecentActivity(items = []) {
    const list = $('recentActivityList');
    if (!list) return;
    $('recentActivityBadge').textContent = t('dashboard.countItems', { count: numberText(items.length) }, `${items.length}개`);
    if (!items.length) {
      renderListState(list, 'dashboard.activityEmpty', '표시할 최근 활동이 없습니다.');
      return;
    }
    list.innerHTML = items.map((item) => `
      <div class="list-item">
        <div class="item-icon">•</div>
        <div class="item-content">
          <strong>${api.escapeHtml(item.label || t('dashboard.activityFallback', {}, '활동'))}</strong>
          <span>${api.escapeHtml(item.value || '')}</span>
        </div>
      </div>
    `).join('');
  }

  function renderStreamerSummary(summary) {
    renderState = 'summary';
    lastSummary = summary;
    lastError = null;
    $('dashboardError')?.setAttribute('hidden', '');

    $('todayViewsValue').textContent = numberText(summary.todayViews);
    $('fanCardCountValue').textContent = numberText(summary.fanCardCount);
    $('publicProfileStatusValue').textContent = summary.publicProfileStatus || t('dashboard.unknownStatus', {}, 'UNKNOWN');
    $('cardCompletionValue').textContent = `${Number(summary.cardCompletion || 0)}%`;
    $('todayViewsNote').textContent = t('dashboard.todayViewsNote', {}, '오늘 DB 집계 기준');
    $('fanCardCountNote').textContent = t('dashboard.fanCardCountNote', {}, '전체 팬 카드 기준');
    $('publicProfileStatusNote').textContent = t('dashboard.publicProfileStatusNote', {}, '공개 프로필 상태');
    $('cardCompletionNote').textContent = t('dashboard.cardCompletionNote', {}, '링크, 일정, 이미지 기준');

    const isLive = Boolean(summary.streamStatus?.isLive);
    $('dashboardHeroStatus').className = `pill ${isLive ? 'live' : 'warn'}`;
    $('dashboardHeroStatus').innerHTML = `<span class="dot"></span>${translatedHtml(isLive ? 'common.live' : 'common.offline', {}, isLive ? 'LIVE' : 'OFFLINE')}`;
    $('dashboardHeroTitle').textContent = isLive
      ? t('dashboard.heroLiveTitle', {}, '현재 방송 중입니다.')
      : t('dashboard.heroOfflineTitle', {}, '현재 방송은 오프라인입니다.');
    $('dashboardHeroText').textContent = summary.streamStatus?.title || t('dashboard.streamFallback', {}, '최근 방송 상태를 기준으로 표시합니다.');
    renderDashboardProfileCard(summary);

    renderRecentFanCards(summary.recentFanCards || []);
    renderRecentActivity(summary.recentActivity || []);
    if (!(summary.recentFanCards || []).length && !(summary.recentActivity || []).length) renderStreamerEmpty();
  }

  async function loadSummary(showDone = false) {
    renderStreamerLoading();
    try {
      const summary = await api.getJson('/api/dashboard/summary');
      renderStreamerSummary(summary);
      if (showDone) api.showToast(t('dashboard.refreshDone', {}, '대시보드 데이터를 새로고침했습니다.'));
    } catch (error) {
      renderStreamerError(error);
    }
  }

  function requestStatusFromStorage() {
    return window.localStorage.getItem(userStorageKey('streamer_request_status')) || '';
  }

  function saveRequestStatus(status) {
    window.localStorage.setItem(userStorageKey('streamer_request_status'), status);
  }

  function renderUserStatus() {
    const list = $('dashboardUserStatusList');
    if (!list) return;

    const account = roleState.user.email || t('dashboard.noEmail', {}, '이메일 없음');
    const requestStatus = requestStatusFromStorage();
    const streamerStatus = roleState.canUseStreamerTools
      ? t('dashboard.streamerApprovedShort', {}, '스트리머 승인됨')
      : requestStatus === 'pending'
        ? t('dashboard.streamerPendingShort', {}, '승인 대기 중')
        : requestStatus === 'rejected'
          ? t('dashboard.streamerRejectedShort', {}, '재신청 가능')
          : t('dashboard.streamerNotRequestedShort', {}, '신청 전');

    list.innerHTML = `
      <div class="list-item">
        <div class="item-icon">ID</div>
        <div class="item-content">
          <strong>${api.escapeHtml(roleState.user.displayName || roleLabel())}</strong>
          <span>${api.escapeHtml(account)}</span>
        </div>
      </div>
      <div class="list-item">
        <div class="item-icon">R</div>
        <div class="item-content">
          <strong>${api.escapeHtml(roleLabel())}</strong>
          <span>${api.escapeHtml(streamerStatus)}</span>
        </div>
      </div>
    `;
  }

  function renderTwitchLoading() {
    const status = $('dashboardTwitchStatus');
    if (!status) return;
    $('dashboardTwitchBadge').textContent = t('dashboard.statusLoading', {}, '불러오는 중');
    renderListState(status, 'dashboard.twitchLoading', 'Twitch 연결 상태를 확인하는 중입니다.', 'T');
  }

  function renderTwitchStatus(statusPayload = null, error = null) {
    const target = $('dashboardTwitchStatus');
    const badge = $('dashboardTwitchBadge');
    const button = $('dashboardTwitchConnectButton');
    if (!target || !button) return;

    if (error) {
      if (badge) badge.textContent = t('dashboard.statusError', {}, '오류');
      const message = error.message || t('dashboard.twitchStatusError', {}, 'Twitch 상태를 확인하지 못했습니다.');
      target.innerHTML = listStateHtml('dashboard.twitchStatusError', 'Twitch 상태를 확인하지 못했습니다.', '!', message);
      button.textContent = t('dashboard.twitchConnect', {}, 'Twitch 연결');
      button.dataset.intent = 'link';
      return;
    }

    const connected = Boolean(statusPayload?.connected);
    const configured = statusPayload?.configured !== false;
    if (badge) {
      badge.textContent = connected
        ? t('dashboard.twitchConnectedBadge', {}, '연결됨')
        : t('dashboard.twitchDisconnectedBadge', {}, '미연결');
    }
    button.textContent = connected
      ? t('dashboard.twitchReconnect', {}, 'Twitch 재연동')
      : t('dashboard.twitchConnect', {}, 'Twitch 연결');
    button.dataset.intent = connected ? 'reconnect' : 'link';

    if (!configured) {
      target.innerHTML = listStateHtml('dashboard.twitchNotConfigured', 'Twitch 연동 설정이 완료되지 않았습니다.', '!', t('dashboard.twitchAskAdmin', {}, '관리자에게 Twitch OAuth 설정을 요청해주세요.'));
      return;
    }

    if (connected) {
      target.innerHTML = `
        <div class="list-item">
          <div class="item-icon">T</div>
          <div class="item-content">
            <strong>${api.escapeHtml(statusPayload.twitchLogin || t('dashboard.twitchConnected', {}, 'Twitch 연결됨'))}</strong>
            <span>${api.escapeHtml(t('dashboard.twitchConnectedText', {}, '팔로우 목록을 불러올 수 있습니다.'))}</span>
          </div>
        </div>
      `;
      return;
    }

    target.innerHTML = listStateHtml('dashboard.twitchDisconnected', 'Twitch 계정이 아직 연결되지 않았습니다.', 'T', t('dashboard.twitchDisconnectedText', {}, '연결 후 팔로우 목록을 확인할 수 있습니다.'));
  }

  function renderRequestStatus() {
    const status = $('streamerRequestStatus');
    const badge = $('streamerRequestBadge');
    const form = $('streamerRequestForm');
    if (!status || !form) return;

    if (roleState.canUseStreamerTools) {
      if (badge) badge.textContent = t('dashboard.requestApprovedBadge', {}, 'APPROVED');
      form.hidden = true;
      status.innerHTML = `
        <div class="status-box is-approved">
          <strong>${api.escapeHtml(t('dashboard.requestApprovedTitle', {}, '스트리머 권한이 활성화되었습니다.'))}</strong>
          <span>${api.escapeHtml(t('dashboard.requestApprovedText', {}, '프로필 카드와 방송 관리 메뉴를 사용할 수 있습니다.'))}</span>
        </div>
      `;
      return;
    }

    const requestStatus = requestStatusFromStorage();
    if (requestStatus === 'pending') {
      if (badge) badge.textContent = t('dashboard.requestPendingBadge', {}, 'PENDING');
      form.hidden = true;
      status.innerHTML = `
        <div class="status-box is-pending">
          <strong>${api.escapeHtml(t('dashboard.requestPendingTitle', {}, '스트리머 등록 신청이 접수되었습니다.'))}</strong>
          <span>${api.escapeHtml(t('dashboard.requestPendingText', {}, '관리자 승인 전까지 중복 신청은 막아두었습니다.'))}</span>
        </div>
      `;
      return;
    }

    if (requestStatus === 'rejected') {
      if (badge) badge.textContent = t('dashboard.requestRejectedBadge', {}, 'RETRY');
      form.hidden = false;
      status.innerHTML = `
        <div class="status-box is-error">
          <strong>${api.escapeHtml(t('dashboard.requestRejectedTitle', {}, '이전 스트리머 등록 신청이 거절되었습니다.'))}</strong>
          <span>${api.escapeHtml(t('dashboard.requestRejectedText', {}, '일반 사용자 기능은 계속 사용할 수 있으며, 내용을 보완해 다시 신청할 수 있습니다.'))}</span>
        </div>
      `;
      return;
    }

    if (badge) badge.textContent = t('dashboard.requestReadyBadge', {}, 'READY');
    form.hidden = false;
    status.innerHTML = `
      <div class="status-box">
        <strong>${api.escapeHtml(t('dashboard.requestReadyTitle', {}, '스트리머 등록 신청을 제출할 수 있습니다.'))}</strong>
        <span>${api.escapeHtml(t('dashboard.requestReadyText', {}, 'Twitch ID와 활동 내용을 입력하면 관리자 검토로 넘어갑니다.'))}</span>
      </div>
    `;
  }

  function prefillRequestForm() {
    const name = $('requestName');
    const twitchId = $('requestTwitchId');
    if (name && !name.value) name.value = roleState.user.displayName || '';
    if (twitchId && !twitchId.value) twitchId.value = roleState.user.twitchLogin || twitchStatus?.twitchLogin || '';
  }

  function followedItemsFromPayload(payload = {}) {
    const items = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
    return items;
  }

  function normalizeFollowItem(item = {}) {
    const login = safeText(item.broadcaster_login || item.broadcasterLogin || item.login || item.username || item.twitchLogin || item.handle).replace(/^@/, '');
    const name = safeText(item.broadcaster_name || item.broadcasterName || item.displayName || item.name || login, t('dashboard.followedUnknownName', {}, '이름 없는 채널'));
    const game = safeText(item.game_name || item.category || item.mainContent || item.description, t('dashboard.followedNoCategory', {}, '카테고리 정보 없음'));
    const apiMatch = item.registeredProfile || item.profile || null;
    const publicMatch = apiMatch || publicStreamers.find((streamer) => {
      const candidates = [
        streamer.handle,
        streamer.username,
        streamer.twitchLogin,
        streamer.name,
        streamer.displayName
      ].map((value) => safeText(value).replace(/^@/, '').toLowerCase()).filter(Boolean);
      return login && candidates.includes(login.toLowerCase());
    });

    return {
      login,
      name,
      game,
      publicMatch,
      isRegistered: item.isRegistered === true || Boolean(publicMatch)
    };
  }

  function publicProfileHref(profile = {}) {
    if (profile.profileUrl || profile.detailUrl) return profile.profileUrl || profile.detailUrl;
    if (profile.slug) return `streamer-detail.html?slug=${encodeURIComponent(profile.slug)}`;
    return '';
  }

  function normalizeFavoriteItem(item = {}) {
    const streamer = item.streamer || item.streamerProfile || item.profile || item;
    return {
      id: item.id || streamer.id || streamer.slug,
      name: safeText(streamer.name || streamer.displayName, t('index.noName', {}, '이름 없는 스트리머')),
      handle: safeText(streamer.handle || streamer.username, ''),
      mainContent: safeText(streamer.mainContent || streamer.category, t('profileCard.noContent', {}, '콘텐츠 미등록')),
      imageUrl: safeText(streamer.avatarUrl || streamer.profileImage || streamer.coverImageUrl || streamer.coverImage, ''),
      href: publicProfileHref(streamer)
    };
  }

  function favoriteAvatarHtml(item) {
    if (item.imageUrl) {
      return `<img src="${api.escapeHtml(item.imageUrl)}" alt="" loading="lazy" />`;
    }
    return `<span>${api.escapeHtml(Array.from(item.name || '?')[0] || '?')}</span>`;
  }

  function renderFavoriteStreamers(items = favoriteItems, error = null) {
    const list = $('favoriteStreamersList');
    const badge = $('favoriteStreamersBadge');
    if (!list) return;
    if (error) {
      if (badge) badge.textContent = '0';
      list.innerHTML = listStateHtml('dashboard.favoriteStreamersError', '즐겨찾기 목록을 불러오지 못했습니다.', '!', error.message || '');
      return;
    }

    const normalized = items.map(normalizeFavoriteItem).filter((item) => item.href);
    if (badge) badge.textContent = numberText(normalized.length);
    if (!normalized.length) {
      list.innerHTML = listStateHtml('dashboard.favoriteStreamersEmpty', '아직 즐겨찾기한 스트리머가 없습니다.', '♡', t('dashboard.favoriteStreamersEmptyHint', {}, '공개 프로필에서 즐겨찾기를 추가하면 이곳에 표시됩니다.'));
      return;
    }

    list.innerHTML = normalized.map((item) => `
      <article class="dashboard-favorite-card">
        <div class="dashboard-favorite-avatar">${favoriteAvatarHtml(item)}</div>
        <div class="dashboard-favorite-body">
          <strong>${api.escapeHtml(item.name)}</strong>
          <span>${api.escapeHtml([item.handle ? `@${item.handle.replace(/^@/, '')}` : '', item.mainContent].filter(Boolean).join(' · '))}</span>
        </div>
        <a class="ghost-btn" href="${api.escapeHtml(item.href)}">${api.escapeHtml(t('dashboard.followedViewProfile', {}, '프로필 보기'))}</a>
      </article>
    `).join('');
  }

  function renderFollowedChannels(items = followedItems) {
    const registeredList = $('registeredFollowedChannelsList');
    const unregisteredList = $('unregisteredFollowedChannelsList');
    const state = $('followedChannelsState');
    const badge = $('followedChannelsBadge');
    if (!registeredList || !unregisteredList) return;
    const normalized = items.map(normalizeFollowItem);
    const registered = normalized.filter((item) => item.isRegistered);
    const unregistered = normalized.filter((item) => !item.isRegistered);
    if (badge) badge.textContent = numberText(normalized.length);
    $('followedRegisteredBadge').textContent = numberText(registered.length);
    $('followedUnregisteredBadge').textContent = numberText(unregistered.length);
    if (state) state.innerHTML = '';

    if (!twitchStatus?.connected) {
      if (state) {
        state.innerHTML = `
          <div class="status-box">
            <strong>${api.escapeHtml(t('dashboard.followedNeedsTwitch', {}, 'Twitch 계정을 연결하면 팔로우 목록을 확인할 수 있습니다.'))}</strong>
            <span>${api.escapeHtml(t('dashboard.twitchDisconnectedText', {}, '연결 후 팔로우 목록을 확인할 수 있습니다.'))}</span>
          </div>
        `;
      }
      renderListState(registeredList, 'dashboard.followedNeedsTwitch', 'Twitch 계정을 연결하면 팔로우 목록을 확인할 수 있습니다.', 'T');
      renderListState(unregisteredList, 'dashboard.followedNeedsTwitch', 'Twitch 계정을 연결하면 팔로우 목록을 확인할 수 있습니다.', 'T');
      return;
    }

    if (!normalized.length) {
      renderListState(registeredList, 'dashboard.followedRegisteredEmpty', 'Nestory에 등록된 팔로우 스트리머가 아직 없습니다.', '0');
      renderListState(unregisteredList, 'dashboard.followedUnregisteredEmpty', '미등록 팔로우 스트리머가 없습니다.', '0');
      return;
    }

    function itemHtml(item, options = {}) {
      const href = publicProfileHref(item.publicMatch);
      const action = href
        ? `<span class="badge dashboard-follow-status is-registered">${api.escapeHtml(t('dashboard.followedRegistered', {}, '등록됨'))}</span><a class="ghost-btn" href="${api.escapeHtml(href)}">${api.escapeHtml(t('dashboard.followedViewProfile', {}, '프로필 보기'))}</a>`
        : `<span class="badge dashboard-follow-status is-unregistered">${api.escapeHtml(t('dashboard.followedUnregisteredShort', {}, '미등록'))}</span>`;
      return `
        <div class="list-item dashboard-follow-item">
          <div class="item-icon">T</div>
          <div class="item-content">
            <strong>${api.escapeHtml(item.name)}</strong>
            <span>${api.escapeHtml(item.login ? `@${item.login} · ${item.game}` : item.game)}</span>
            ${options.unregistered ? `<span>${api.escapeHtml(t('dashboard.followedUnregisteredText', {}, 'Nestory에 아직 등록되지 않았습니다.'))}</span>` : ''}
          </div>
          <div class="item-actions">${action}</div>
        </div>
      `;
    }

    function groupHtml(groupItems, groupKey, options = {}) {
      if (!groupItems.length) {
        return options.emptyHtml;
      }
      const expanded = Boolean(followedExpanded[groupKey]);
      const visible = expanded ? groupItems : groupItems.slice(0, followedInitialLimit);
      const hiddenCount = Math.max(groupItems.length - visible.length, 0);
      const button = groupItems.length > followedInitialLimit
        ? `<button class="ghost-btn follow-toggle" type="button" data-follow-toggle="${api.escapeHtml(groupKey)}">${api.escapeHtml(expanded ? t('dashboard.followedShowLess', {}, '접기') : t('dashboard.followedShowMore', { count: hiddenCount }, `더 보기 (${hiddenCount})`))}</button>`
        : '';
      return `${visible.map((item) => itemHtml(item, options)).join('')}${button}`;
    }

    registeredList.innerHTML = groupHtml(registered, 'registered', {
      emptyHtml: listStateHtml('dashboard.followedRegisteredEmpty', 'Nestory에 등록된 팔로우 스트리머가 아직 없습니다.', '0')
    });
    unregisteredList.innerHTML = groupHtml(unregistered, 'unregistered', {
      unregistered: true,
      emptyHtml: listStateHtml('dashboard.followedUnregisteredEmpty', '미등록 팔로우 스트리머가 없습니다.', '0')
    });
  }

  async function loadPublicStreamers() {
    try {
      const payload = await api.getJson('/api/public/streamers');
      publicStreamers = Array.isArray(payload?.items) ? payload.items : [];
    } catch {
      publicStreamers = [];
    }
  }

  async function loadTwitchStatus() {
    renderTwitchLoading();
    try {
      twitchStatus = await api.getJson('/api/twitch/status');
      renderTwitchStatus(twitchStatus);
      prefillRequestForm();
    } catch (error) {
      twitchStatus = null;
      renderTwitchStatus(null, error);
    }
  }

  async function loadFollowedChannels(showDone = false) {
    renderListState($('registeredFollowedChannelsList'), 'dashboard.followedLoading', '팔로우 목록을 불러오는 중입니다.', 'T');
    renderListState($('unregisteredFollowedChannelsList'), 'dashboard.followedLoading', '팔로우 목록을 불러오는 중입니다.', 'T');
    const state = $('followedChannelsState');
    if (state) state.innerHTML = '';
    try {
      if (!twitchStatus?.connected) {
        renderFollowedChannels([]);
        return;
      }
      const payload = await api.getJson('/api/twitch/followed-channels');
      followedItems = followedItemsFromPayload(payload);
      renderFollowedChannels(followedItems);
      if (showDone) api.showToast(t('dashboard.followedRefreshDone', {}, '팔로우 목록을 새로고침했습니다.'));
    } catch (error) {
      const code = String(error?.payload?.code || '').toUpperCase();
      const needsReconnect = error?.payload?.needsReconnect === true
        || code === 'TWITCH_SCOPE_REQUIRED'
        || code === 'TWITCH_TOKEN_REQUIRED';
      const message = needsReconnect
        ? t('dashboard.followedTokenRequired', {}, 'Twitch 재연동 후 팔로우 목록을 확인할 수 있습니다.')
        : error.message || t('dashboard.followedError', {}, '팔로우 목록을 불러오지 못했습니다.');
      if (state) {
        state.innerHTML = `
          <div class="status-box is-error">
            <strong>${api.escapeHtml(needsReconnect ? t('dashboard.followedReconnectTitle', {}, 'Twitch 팔로우 권한이 필요합니다.') : t('dashboard.followedError', {}, '팔로우 목록을 불러오지 못했습니다.'))}</strong>
            <span>${api.escapeHtml(message)}</span>
            ${needsReconnect ? `<div class="hero-actions"><button class="primary-btn" type="button" data-follow-reconnect>${api.escapeHtml(t('dashboard.twitchReconnect', {}, 'Twitch 재연동'))}</button></div>` : ''}
          </div>
        `;
      }
      renderListState($('registeredFollowedChannelsList'), 'dashboard.followedError', '팔로우 목록을 불러오지 못했습니다.', '!');
      renderListState($('unregisteredFollowedChannelsList'), 'dashboard.followedError', '팔로우 목록을 불러오지 못했습니다.', '!');
      followedItems = [];
      $('followedChannelsBadge').textContent = '0';
      $('followedRegisteredBadge').textContent = '0';
      $('followedUnregisteredBadge').textContent = '0';
    }
  }

  async function loadFavoriteStreamers() {
    const list = $('favoriteStreamersList');
    if (list) {
      list.innerHTML = listStateHtml('dashboard.favoriteStreamersLoading', '즐겨찾기 목록을 불러오는 중입니다.', '♡');
    }
    try {
      const payload = await api.getJson('/api/public/favorites');
      favoriteItems = Array.isArray(payload?.items) ? payload.items : [];
      renderFavoriteStreamers(favoriteItems);
    } catch (error) {
      favoriteItems = [];
      renderFavoriteStreamers([], error);
    }
  }

  async function refreshUserDashboard(showDone = false) {
    renderUserStatus();
    renderRequestStatus();
    await loadFavoriteStreamers();
    await loadTwitchStatus();
    await loadPublicStreamers();
    await loadFollowedChannels(false);
    if (showDone) api.showToast(t('dashboard.refreshDone', {}, '대시보드 데이터를 새로고침했습니다.'));
  }

  function composeRequestMessage() {
    const parts = [
      [t('dashboard.requestMainContent', {}, '주 콘텐츠'), $('requestMainContent')?.value],
      [t('dashboard.requestBio', {}, '자기소개'), $('requestBio')?.value],
      [t('dashboard.requestReason', {}, '신청 사유'), $('requestReason')?.value]
    ]
      .map(([label, value]) => {
        const text = safeText(value);
        return text ? `${label}: ${text}` : '';
      })
      .filter(Boolean);
    return parts.join('\n');
  }

  async function submitStreamerRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = $('submitStreamerRequestButton');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = t('dashboard.submittingStreamerRequest', {}, '신청 중...');

    const twitchId = safeText($('requestTwitchId')?.value).replace(/^@/, '');
    const twitchUrl = twitchId ? `https://twitch.tv/${encodeURIComponent(twitchId)}` : null;

    try {
      await api.postJson('/api/streamer-requests', {
        name: safeText($('requestName')?.value, roleState.user.displayName),
        twitchUrl,
        message: composeRequestMessage()
      });
      saveRequestStatus('pending');
      renderUserStatus();
      renderRequestStatus();
      api.showToast(t('dashboard.streamerRequestDone', {}, '스트리머 등록 신청이 접수되었습니다.'));
    } catch (error) {
      const code = String(error?.payload?.code || '').toUpperCase();
      if (code === 'ACCESS_REQUEST_ALREADY_PENDING') {
        saveRequestStatus('pending');
        renderUserStatus();
        renderRequestStatus();
        api.showToast(t('dashboard.streamerRequestAlreadyPending', {}, '이미 승인 대기 중인 신청이 있습니다.'));
      } else if (code === 'ACCESS_REQUEST_ALREADY_APPROVED') {
        api.showToast(t('dashboard.streamerRequestAlreadyApproved', {}, '이미 스트리머 권한이 있습니다.'));
      } else {
        const status = $('streamerRequestStatus');
        if (status) {
          status.innerHTML = `
            <div class="status-box is-error">
              <strong>${api.escapeHtml(t('dashboard.streamerRequestError', {}, '등록 신청을 제출하지 못했습니다.'))}</strong>
              <span>${api.escapeHtml(error.message || t('dashboard.streamerRequestErrorText', {}, '입력값과 로그인 상태를 확인해주세요.'))}</span>
            </div>
          `;
        }
      }
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = t('dashboard.submitStreamerRequest', {}, '등록 신청 제출');
    }
  }

  function handleTwitchQueryNotice() {
    const params = new URLSearchParams(location.search);
    const twitch = params.get('twitch');
    const error = params.get('error');
    const streamerRequest = params.get('streamerRequest');
    if (twitch === 'connected' || twitch === 'reconnected') {
      api.showToast(t('dashboard.twitchConnectedNotice', {}, 'Twitch 연결 상태를 업데이트했습니다.'));
      params.delete('twitch');
    }
    if (['pending', 'approved', 'rejected'].includes(String(streamerRequest || '').toLowerCase())) {
      const status = String(streamerRequest).toLowerCase();
      saveRequestStatus(status);
      api.showToast(t(`dashboard.streamerRequestQuery${status[0].toUpperCase()}${status.slice(1)}`, {}, t('dashboard.twitchConnectedNotice', {}, '상태를 업데이트했습니다.')));
      params.delete('streamerRequest');
      params.delete('streamerRequestId');
    }
    if (error) {
      const messages = {
        twitch_already_linked: ['dashboard.twitchAlreadyLinked', '다른 사용자에게 연결된 Twitch 계정입니다.'],
        twitch_reconnect_failed: ['dashboard.twitchReconnectFailed', 'Twitch 재연동에 실패했습니다.'],
        twitch_not_configured: ['dashboard.twitchNotConfigured', 'Twitch 연동 설정이 완료되지 않았습니다.'],
        approval_required: ['dashboard.twitchApprovalRequired', '이 작업에는 승인된 스트리머 권한이 필요합니다.'],
        twitch_auth_failed: ['auth.twitchAuthFailed', 'Twitch 인증에 실패했습니다. 다시 시도해주세요.'],
        twitch_callback_failed: ['auth.twitchCallbackFailed', 'Twitch 로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.']
      };
      const [key, fallback] = messages[error] || ['auth.twitchUnknownError', 'Twitch 로그인에 실패했습니다. 다시 시도해주세요.'];
      api.showToast(t(key, {}, fallback));
      params.delete('error');
    }
    if (twitch || error || streamerRequest) {
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
  }

  function downloadDashboardJson() {
    const blob = new Blob([JSON.stringify(lastSummary || {
      role: roleState.role,
      twitchStatus,
      followedCount: followedItems.length,
      streamerRequestStatus: roleState.canUseStreamerTools ? 'approved' : requestStatusFromStorage() || 'not_requested'
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'dashboard-summary.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function rerenderCurrentState() {
    applyDashboardShell();
    if (renderState === 'summary' && lastSummary) {
      renderStreamerSummary(lastSummary);
    } else if (renderState === 'error') {
      renderStreamerError(lastError);
    } else if (renderState === 'loading') {
      renderStreamerLoading();
    }
  }

  $('refreshDashboardButton')?.addEventListener('click', () => loadSummary(true));
  $('prepareBroadcastButton')?.addEventListener('click', () => { location.href = 'profile-card.html'; });
  $('downloadDashboardJsonButton')?.addEventListener('click', downloadDashboardJson);
  $('dashboardTwitchConnectButton')?.addEventListener('click', () => {
    const intent = $('dashboardTwitchConnectButton')?.dataset.intent || 'link';
    location.href = buildTwitchUrl(intent);
  });
  $('dashboardRefreshFollowsButton')?.addEventListener('click', () => loadFollowedChannels(true));
  $('followedChannelsPanel')?.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-follow-toggle]');
    if (toggle) {
      const key = toggle.dataset.followToggle;
      if (key === 'registered' || key === 'unregistered') {
        followedExpanded[key] = !followedExpanded[key];
        renderFollowedChannels(followedItems);
      }
      return;
    }
    if (event.target.closest('[data-follow-reconnect]')) {
      location.href = buildTwitchUrl('reconnect');
    }
  });
  $('streamerRequestForm')?.addEventListener('submit', submitStreamerRequest);

  document.addEventListener('seiga:i18n-change', rerenderCurrentState);

  handleTwitchQueryNotice();
  applyDashboardShell();
  await loadSummary();
})();
