(function () {
  const currentUserEndpoint = '/api/auth/me';
  const logoutEndpoint = '/api/auth/logout';
  const guestSelector = '[data-auth-guest]';
  const userSelector = '[data-auth-user]';
  const adminSelector = '[data-auth-admin]';
  const streamerSelector = '[data-auth-streamer]';
  const controlledSelector = '[data-auth-controlled]';
  const authStorageKeys = [
    'seiga_auth_state',
    'seiga_user',
    'seiga_session',
    'authUser',
    'currentUser',
    'user'
  ];
  const authStoragePrefixes = ['seiga_auth_', 'seiga_user_', 'seiga_session_'];

  let authState = null;
  let authPromise = null;
  document.documentElement.classList.add('auth-loading');

  function api() {
    return window.SeigaApi;
  }

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function normalizeMe(payload) {
    return {
      authenticated: Boolean(payload?.authenticated),
      user: payload?.user || null,
      role: payload?.role || payload?.user?.role || null,
      isAdmin: payload?.isAdmin === true || payload?.user?.isAdmin === true,
      isStreamer: payload?.user?.isStreamer === true,
      streamerProfile: payload?.streamerProfile || null,
      raw: payload || null
    };
  }

  function isAdminState(state) {
    if (!state?.authenticated) return false;
    const raw = state.raw || {};
    const user = state.user || raw.user || {};
    const roles = [state.role, user.role, raw.role].map((role) => String(role || '').toUpperCase());
    return roles.includes('ADMIN') || state.isAdmin === true || user.isAdmin === true || raw.isAdmin === true;
  }

  function normalizeRole(value) {
    const role = String(value || '').trim().toUpperCase();
    if (role === 'VIEWER') return 'USER';
    return role || 'USER';
  }

  function isStreamerState(state) {
    if (!state?.authenticated) return false;
    const raw = state.raw || {};
    const user = state.user || raw.user || {};
    const roles = [state.role, user.role, raw.role, user.dbRole]
      .map(normalizeRole);
    return roles.includes('STREAMER')
      || roles.includes('ADMIN')
      || state.isStreamer === true
      || user.isStreamer === true
      || Boolean(state.streamerProfile);
  }

  function clearAuthStorage() {
    [window.localStorage, window.sessionStorage].forEach((storage) => {
      if (!storage) return;
      authStorageKeys.forEach((key) => storage.removeItem(key));
      Object.keys(storage).forEach((key) => {
        if (authStoragePrefixes.some((prefix) => key.startsWith(prefix))) {
          storage.removeItem(key);
        }
      });
    });
  }

  async function getAuthState(options = {}) {
    if (!api()) return normalizeMe({ authenticated: false });
    if (authState && !options.force) return authState;
    if (authPromise && !options.force) return authPromise;

    authPromise = api().getJson(currentUserEndpoint)
      .then(normalizeMe)
      .catch((error) => ({
        authenticated: false,
        user: null,
        role: null,
        streamerProfile: null,
        error
      }))
      .then((state) => {
        authState = state;
        document.dispatchEvent(new CustomEvent('seiga:auth-state', { detail: state }));
        return state;
      })
      .finally(() => {
        authPromise = null;
      });

    return authPromise;
  }

  function markAuthNode(node, mode, kind) {
    if (!node) return;
    node.dataset.authControlled = 'true';
    if (mode === 'guest') node.dataset.authGuest = 'true';
    if (mode === 'user') node.dataset.authUser = 'true';
    if (kind) node.dataset.authKind = kind;
  }

  function configureAction(node, href) {
    if (!node) return;
    if (node.tagName === 'A') {
      node.href = href;
      return;
    }
    node.dataset.authHref = href;
    node.removeAttribute('onclick');
  }

  function ensureAuthLink(actions, selector, className, href, i18nKey, fallback, mode, kind) {
    let node = actions.querySelector(selector);
    if (!node) {
      node = document.createElement('a');
      node.className = className;
      node.href = href;
      node.dataset.i18n = i18nKey;
      node.textContent = t(i18nKey, {}, fallback);
      actions.append(node);
    }
    markAuthNode(node, mode, kind);
    configureAction(node, href);
    node.dataset.i18n = i18nKey;
    node.textContent = t(i18nKey, {}, fallback);
    return node;
  }

  function ensureLogoutButton(actions) {
    let button = actions.querySelector('[data-auth-logout], [data-logout-button]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'ghost-btn';
      button.type = 'button';
      button.dataset.i18n = 'nav.logout';
      button.textContent = t('nav.logout', {}, '로그아웃');
      actions.append(button);
    }
    button.type = 'button';
    button.dataset.logoutButton = 'true';
    button.dataset.authLogout = 'true';
    markAuthNode(button, 'user', 'logout');
    button.dataset.i18n = 'nav.logout';
    button.textContent = t('nav.logout', {}, '로그아웃');
    return button;
  }

  function markAdminNode(node) {
    if (!node) return;
    markAuthNode(node, 'user', 'admin');
    node.dataset.authAdmin = 'true';
  }

  function markStreamerNode(node) {
    if (!node) return;
    markAuthNode(node, 'user', 'streamer');
    node.dataset.authStreamer = 'true';
  }

  function ensureAdminHeaderLink(actions) {
    const link = ensureAuthLink(
      actions,
      '[data-auth-kind="admin"], a[href="admin-streamer-requests.html"]',
      'ghost-btn',
      'admin-streamer-requests.html',
      'nav.adminPage',
      '관리자 페이지',
      'user',
      'admin'
    );
    markAdminNode(link);
    return link;
  }

  function ensureAdminSidebarLink(nav) {
    if (!nav) return null;
    let link = nav.querySelector('[data-auth-kind="admin"], a[href="admin-streamer-requests.html"]');
    if (!link) {
      link = document.createElement('a');
      link.href = 'admin-streamer-requests.html';
      link.dataset.nav = 'true';
      link.innerHTML = `<span class="nav-icon">✓</span><span data-i18n="adminRequests.manageTitle">${escapeHtml(t('adminRequests.manageTitle', {}, '등록 요청 관리'))}</span>`;
      nav.append(link);
    }
    markAdminNode(link);
    link.href = 'admin-streamer-requests.html';
    const label = link.querySelector('[data-i18n], [data-shell-nav-label]') || link;
    label.dataset.i18n = 'adminRequests.manageTitle';
    if (label === link) {
      label.textContent = t('adminRequests.manageTitle', {}, '등록 요청 관리');
    } else {
      label.textContent = t('adminRequests.manageTitle', {}, '등록 요청 관리');
    }
    return link;
  }

  function normalizeAdminLinks(root = document) {
    root.querySelectorAll('a[href="admin-streamer-requests.html"], a[href="admin-access-requests.html"], [data-auth-admin]').forEach(markAdminNode);
    root.querySelectorAll('.sidebar .nav').forEach(ensureAdminSidebarLink);
    root.querySelectorAll('.header-actions').forEach(ensureAdminHeaderLink);
  }

  function normalizeStreamerLinks(root = document) {
    root.querySelectorAll([
      'a[href="profile-card.html"]',
      'a[href="fan-cards.html"]',
      'a[href="analytics.html"]',
      'a[href="schedule.html"]',
      '[data-auth-streamer]'
    ].join(',')).forEach(markStreamerNode);
  }

  function normalizeHeaderActions(root = document) {
    root.querySelectorAll('.header-actions').forEach((actions) => {
      actions.querySelectorAll('a, button').forEach((node) => {
        const href = node.getAttribute('href') || '';
        const onclick = node.getAttribute('onclick') || '';
        const i18nKey = node.dataset.i18n || '';

        if (href === 'login.html' || onclick.includes('login.html') || i18nKey === 'nav.login') {
          markAuthNode(node, 'guest', 'login');
          configureAction(node, 'login.html');
        }

        if (href === 'access-request.html' || i18nKey === 'nav.start') {
          markAuthNode(node, 'guest', 'start');
          configureAction(node, 'access-request.html');
        }

        if (href === 'dashboard.html') {
          markAuthNode(node, 'user', 'dashboard');
        }
      });

      ensureAuthLink(
        actions,
        '[data-auth-kind="dashboard"], a[href="dashboard.html"]',
        'primary-btn',
        'dashboard.html',
        'nav.dashboard',
        '대시보드',
        'user',
        'dashboard'
      );
      ensureAdminHeaderLink(actions);
      ensureLogoutButton(actions);
    });

    root.querySelectorAll('[data-logout-button]').forEach((button) => {
      markAuthNode(button, 'user', 'logout');
      button.dataset.authLogout = 'true';
    });
    normalizeAdminLinks(root);
    normalizeStreamerLinks(root);
  }

  function setVisible(node, visible) {
    node.hidden = !visible;
    node.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function applyAuthState(state) {
    const authenticated = Boolean(state?.authenticated);
    const admin = isAdminState(state);
    const streamer = isStreamerState(state);
    const role = normalizeRole(state?.role || state?.user?.role);
    document.documentElement.classList.remove(
      'auth-loading',
      'authenticated',
      'unauthenticated',
      'admin',
      'not-admin',
      'streamer',
      'not-streamer',
      'role-user',
      'role-streamer',
      'role-admin'
    );
    document.documentElement.classList.add('auth-ready', authenticated ? 'authenticated' : 'unauthenticated');
    document.documentElement.classList.add(admin ? 'admin' : 'not-admin');
    document.documentElement.classList.add(streamer ? 'streamer' : 'not-streamer');
    if (authenticated) document.documentElement.classList.add(`role-${role.toLowerCase()}`);

    document.querySelectorAll(guestSelector).forEach((node) => setVisible(node, !authenticated));
    document.querySelectorAll(userSelector).forEach((node) => setVisible(node, authenticated));
    document.querySelectorAll(adminSelector).forEach((node) => setVisible(node, admin));
    document.querySelectorAll(streamerSelector).forEach((node) => setVisible(node, streamer));
    document.querySelectorAll(controlledSelector).forEach((node) => {
      if (!node.matches(guestSelector) && !node.matches(userSelector) && !node.matches(adminSelector) && !node.matches(streamerSelector)) setVisible(node, true);
    });
  }

  async function logout(target = 'index.html') {
    if (!api()) return;
    await api().postJson(logoutEndpoint, {});
    clearAuthStorage();
    authState = normalizeMe({ authenticated: false });
    applyAuthState(authState);
    document.dispatchEvent(new CustomEvent('seiga:auth-state', { detail: authState }));
    location.href = target;
  }

  function bindLogoutButtons(root = document) {
    root.querySelectorAll('[data-auth-logout], [data-logout-button]').forEach((button) => {
      if (button.dataset.authLogoutBound === 'true') return;
      button.dataset.authLogoutBound = 'true';
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        button.disabled = true;
        try {
          await logout(button.dataset.logoutTarget || 'index.html');
        } catch (error) {
          button.disabled = false;
          api()?.showToast(error.message || t('shell.logoutFailed', {}, '로그아웃에 실패했습니다.'));
        }
      });
    });
  }

  function bindAuthLinks(root = document) {
    root.querySelectorAll('[data-auth-href]').forEach((button) => {
      if (button.dataset.authHrefBound === 'true') return;
      button.dataset.authHrefBound = 'true';
      button.addEventListener('click', () => {
        location.href = button.dataset.authHref;
      });
    });
  }

  async function syncAuthUi(options = {}) {
    normalizeHeaderActions(options.root || document);
    bindLogoutButtons(options.root || document);
    bindAuthLinks(options.root || document);
    document.documentElement.classList.add('auth-loading');
    const state = await getAuthState({ force: Boolean(options.force) });
    applyAuthState(state);
    return state;
  }

  function showPasswordSetupLoginNotice() {
    if (!location.pathname.endsWith('login.html')) return;

    const params = new URLSearchParams(location.search);
    const hasQueryNotice = params.get('passwordSetup') === 'success';
    const hasSessionNotice = sessionStorage.getItem('seiga_password_setup_success') === 'true';
    if (!hasQueryNotice && !hasSessionNotice) return;

    sessionStorage.removeItem('seiga_password_setup_success');
    params.delete('passwordSetup');
    const nextQuery = params.toString();
    const nextUrl = `${location.pathname}${nextQuery ? `?${nextQuery}` : ''}${location.hash}`;
    history.replaceState(null, '', nextUrl);

    const message = t('setPassword.loginNotice', {}, '비밀번호 설정이 완료되었습니다. 새 비밀번호로 로그인해주세요.');
    const messageBox = document.getElementById('message');
    if (messageBox) {
      messageBox.className = 'message success';
      messageBox.textContent = message;
    }
    api()?.showToast(message);
  }

  async function refreshAuthState() {
    const state = await getAuthState({ force: true });
    applyAuthState(state);
    return state;
  }

  async function init() {
    if (window.SeigaI18nReady) await window.SeigaI18nReady.catch(() => {});
    await syncAuthUi();
    showPasswordSetupLoginNotice();
  }

  function escapeHtml(value) {
    return api()?.escapeHtml?.(value) || String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function firstValue(source, keys, fallback = '') {
    for (const key of keys) {
      const value = source?.[key];
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

  function numberText(value) {
    return window.SeigaI18n?.number?.(value) || Number(value || 0).toLocaleString(window.SeigaI18n?.locale === 'ja' ? 'ja-JP' : 'ko-KR');
  }

  function isLiveValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    const text = safeText(value).toLowerCase();
    return ['live', 'online', 'streaming', 'true', 'on'].includes(text);
  }

  function normalizeProfileCardData(source = {}, options = {}) {
    const isLive = options.isLive ?? isLiveValue(firstValue(source, ['isLive', 'liveStatus', 'isStreaming']));
    const fanCards = Array.isArray(source.fanCards) ? source.fanCards.length : firstValue(source, ['fanCardCount', 'fanCardsCount'], 0);
    const tags = (options.tags || [
      firstValue(source, ['mainContent', 'category']),
      firstValue(source, ['language', 'languages']),
      ...asList(firstValue(source, ['tags', 'styleTags', 'playStyleTags']))
    ]).flat().map((tag) => safeText(tag)).filter(Boolean);

    return {
      id: safeText(options.id || source.id || source.slug),
      slug: safeText(options.slug || source.slug),
      rank: options.rank || source.rank || '',
      name: safeText(options.name || firstValue(source, ['displayName', 'name', 'username']), t('index.noName', {}, '이름 없는 스트리머')),
      handle: safeText(options.handle || firstValue(source, ['handle', 'username', 'twitchLogin']), t('index.noHandle', {}, '핸들 없음')),
      bio: safeText(options.bio || firstValue(source, ['bio', 'description', 'subtitle']), t('index.noSubtitle', {}, '소개가 등록되지 않았습니다.')),
      imageUrl: safeText(options.imageUrl || firstValue(source, ['avatarUrl', 'avatarImage', 'profileImage', 'coverImage', 'backgroundImage'])),
      verified: options.verified ?? (source.verified === true || source.isVerified === true || source.isPublic !== false),
      isLive,
      tags: Array.from(new Set(tags)).slice(0, 3),
      stats: options.stats || [
        { icon: '♡', value: firstValue(source, ['followerCount', 'followers', 'favoriteCount', 'viewCount', 'viewerCount'], 0), label: t('profileCard.statFollowers', {}, '팔로워') },
        { icon: '▣', value: fanCards, label: t('profileCard.statFanCards', {}, '팬 카드') },
        { icon: '●', value: isLive ? t('common.live', {}, 'LIVE') : t('common.offline', {}, 'OFF'), label: t('profileCard.statStatus', {}, '상태') }
      ],
      actions: options.actions || [],
      className: safeText(options.className),
      ariaLabel: safeText(options.ariaLabel, t('profileCard.cardAriaLabel', {}, '프로필 카드'))
    };
  }

  function actionAttributes(action = {}) {
    const attrs = [];
    if (action.href) attrs.push(`data-href="${escapeHtml(action.href)}"`);
    if (action.detailUrl) attrs.push(`data-detail-url="${escapeHtml(action.detailUrl)}"`);
    if (action.fanWrite) attrs.push(`data-fan-write="${escapeHtml(action.fanWrite)}"`);
    if (action.loginRequired) attrs.push('data-login-required');
    if (action.disabled) attrs.push('disabled');
    return attrs.join(' ');
  }

  function renderProfileCard(source = {}, options = {}) {
    const data = normalizeProfileCardData(source, options);
    const initial = escapeHtml(Array.from(data.name || '?')[0] || '?');
    const imageHtml = data.imageUrl
      ? `<img src="${escapeHtml(data.imageUrl)}" alt="${escapeHtml(t('common.imageAlt', {}, '프로필 이미지'))}" loading="lazy" decoding="async" />`
      : '';
    const tagsHtml = data.tags.length
      ? `<div class="profile-card__tags">${data.tags.map((tag) => `<span class="profile-card__tag">${escapeHtml(tag)}</span>`).join('')}</div>`
      : '';
    const statsHtml = data.stats.slice(0, 3).map((stat) => `
      <span class="profile-card__stat">
        <span class="profile-card__stat-icon" aria-hidden="true">${escapeHtml(stat.icon || '•')}</span>
        <strong>${escapeHtml(stat.format === false ? safeText(stat.value, '-') : (Number.isFinite(Number(stat.value)) && safeText(stat.value) !== '' ? numberText(stat.value) : safeText(stat.value, '-')))}</strong>
        <small>${escapeHtml(stat.label || '')}</small>
      </span>
    `).join('');
    const actionsHtml = data.actions.length
      ? `<div class="profile-card__actions">${data.actions.slice(0, 2).map((action, index) => {
          const className = `profile-card__button ${index === 0 ? 'profile-card__button--primary' : 'profile-card__button--secondary'}`;
          const label = escapeHtml(action.label || t('index.profileView', {}, '프로필 보기'));
          const icon = escapeHtml(action.icon || (index === 0 ? '+' : '›'));
          if (action.href && !action.detailUrl && !action.fanWrite && !action.loginRequired) {
            return `<a class="${className}" href="${escapeHtml(action.href)}"><span>${label}</span><span aria-hidden="true">${icon}</span></a>`;
          }
          return `<button class="${className}" type="button" ${actionAttributes(action)}><span>${label}</span><span aria-hidden="true">${icon}</span></button>`;
        }).join('')}</div>`
      : '';

    return `
      <article class="profile-card profile-card--portrait ${escapeHtml(data.className)}" data-profile-card data-profile-slug="${escapeHtml(data.slug)}" aria-label="${escapeHtml(data.ariaLabel)}">
        <div class="profile-card__media">
          ${data.rank ? `<span class="profile-card__rank">${escapeHtml(data.rank)}</span>` : ''}
          <div class="profile-card__image${data.imageUrl ? ' has-image' : ''}">
            ${imageHtml}
            <div class="profile-card__placeholder" aria-hidden="true">${initial}</div>
          </div>
          <span class="profile-card__status ${data.isLive ? 'is-live' : 'is-offline'}"><span class="status-dot"></span>${escapeHtml(data.isLive ? t('common.live', {}, 'LIVE') : t('common.offline', {}, 'OFF'))}</span>
        </div>
        <div class="profile-card__body">
          <div class="profile-card__header">
            <div class="profile-card__title">
              <h3 class="profile-card__name">${escapeHtml(data.name)}</h3>
              ${data.verified ? '<span class="profile-card__badge" aria-label="verified">✓</span>' : ''}
            </div>
            <p class="profile-card__handle">${escapeHtml(data.handle)}</p>
          </div>
          <p class="profile-card__bio">${escapeHtml(data.bio)}</p>
          ${tagsHtml}
          <div class="profile-card__stats">${statsHtml}</div>
          ${actionsHtml}
        </div>
      </article>
    `;
  }

  function bindProfileCardImageFallback(root = document) {
    if (!root || root.dataset?.profileCardFallbackBound === 'true') return;
    if (root.dataset) root.dataset.profileCardFallbackBound = 'true';
    root.addEventListener('error', (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      const holder = image.closest('.profile-card__image');
      if (!holder) return;
      image.remove();
      holder.classList.remove('has-image');
    }, true);
  }

  window.SeigaAuth = {
    currentUserEndpoint,
    logoutEndpoint,
    clearAuthStorage,
    getAuthState,
    refreshAuthState,
    syncAuthUi,
    bindLogoutButtons,
    isAdmin: isAdminState,
    isStreamer: isStreamerState,
    normalizeAdminLinks,
    normalizeHeaderActions,
    normalizeStreamerLinks,
    logout
  };

  // Canonical portrait profile card renderer. Keep card markup changes centralized here.
  window.SeigaProfileCard = {
    normalize: normalizeProfileCardData,
    renderProfileCard,
    bindImageFallback: bindProfileCardImageFallback
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
    document.addEventListener('DOMContentLoaded', () => bindProfileCardImageFallback(document), { once: true });
  } else {
    init();
    bindProfileCardImageFallback(document);
  }

  document.addEventListener('seiga:i18n-change', () => {
    normalizeHeaderActions(document);
    normalizeAdminLinks(document);
    normalizeStreamerLinks(document);
    if (authState) applyAuthState(authState);
  });
})();
