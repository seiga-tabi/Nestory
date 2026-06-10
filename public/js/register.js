(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const form = document.getElementById('registerForm');
  const button = document.getElementById('registerButton');
  const messageBox = document.getElementById('registerMessage');
  if (!api || !form || !location.pathname.endsWith('register.html')) return;

  let currentMessage = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function showMessage(type, key, fallback, params = {}) {
    if (!messageBox) return;
    messageBox.className = `form-message ${type}`;
    messageBox.textContent = t(key, params, fallback);
    currentMessage = { type, key, fallback, params };
  }

  function clearMessage() {
    if (!messageBox) return;
    messageBox.className = 'form-message';
    messageBox.textContent = '';
    currentMessage = null;
  }

  function value(id) {
    return document.getElementById(id)?.value.trim() || '';
  }

  function passwordValue(id) {
    return document.getElementById(id)?.value || '';
  }

  function validateForm() {
    const password = passwordValue('password');
    const confirmPassword = passwordValue('confirmPassword');

    if (password.length < 8) {
      showMessage('error', 'register.passwordTooShort', '비밀번호는 8자 이상이어야 합니다.');
      return false;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      showMessage('error', 'register.passwordWeak', '비밀번호에는 영문자와 숫자가 모두 포함되어야 합니다.');
      return false;
    }

    if (password !== confirmPassword) {
      showMessage('error', 'register.passwordMismatch', '비밀번호 확인이 일치하지 않습니다.');
      return false;
    }

    return true;
  }

  function normalizeRole(auth = {}) {
    const role = String(auth.role || auth.user?.role || auth.raw?.role || 'USER').toUpperCase();
    return role === 'VIEWER' ? 'USER' : role;
  }

  function defaultTargetForAuth(auth = {}) {
    const role = normalizeRole(auth);
    const isAdmin = role === 'ADMIN' || auth.isAdmin === true || auth.user?.isAdmin === true;
    const isStreamer = role === 'STREAMER'
      || isAdmin
      || auth.user?.isStreamer === true
      || Boolean(auth.streamerProfile);
    return isStreamer ? 'dashboard.html' : 'viewer-stats.html';
  }

  async function redirectIfAlreadyLoggedIn() {
    try {
      const state = window.SeigaAuth?.getAuthState
        ? await window.SeigaAuth.getAuthState({ force: true })
        : await api.getJson('/api/auth/me');
      if (state?.authenticated) location.href = defaultTargetForAuth(state);
    } catch {
      // 회원가입 화면은 인증 상태 조회가 실패해도 그대로 사용할 수 있게 둔다.
    }
  }

  await redirectIfAlreadyLoggedIn();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (!validateForm()) return;

    button.disabled = true;
    button.textContent = t('register.submitting', {}, '가입 중...');

    try {
      await api.postJson('/api/auth/register', {
        displayName: value('displayName'),
        email: value('email'),
        password: passwordValue('password'),
        confirmPassword: passwordValue('confirmPassword')
      });
      const state = await window.SeigaAuth?.refreshAuthState?.();
      showMessage('success', 'register.success', '회원가입이 완료되었습니다. 기본 화면으로 이동합니다.');
      setTimeout(() => {
        location.href = defaultTargetForAuth(state || {});
      }, 450);
    } catch (error) {
      const code = String(error?.payload?.code || '').toUpperCase();
      const messages = {
        EMAIL_ALREADY_REGISTERED: ['register.emailExists', '이미 가입된 이메일입니다. 로그인해주세요.'],
        PASSWORD_CONFIRM_MISMATCH: ['register.passwordMismatch', '비밀번호 확인이 일치하지 않습니다.'],
        WEAK_PASSWORD: ['register.passwordWeak', '비밀번호에는 영문자와 숫자가 모두 포함되어야 합니다.']
      };
      const descriptor = messages[code];
      if (descriptor) {
        showMessage('error', descriptor[0], descriptor[1]);
      } else {
        messageBox.className = 'form-message error';
        messageBox.textContent = error.message || t('register.failed', {}, '회원가입에 실패했습니다.');
        currentMessage = null;
      }
    } finally {
      button.disabled = false;
      button.textContent = t('register.submit', {}, '회원가입');
    }
  });

  document.addEventListener('seiga:i18n-change', () => {
    if (!currentMessage) return;
    showMessage(currentMessage.type, currentMessage.key, currentMessage.fallback, currentMessage.params);
  });
})();
