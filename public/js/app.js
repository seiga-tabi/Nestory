(function () {
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

  initShellActions();
})();

function initShellActions() {
  const api = window.SeigaApi;

  document.querySelectorAll('.top-actions').forEach((actions) => {
    if (actions.querySelector('[data-public-home]')) return;
    const link = document.createElement('a');
    link.className = 'ghost-btn';
    link.href = 'index.html';
    link.dataset.publicHome = 'true';
    link.textContent = '공개 홈';
    actions.prepend(link);
  });

  const statusButton = document.querySelector('[data-session-status]');
  statusButton?.addEventListener('click', async () => {
    if (!api) return;
    try {
      const me = await api.getJson('/api/auth/me');
      window.showToast(me.authenticated ? `${me.user.displayName} 계정으로 로그인 중입니다.` : '로그인이 필요합니다.');
    } catch (error) {
      window.showToast(error.message || '상태 확인에 실패했습니다.');
    }
  });
}
