(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const stage = document.getElementById('overlayStage');
  const errorBox = document.getElementById('overlayError');
  if (!stage) return;

  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function setError(message) {
    stage.replaceChildren();
    if (!errorBox) return;
    errorBox.hidden = false;
    errorBox.textContent = message || t('overlay.invalidToken', {}, '사용할 수 없는 오버레이 URL입니다.');
  }

  function numberValue(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function setStageSize(overlay = {}) {
    const width = numberValue(overlay.width, 1920);
    const height = numberValue(overlay.height, 1080);
    document.documentElement.style.setProperty('--overlay-width', `${width}px`);
    document.documentElement.style.setProperty('--overlay-height', `${height}px`);
  }

  function sanitizeStyleBlock(value) {
    return String(value || '').replace(/<\/style/gi, '<\\/style');
  }

  function sanitizeScriptBlock(value) {
    return String(value || '').replace(/<\/script/gi, '<\\/script');
  }

  function stripUnsupportedMarkup(value) {
    return String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<script[^>]*>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<iframe[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  }

  function appendWidget(widget = {}) {
    const node = document.createElement('div');
    const type = safeText(widget.type, 'text');
    const animation = safeText(widget.animation, 'none');
    node.className = `overlay-widget overlay-widget--${type}${animation !== 'none' ? ` animation-${animation}` : ''}`;
    node.style.left = `${numberValue(widget.x, 0)}px`;
    node.style.top = `${numberValue(widget.y, 0)}px`;
    node.style.width = `${numberValue(widget.width, 320)}px`;
    node.style.minHeight = `${numberValue(widget.height, 120)}px`;
    node.style.color = safeText(widget.color, '#2f2946');
    node.style.background = safeText(widget.background, 'rgba(255,255,255,.76)');
    node.style.borderRadius = `${numberValue(widget.borderRadius, 28)}px`;
    node.style.fontSize = `${numberValue(widget.fontSize, 28)}px`;

    if (widget.imageUrl) {
      const image = document.createElement('img');
      image.src = widget.imageUrl;
      image.alt = '';
      node.append(image);
    }

    const text = document.createElement('span');
    text.textContent = safeText(widget.text, t('overlay.previewText', {}, '라이브 오버레이 알림'));
    node.append(text);
    stage.append(node);
  }

  function renderBuilder(overlay = {}) {
    const config = overlay.configJson || {};
    const widgets = Array.isArray(config.widgets) ? config.widgets : [];
    if (!widgets.length) {
      const empty = document.createElement('div');
      empty.className = 'overlay-empty';
      empty.textContent = safeText(overlay.title, t('overlay.untitled', {}, '이름 없는 오버레이'));
      stage.append(empty);
      return;
    }
    widgets.forEach(appendWidget);
  }

  function renderCustom(overlay = {}) {
    const frame = document.createElement('iframe');
    frame.className = 'overlay-custom-frame';
    frame.title = safeText(overlay.title, t('overlay.untitled', {}, '이름 없는 오버레이'));
    const width = numberValue(overlay.width, 1920);
    const height = numberValue(overlay.height, 1080);
    const allowJs = overlay.allowCustomJs === true && safeText(overlay.jsCode);
    frame.setAttribute('sandbox', allowJs ? 'allow-scripts' : '');
    const cssCode = sanitizeStyleBlock(overlay.cssCode || '');
    const jsCode = allowJs ? sanitizeScriptBlock(overlay.jsCode || '') : '';
    const script = jsCode ? `<script>${jsCode}<\\/script>` : '';
    const htmlCode = stripUnsupportedMarkup(overlay.htmlCode || '');
    frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}body{font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Noto Sans KR","Noto Sans JP","Segoe UI",sans-serif}.overlay-custom-root{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:transparent}${cssCode}</style></head><body><main class="overlay-custom-root">${htmlCode}</main>${script}</body></html>`;
    stage.append(frame);
  }

  function renderOverlay(overlay = {}) {
    if (errorBox) errorBox.hidden = true;
    stage.replaceChildren();
    setStageSize(overlay);
    if (overlay.isEnabled === false || String(overlay.status || '').toUpperCase() === 'DISABLED') {
      setError(t('overlay.disabled', {}, '비활성화된 오버레이입니다.'));
      return;
    }
    if (overlay.mode === 'CUSTOM_HTML_CSS' || overlay.mode === 'CUSTOM_ADVANCED') {
      renderCustom(overlay);
      return;
    }
    renderBuilder(overlay);
  }

  async function load() {
    if (!token) {
      setError(t('overlay.invalidToken', {}, '사용할 수 없는 오버레이 URL입니다.'));
      return;
    }

    try {
      const response = await fetch(`/api/overlay-public/${encodeURIComponent(token)}`, {
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.overlay) {
        throw new Error(t('overlay.invalidToken', {}, '사용할 수 없는 오버레이 URL입니다.'));
      }
      renderOverlay(payload.overlay);
    } catch (error) {
      setError(error.message || t('overlay.invalidToken', {}, '사용할 수 없는 오버레이 URL입니다.'));
    }
  }

  await load();
})();
