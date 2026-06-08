(function () {
  async function request(method, url, body, options = {}) {
    const init = {
      method,
      credentials: 'include',
      headers: options.headers || {}
    };

    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message = payload?.message || payload || '요청을 처리하지 못했습니다.';
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function query(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    });
    const text = search.toString();
    return text ? `?${text}` : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message) {
    if (window.showToast) return window.showToast(message);
    const toast = document.getElementById('globalToast') || document.createElement('div');
    toast.className = 'toast show';
    toast.textContent = message;
    if (!toast.parentNode) document.body.appendChild(toast);
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  async function redirectIfUnauthorized(target = 'login.html') {
    const me = await request('GET', '/api/auth/me');
    if (!me.authenticated) {
      location.href = target;
      return null;
    }
    return me;
  }

  async function uploadFile(url, fieldName, file) {
    const formData = new FormData();
    formData.append(fieldName, file);
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '파일 업로드에 실패했습니다.');
    return payload;
  }

  window.SeigaApi = {
    getJson: (url, params) => request('GET', `${url}${query(params)}`),
    postJson: (url, body) => request('POST', url, body),
    putJson: (url, body) => request('PUT', url, body),
    patchJson: (url, body) => request('PATCH', url, body),
    deleteJson: (url) => request('DELETE', url),
    uploadFile,
    redirectIfUnauthorized,
    showToast,
    escapeHtml
  };
})();
