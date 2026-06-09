(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const loginForm = document.getElementById('loginForm');
  const loginButton = document.getElementById('loginButton');
  const messageBox = document.getElementById('message');
  const twitchLoginButton = document.getElementById('twitchLoginButton');
  if (!api || !loginForm) return;

  const allowedNextPages = new Set([
    'dashboard.html',
    'profile-card.html',
    'fan-cards.html',
    'analytics.html',
    'schedule.html',
    'settings.html',
    'admin-streamer-requests.html',
    'admin-access-requests.html',
    'index.html',
    'rankings.html',
    'streamer-detail.html',
    'fan-card-write.html',
    'about.html',
    'access-request.html',
    'viewer-cards.html',
    'message-board.html'
  ]);
  const searchParams = new URLSearchParams(location.search);
  const safeNext = sanitizeNext(searchParams.get('next'));
  const redirectTarget = safeNext || 'dashboard.html';
  let currentMessage = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function showMessage(type, text, descriptor = null) {
    if (!messageBox) return;
    messageBox.className = `message ${type}`;
    messageBox.textContent = text;
    currentMessage = descriptor ? { type, ...descriptor } : null;
  }

  function showTranslatedMessage(type, key, params = {}, fallback = key) {
    const text = t(key, params, fallback);
    showMessage(type, text, { key, params, fallback });
    return text;
  }

  function sanitizeNext(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.includes('\\') || text.includes('..') || text.startsWith('//')) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return '';

    try {
      const url = new URL(text, location.origin);
      if (url.origin !== location.origin) return '';
      const page = url.pathname.split('/').filter(Boolean).pop() || '';
      if (!allowedNextPages.has(page) || page === 'login.html') return '';
      return `${page}${url.search}${url.hash}`;
    } catch {
      return '';
    }
  }

  function redirectAfterLogin() {
    location.href = redirectTarget;
  }

  function loginErrorDescriptor(error) {
    const code = String(error?.payload?.code || '').toUpperCase();
    if (code === 'PASSWORD_SETUP_REQUIRED') {
      return ['auth.passwordSetupRequired', {}, '비밀번호 설정이 필요합니다.'];
    }
    if (code === 'INVALID_CREDENTIALS') {
      return ['auth.invalidCredentials', {}, '이메일 또는 비밀번호를 확인해주세요.'];
    }
    if (!error?.message) return ['auth.loginFailed', {}, '로그인에 실패했습니다.'];
    return null;
  }

  function showTwitchQueryError() {
    const code = searchParams.get('error');
    if (!code) return;

    const messages = {
      twitch_not_configured: ['auth.twitchNotConfigured', 'Twitch 연동 설정이 완료되지 않았습니다. 이메일 로그인을 이용하거나 관리자에게 설정을 요청해주세요.'],
      twitch_user: ['auth.twitchUserFailed', 'Twitch 계정 정보를 불러오지 못했습니다. 다시 시도해주세요.'],
      twitch_auth_failed: ['auth.twitchAuthFailed', 'Twitch 인증에 실패했습니다. 다시 시도해주세요.'],
      twitch_callback_failed: ['auth.twitchCallbackFailed', 'Twitch 로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'],
      twitch_invalid_state: ['auth.twitchCallbackFailed', 'Twitch 로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.']
    };
    const [key, fallback] = messages[code] || ['auth.twitchUnknownError', 'Twitch 로그인에 실패했습니다. 다시 시도해주세요.'];
    const message = showTranslatedMessage('error', key, {}, fallback);
    api.showToast(message);

    searchParams.delete('error');
    const nextQuery = searchParams.toString();
    history.replaceState(null, '', `${location.pathname}${nextQuery ? `?${nextQuery}` : ''}${location.hash}`);
  }

  const auth = window.SeigaAuth;

  (auth?.getAuthState ? auth.getAuthState({ force: true }) : api.getJson('/api/auth/me')).then((me) => {
    if (me.authenticated) redirectAfterLogin();
  }).catch(() => {});

  showTwitchQueryError();

  twitchLoginButton?.addEventListener('click', () => {
    location.href = '/auth/twitch?intent=login';
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    loginButton.textContent = t('auth.loggingIn', {}, '로그인 중...');
    showMessage('', '');

    try {
      await api.postJson('/api/auth/login', {
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        rememberMe: document.getElementById('rememberMe')?.checked || false
      });
      await auth?.refreshAuthState?.();
      if (safeNext) {
        showTranslatedMessage('success', 'auth.loginSuccessNext', {}, '로그인 후 원래 페이지로 이동합니다.');
      } else {
        showTranslatedMessage('success', 'auth.loginSuccess', {}, '로그인되었습니다. 대시보드로 이동합니다.');
      }
      setTimeout(redirectAfterLogin, 400);
    } catch (error) {
      const descriptor = loginErrorDescriptor(error);
      if (descriptor) {
        showTranslatedMessage('error', descriptor[0], descriptor[1], descriptor[2]);
      } else {
        showMessage('error', error.message);
      }
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = t('nav.login', {}, '로그인');
    }
  });

  document.addEventListener('seiga:i18n-change', () => {
    if (!currentMessage) return;
    showTranslatedMessage(currentMessage.type, currentMessage.key, currentMessage.params, currentMessage.fallback);
  });
})();
