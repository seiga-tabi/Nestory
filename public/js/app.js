(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const file = location.pathname.split('/').pop() || 'dashboard.html';

  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.getAttribute('href') === file) link.classList.add('active');
  });

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.id = 'globalToast';
  document.body.appendChild(toast);

  window.showToast = function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  };

  document.querySelectorAll('[data-toast]').forEach((button) => {
    button.addEventListener('click', () => window.showToast(button.dataset.toast));
  });

  initShellI18n();
  initShellActions();
})();

function shellT(key, params = {}, fallback = key) {
  return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
}

function ensureLanguageSwitcher(actions) {
  if (!actions || actions.querySelector('[data-lang-option]')) return;
  const switcher = document.createElement('div');
  switcher.className = 'language-switcher';
  switcher.dataset.i18nAriaLabel = 'language.label';
  switcher.setAttribute('aria-label', shellT('language.label', {}, '언어 선택'));
  switcher.innerHTML = `
    <button class="ghost-btn" type="button" data-lang-option="ko">KR</button>
    <button class="ghost-btn" type="button" data-lang-option="ja">JA</button>
  `;
  actions.prepend(switcher);
  window.SeigaI18n?.bindSwitcher?.(switcher);
  window.SeigaI18n?.applyTranslations?.(switcher);
}

function initShellI18n() {
  document.querySelectorAll('.top-actions').forEach(ensureLanguageSwitcher);
  window.SeigaI18n?.applyTranslations?.();
}

function initShellActions() {
  const api = window.SeigaApi;

  document.querySelectorAll('.top-actions').forEach((actions) => {
    if (actions.querySelector('[data-public-home]')) return;
    const link = document.createElement('a');
    link.className = 'ghost-btn';
    link.href = 'index.html';
    link.dataset.publicHome = 'true';
    link.dataset.i18n = 'nav.publicHome';
    link.textContent = shellT('nav.publicHome', {}, '공개 홈');
    actions.prepend(link);
  });

  const statusButton = document.querySelector('[data-session-status]');
  statusButton?.addEventListener('click', async () => {
    if (!api) return;
    try {
      const me = await api.getJson('/api/auth/me');
      window.showToast(me.authenticated
        ? shellT('shell.sessionLoggedIn', { name: me.user.displayName }, `${me.user.displayName} 계정으로 로그인 중입니다.`)
        : shellT('shell.loginRequired', {}, '로그인이 필요합니다.'));
    } catch (error) {
      window.showToast(error.message || shellT('shell.statusCheckFailed', {}, '상태 확인에 실패했습니다.'));
    }
  });

  document.querySelectorAll('[data-logout-button]').forEach((button) => {
    if (window.SeigaAuth?.bindLogoutButtons) return;
    button.addEventListener('click', async () => {
      if (!api) return;
      button.disabled = true;
      try {
        await api.logout('login.html');
      } catch (error) {
        button.disabled = false;
        window.showToast(error.message || shellT('shell.logoutFailed', {}, '로그아웃에 실패했습니다.'));
      }
    });
  });

  if (window.SeigaAuth?.syncAuthUi) {
    window.SeigaAuth.syncAuthUi();
  }
}
