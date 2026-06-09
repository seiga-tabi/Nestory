(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const isPasswordSetupPage = location.pathname.endsWith('set-password.html') || location.pathname.endsWith('password-setup.html');
  if (!api || !isPasswordSetupPage) return;

  const token = new URLSearchParams(location.search).get('token')?.trim() || '';
  const loadingState = document.getElementById('passwordSetupLoading');
  const errorState = document.getElementById('passwordSetupError');
  const errorText = document.getElementById('passwordSetupErrorText');
  const form = document.getElementById('passwordSetupForm');
  const accountSummary = document.getElementById('passwordSetupAccount');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirmPassword');
  const messageBox = document.getElementById('passwordSetupMessage');
  const submitButton = document.getElementById('passwordSetupSubmit');

  let setupStatus = null;
  let lastMessage = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function hide(node) {
    if (node) node.hidden = true;
  }

  function show(node) {
    if (node) node.hidden = false;
  }

  function setView(view) {
    hide(loadingState);
    hide(errorState);
    hide(form);
    if (view === 'loading') show(loadingState);
    if (view === 'error') show(errorState);
    if (view === 'form') show(form);
  }

  function setMessage(type, key, fallback, params = {}) {
    if (!messageBox) return;
    lastMessage = type ? { type, key, fallback, params } : null;
    messageBox.className = `form-message${type ? ` ${type}` : ''}`;
    messageBox.textContent = type ? t(key, params, fallback) : '';
  }

  function setErrorState(key, fallback, params = {}) {
    if (errorText) {
      errorText.dataset.i18n = key;
      errorText.textContent = t(key, params, fallback);
    }
    setView('error');
  }

  function formatExpiresAt(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const locale = window.SeigaI18n?.localeTag?.() || (window.SeigaI18n?.locale === 'ja' ? 'ja-JP' : 'ko-KR');
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function renderAccountSummary() {
    if (!accountSummary || !setupStatus) return;
    const name = setupStatus.displayName || setupStatus.email || t('setPassword.accountUnknown', {}, '승인된 계정');
    const expiresAt = formatExpiresAt(setupStatus.expiresAt);
    const expiresText = expiresAt
      ? t('setPassword.accountExpires', { expiresAt }, '{expiresAt}까지 사용 가능')
      : t('setPassword.accountNoExpiry', {}, '이 링크의 유효 시간을 확인할 수 없습니다.');
    accountSummary.innerHTML = `
      <strong>${api.escapeHtml(t('setPassword.accountLabel', {}, '설정 대상 계정'))}</strong>
      <span>${api.escapeHtml(name)}</span>
      <small>${api.escapeHtml(expiresText)}</small>
    `;
  }

  function errorMessageKey(error) {
    const code = error?.payload?.code || '';
    if (code === 'INVALID_PASSWORD_SETUP_TOKEN') {
      return ['setPassword.invalidDescription', '링크가 유효하지 않거나 만료되었습니다. 관리자에게 새 링크를 요청해주세요.'];
    }
    if (code === 'PASSWORD_CONFIRM_MISMATCH') {
      return ['setPassword.mismatch', '비밀번호와 비밀번호 확인이 일치하지 않습니다.'];
    }
    if (code === 'WEAK_PASSWORD') {
      return ['setPassword.weakPassword', '비밀번호는 영문자와 숫자를 포함해 8자 이상이어야 합니다.'];
    }
    return ['', error?.message || t('setPassword.submitFailed', {}, '비밀번호 설정에 실패했습니다.')];
  }

  function validateForm() {
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';

    if (password.length < 8) {
      setMessage('error', 'setPassword.tooShort', '비밀번호는 8자 이상이어야 합니다.');
      passwordInput?.focus();
      return null;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setMessage('error', 'setPassword.weakPassword', '비밀번호는 영문자와 숫자를 포함해 8자 이상이어야 합니다.');
      passwordInput?.focus();
      return null;
    }

    if (password !== confirmPassword) {
      setMessage('error', 'setPassword.mismatch', '비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      confirmInput?.focus();
      return null;
    }

    return { password, confirmPassword };
  }

  async function validateToken() {
    if (!token) {
      setErrorState('setPassword.missingToken', '비밀번호 설정 token이 없습니다. 관리자에게 새 링크를 요청해주세요.');
      return;
    }

    setView('loading');

    try {
      setupStatus = await api.getJson(`/api/auth/password-setup/${encodeURIComponent(token)}`);
      renderAccountSummary();
      setView('form');
      passwordInput?.focus();
    } catch (error) {
      const [key, fallback] = errorMessageKey(error);
      setErrorState(key || 'setPassword.invalidDescription', fallback);
    }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('', '', '');

    const values = validateForm();
    if (!values) return;

    submitButton.disabled = true;
    submitButton.textContent = t('setPassword.submitting', {}, '설정 중...');

    try {
      await api.postJson('/api/auth/password-setup', {
        token,
        password: values.password,
        confirmPassword: values.confirmPassword
      });
      sessionStorage.setItem('seiga_password_setup_success', 'true');
      setMessage('success', 'setPassword.completed', '비밀번호 설정이 완료되었습니다. 로그인 화면으로 이동합니다.');
      api.showToast(t('setPassword.completed', {}, '비밀번호 설정이 완료되었습니다. 로그인 화면으로 이동합니다.'));
      setTimeout(() => {
        location.href = 'login.html?passwordSetup=success';
      }, 700);
    } catch (error) {
      const [key, fallback] = errorMessageKey(error);
      setMessage('error', key || 'setPassword.submitFailed', fallback);
      submitButton.disabled = false;
      submitButton.textContent = t('setPassword.submit', {}, '비밀번호 설정 완료');
    }
  });

  document.addEventListener('seiga:i18n-change', () => {
    renderAccountSummary();
    if (lastMessage) {
      setMessage(lastMessage.type, lastMessage.key, lastMessage.fallback, lastMessage.params);
    }
  });

  validateToken();
})();
