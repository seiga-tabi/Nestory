(function () {
  const supportedLocales = ['ko', 'ja'];
  const storageKey = 'seiga_locale';
  const fallbackLocale = 'ko';

  let locale = fallbackLocale;
  let messages = {};

  function normalizeLocale(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'ko' || text.startsWith('ko-')) return 'ko';
    if (text === 'ja' || text.startsWith('ja-') || text.startsWith('jp')) return 'ja';
    return null;
  }

  function interpolate(text, params = {}) {
    return String(text).replace(/\{(\w+)\}/g, (_match, key) => (
      params[key] !== undefined ? String(params[key]) : `{${key}}`
    ));
  }

  function t(key, params = {}, fallback) {
    if (typeof params === 'string') {
      fallback = params;
      params = {};
    }
    return interpolate(messages[key] || fallback || key, params);
  }

  function localeTag() {
    return locale === 'ja' ? 'ja-JP' : 'ko-KR';
  }

  function number(value) {
    return Number(value || 0).toLocaleString(localeTag());
  }

  function collectNodes(root, selector) {
    const nodes = [];
    if (root?.matches?.(selector)) nodes.push(root);
    root.querySelectorAll?.(selector).forEach((node) => nodes.push(node));
    return nodes;
  }

  async function getServerLocale(urlLocale) {
    const query = urlLocale ? `?lang=${encodeURIComponent(urlLocale)}` : '';
    const response = await fetch(`/api/i18n/locale${query}`, { credentials: 'include' });
    if (!response.ok) throw new Error('Locale request failed');
    return response.json();
  }

  async function loadMessages(nextLocale) {
    const response = await fetch(`/locales/${nextLocale}.json`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Locale messages failed');
    messages = await response.json();
  }

  function applyTranslations(root = document) {
    collectNodes(root, '[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n, {}, node.textContent);
    });
    collectNodes(root, '[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder, {}, node.getAttribute('placeholder') || ''));
    });
    collectNodes(root, '[data-i18n-title]').forEach((node) => {
      node.setAttribute('title', t(node.dataset.i18nTitle, {}, node.getAttribute('title') || ''));
    });
    collectNodes(root, '[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel, {}, node.getAttribute('aria-label') || ''));
    });
    collectNodes(root, '[data-i18n-alt]').forEach((node) => {
      node.setAttribute('alt', t(node.dataset.i18nAlt, {}, node.getAttribute('alt') || ''));
    });
    collectNodes(root, '[data-i18n-data-demo-submit]').forEach((node) => {
      node.dataset.demoSubmit = t(node.dataset.i18nDataDemoSubmit, {}, node.dataset.demoSubmit || '');
    });
    document.documentElement.lang = locale;
    updateSwitcher();
  }

  function updateSwitcher() {
    document.querySelectorAll('[data-lang-option]').forEach((button) => {
      button.classList.toggle('active', button.dataset.langOption === locale);
      button.setAttribute('aria-pressed', button.dataset.langOption === locale ? 'true' : 'false');
    });
  }

  async function persistLocale(nextLocale) {
    await fetch('/api/i18n/locale', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: nextLocale })
    }).catch(() => {});
  }

  async function setLocale(nextLocale) {
    const normalized = normalizeLocale(nextLocale);
    if (!supportedLocales.includes(normalized)) return locale;
    locale = normalized;
    localStorage.setItem(storageKey, locale);
    await loadMessages(locale);
    applyTranslations();
    await persistLocale(locale);
    document.dispatchEvent(new CustomEvent('seiga:i18n-change', { detail: { locale } }));
    return locale;
  }

  function bindSwitcher(root = document) {
    collectNodes(root, '[data-lang-option]').forEach((button) => {
      if (button.dataset.i18nBound === 'true') return;
      button.dataset.i18nBound = 'true';
      button.addEventListener('click', () => {
        setLocale(button.dataset.langOption);
      });
    });
  }

  async function init() {
    const urlLocale = normalizeLocale(new URLSearchParams(location.search).get('lang'));
    const storedLocale = normalizeLocale(localStorage.getItem(storageKey));
    let serverLocale = fallbackLocale;

    try {
      const payload = await getServerLocale(urlLocale);
      serverLocale = normalizeLocale(payload.locale) || fallbackLocale;
    } catch {
      serverLocale = normalizeLocale(navigator.language) || fallbackLocale;
    }

    locale = urlLocale || storedLocale || serverLocale || fallbackLocale;
    localStorage.setItem(storageKey, locale);
    await loadMessages(locale);
    bindSwitcher();
    applyTranslations();
    if (urlLocale || storedLocale) await persistLocale(locale);
    document.dispatchEvent(new CustomEvent('seiga:i18n-ready', { detail: { locale } }));
    return window.SeigaI18n;
  }

  window.SeigaI18n = {
    get locale() { return locale; },
    get storageKey() { return storageKey; },
    localeTag,
    number,
    t,
    setLocale,
    bindSwitcher,
    applyTranslations
  };
  window.SeigaI18nReady = init();
})();
