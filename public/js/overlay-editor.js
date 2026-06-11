(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const editorLayout = document.getElementById('overlayEditorLayout');
  if (!api || !editorLayout) return;

  const params = new URLSearchParams(location.search);
  let overlayId = params.get('id') || '';
  const nextPath = `overlay-editor.html${location.search || ''}`;
  const me = await api.redirectIfUnauthorized(`login.html?next=${encodeURIComponent(nextPath)}`);
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const DEFAULT_WIDTH = 1920;
  const DEFAULT_HEIGHT = 1080;
  const WIDGET_IDS = {
    message: 'message-alert',
    fanCard: 'fan-card-alert',
    follow: 'follow-alert'
  };
  const OVERLAY_TYPES = ['CHAT', 'DONATION', 'FOLLOW', 'FAN_CARD', 'CUSTOM'];
  const TYPE_CONFIG_KEYS = {
    CHAT: 'chat',
    DONATION: 'donation',
    FOLLOW: 'follow',
    FAN_CARD: 'fanCard',
    CUSTOM: 'custom'
  };
  let currentOverlay = null;
  let isAdmin = false;
  let isStreamer = false;
  let serverAllowsCustomJs = false;
  let currentOverlayType = '';
  let testAlertVisible = false;
  let alertAssetUrl = '';
  let alertAssetObjectUrl = '';
  let alertAssetName = '';
  let alertAssetFile = null;
  let previewResizeObserver = null;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function revokeAlertAssetObjectUrl() {
    if (alertAssetObjectUrl) URL.revokeObjectURL(alertAssetObjectUrl);
    alertAssetObjectUrl = '';
  }

  function escapeHtml(value) {
    return api.escapeHtml ? api.escapeHtml(value) : String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function roleOf(auth = {}) {
    return String(auth.role || auth.user?.role || auth.raw?.role || 'USER').toUpperCase();
  }

  function unwrapItem(payload) {
    return payload?.item || payload?.overlay || payload || null;
  }

  function normalizeOverlayType(value) {
    const type = String(value || '').toUpperCase();
    return OVERLAY_TYPES.includes(type) ? type : 'CUSTOM';
  }

  function overlayTypeFromOverlay(overlay = {}) {
    const config = overlay.configJson || {};
    return normalizeOverlayType(overlay.overlayType || overlay.type || config.overlayType || config.type || 'CUSTOM');
  }

  function overlayTypeLabel(type = currentOverlayType) {
    const value = normalizeOverlayType(type || 'CUSTOM');
    if (value === 'CHAT') return t('overlay.typeChat', {}, '채팅');
    if (value === 'DONATION') return t('overlay.typeDonation', {}, '후원');
    if (value === 'FOLLOW') return t('overlay.typeFollow', {}, '팔로우');
    if (value === 'FAN_CARD') return t('overlay.typeFanCard', {}, '팬카드');
    return t('overlay.typeCustom', {}, '커스텀');
  }

  function typeConfigKey(type = currentOverlayType) {
    return TYPE_CONFIG_KEYS[normalizeOverlayType(type || 'CUSTOM')] || 'custom';
  }

  function supportsAlertAsset(type = currentOverlayType) {
    return ['DONATION', 'FOLLOW', 'FAN_CARD'].includes(normalizeOverlayType(type || 'CUSTOM'));
  }

  function setOverlayType(type, options = {}) {
    currentOverlayType = normalizeOverlayType(type || 'CUSTOM');
    document.querySelectorAll('[data-overlay-type-choice]').forEach((button) => {
      const active = button.dataset.overlayTypeChoice === currentOverlayType;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-overlay-type-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.overlayTypePanel !== currentOverlayType;
    });
    const badge = $('overlayTypeBadge');
    if (badge) badge.textContent = overlayTypeLabel(currentOverlayType);
    const assetCard = document.querySelector('.overlay-asset-card');
    if (assetCard) assetCard.hidden = !supportsAlertAsset(currentOverlayType);
    if (options.applyTemplate) applyTemplateForType(currentOverlayType);
    renderAlertAssetPreview();
    updateStaticLabels();
  }

  function showTypePicker() {
    const picker = $('overlayTypePicker');
    if (picker) picker.hidden = false;
    editorLayout.hidden = true;
    const saveButton = $('saveOverlayButton');
    if (saveButton) saveButton.disabled = true;
  }

  function showEditor() {
    const picker = $('overlayTypePicker');
    if (picker) picker.hidden = true;
    editorLayout.hidden = false;
    updateActionState();
  }

  function overlayObsUrl(overlay = {}) {
    const directUrl = safeText(overlay.obsUrl || overlay.publicUrl, '');
    if (directUrl) {
      if (/^https?:\/\//i.test(directUrl) || directUrl.startsWith('//')) return directUrl;
      if (directUrl.startsWith('/')) return `${location.origin}${directUrl}`;
      return directUrl;
    }
    const token = safeText(overlay.token);
    return token ? `${location.origin}/overlay.html?token=${encodeURIComponent(token)}` : '';
  }

  function normalizeAssetUrl(url = '') {
    const value = safeText(url);
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('//') || value.startsWith('blob:') || value.startsWith('data:')) return value;
    if (value.startsWith('/')) return `${location.origin}${value}`;
    return value;
  }

  function statusValue(overlay = {}) {
    return String(overlay.status || (overlay.isEnabled === false ? 'DISABLED' : 'DRAFT')).toUpperCase();
  }

  function selectedStatusValue() {
    return safeText($('overlayStatus')?.value, statusValue(currentOverlay || {})).toUpperCase();
  }

  function savedStatusValue() {
    return statusValue(currentOverlay || {});
  }

  function canUseObsUrl() {
    return Boolean(overlayId) && savedStatusValue() === 'ACTIVE';
  }

  function obsBlockedMessage() {
    if (!overlayId) return t('overlay.saveBeforeObs', {}, 'OBS URL은 저장 후 발급할 수 있습니다.');
    if (selectedStatusValue() === 'ACTIVE' && savedStatusValue() !== 'ACTIVE') {
      return t('overlay.obsActiveSaveRequired', {}, '상태를 ACTIVE로 저장한 뒤 OBS URL을 사용할 수 있습니다.');
    }
    return t('overlay.obsDraftHint', {}, '오버레이를 ACTIVE로 변경한 뒤 OBS URL을 사용할 수 있습니다.');
  }

  function overlayErrorMessage(error, fallbackKey, fallback) {
    const code = safeText(error?.payload?.code || error?.payload?.error || error?.code);
    if (code === 'INVALID_OVERLAY_CODE') {
      return t('overlay.invalidCode', {}, '허용되지 않는 HTML/CSS/JS 코드가 포함되어 저장할 수 없습니다.');
    }
    if (code === 'OVERLAY_STREAMER_REQUIRED') {
      return t('overlay.forbidden', {}, '승인된 스트리머만 오버레이를 관리할 수 있습니다.');
    }
    if (code === 'OVERLAY_FORBIDDEN') {
      return t('overlay.noPermission', {}, '오버레이 관리 권한이 없습니다.');
    }
    return error?.message || t(fallbackKey, {}, fallback);
  }

  function setAccess(messageKey, fallback, redirect = false) {
    const access = $('overlayAccessState');
    if (!access) return;
    access.hidden = false;
    access.classList.add('is-error');
    access.textContent = messageKey ? t(messageKey, {}, fallback) : fallback;
    editorLayout.hidden = true;
    if (redirect) {
      window.setTimeout(() => {
        location.href = 'viewer-stats.html';
      }, 1800);
    }
  }

  function updateRangeValue(inputId, valueId, suffix = 'px') {
    const input = $(inputId);
    const value = $(valueId);
    if (input && value) value.textContent = `${input.value}${suffix}`;
  }

  function syncPresetControls() {
    document.querySelectorAll('[data-overlay-select][data-overlay-value]').forEach((button) => {
      const select = $(button.dataset.overlaySelect);
      const active = Boolean(select && select.value === button.dataset.overlayValue);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setSelectFromPreset(button) {
    const select = $(button.dataset.overlaySelect);
    if (!select) return;
    select.value = button.dataset.overlayValue || select.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncPresetControls();
  }

  function dimensions() {
    return {
      width: clampNumber($('overlayWidth')?.value, DEFAULT_WIDTH, 320, 7680),
      height: clampNumber($('overlayHeight')?.value, DEFAULT_HEIGHT, 180, 4320)
    };
  }

  function inputValue(id, fallback = '') {
    return safeText($(id)?.value, fallback);
  }

  function inputNumber(id, fallback, min, max) {
    return clampNumber($(id)?.value, fallback, min, max);
  }

  function inputChecked(id, fallback = false) {
    const node = $(id);
    return node ? Boolean(node.checked) : fallback;
  }

  function opacityValue(id, fallback = 50) {
    return inputNumber(id, fallback, 0, 100) / 100;
  }

  function collectTypeSettings() {
    const type = normalizeOverlayType(currentOverlayType || 'CUSTOM');
    if (type === 'CHAT') {
      return {
        width: inputNumber('chatWidth', 560, 260, 1200),
        height: inputNumber('chatHeight', 640, 180, 1000),
        maxMessages: inputNumber('chatMaxMessages', 8, 1, 20),
        nameColor: inputValue('chatNameColor', '#f9a8d4'),
        messageColor: inputValue('chatMessageColor', '#ffffff'),
        backgroundOpacity: opacityValue('chatBackgroundOpacity', 46),
        fontSize: inputNumber('chatFontSize', 28, 12, 64),
        sampleMessage: inputValue('chatSampleMessage', t('overlay.chatSampleMessage1', {}, '오늘 방송 분위기 너무 좋아요!'))
      };
    }
    if (type === 'DONATION') {
      return {
        title: inputValue('donationTitle', t('overlay.previewMessage', {}, '응원 메시지가 도착했습니다')),
        showName: inputChecked('donationShowName', true),
        showAmount: inputChecked('donationShowAmount', true),
        showMessage: inputChecked('donationShowMessage', true),
        animation: inputValue('donationAnimation', 'pop'),
        durationSeconds: inputNumber('donationDuration', 6, 2, 30)
      };
    }
    if (type === 'FOLLOW') {
      return {
        text: inputValue('followText', t('overlay.previewFollow', {}, '새 팔로워가 찾아왔습니다')),
        showName: inputChecked('followShowName', true),
        animation: inputValue('followAnimation', 'slide')
      };
    }
    if (type === 'FAN_CARD') {
      return {
        title: inputValue('fanCardText', t('overlay.previewFanCard', {}, '새 팬카드가 도착했습니다')),
        author: inputValue('fanCardAuthor', t('overlay.testAlertName', {}, 'Seiga Viewer')),
        message: inputValue('fanCardMessage', t('overlay.fanCardSampleMessage', {}, '방송 항상 즐겁게 보고 있어요!')),
        animation: inputValue('fanCardAnimation', 'fade')
      };
    }
    return {
      codeFirst: true
    };
  }

  function applyTypeSettings(config = {}) {
    const key = typeConfigKey(currentOverlayType);
    const settings = config[key] || {};
    if (currentOverlayType === 'CHAT') {
      if ($('chatWidth')) $('chatWidth').value = settings.width || 560;
      if ($('chatHeight')) $('chatHeight').value = settings.height || 640;
      if ($('chatMaxMessages')) $('chatMaxMessages').value = settings.maxMessages || 8;
      if ($('chatNameColor')) $('chatNameColor').value = settings.nameColor || '#f9a8d4';
      if ($('chatMessageColor')) $('chatMessageColor').value = settings.messageColor || '#ffffff';
      if ($('chatBackgroundOpacity')) $('chatBackgroundOpacity').value = Math.round(Number(settings.backgroundOpacity ?? 0.46) * 100);
      if ($('chatFontSize')) $('chatFontSize').value = settings.fontSize || 28;
      if ($('chatSampleMessage')) $('chatSampleMessage').value = safeText(settings.sampleMessage, t('overlay.chatSampleMessage1', {}, '오늘 방송 분위기 너무 좋아요!'));
    }
    if (currentOverlayType === 'DONATION') {
      if ($('donationTitle')) $('donationTitle').value = safeText(settings.title, t('overlay.previewMessage', {}, '응원 메시지가 도착했습니다'));
      if ($('donationShowName')) $('donationShowName').checked = settings.showName !== false;
      if ($('donationShowAmount')) $('donationShowAmount').checked = settings.showAmount !== false;
      if ($('donationShowMessage')) $('donationShowMessage').checked = settings.showMessage !== false;
      if ($('donationAnimation')) $('donationAnimation').value = safeText(settings.animation, 'pop');
      if ($('donationDuration')) $('donationDuration').value = settings.durationSeconds || 6;
    }
    if (currentOverlayType === 'FOLLOW') {
      if ($('followText')) $('followText').value = safeText(settings.text, t('overlay.previewFollow', {}, '새 팔로워가 찾아왔습니다'));
      if ($('followShowName')) $('followShowName').checked = settings.showName !== false;
      if ($('followAnimation')) $('followAnimation').value = safeText(settings.animation, 'slide');
    }
    if (currentOverlayType === 'FAN_CARD') {
      if ($('fanCardText')) $('fanCardText').value = safeText(settings.title, t('overlay.previewFanCard', {}, '새 팬카드가 도착했습니다'));
      if ($('fanCardAuthor')) $('fanCardAuthor').value = safeText(settings.author, t('overlay.testAlertName', {}, 'Seiga Viewer'));
      if ($('fanCardMessage')) $('fanCardMessage').value = safeText(settings.message, t('overlay.fanCardSampleMessage', {}, '방송 항상 즐겁게 보고 있어요!'));
      if ($('fanCardAnimation')) $('fanCardAnimation').value = safeText(settings.animation, 'fade');
    }
    updateRangeValue('chatBackgroundOpacity', 'chatBackgroundOpacityValue', '%');
  }

  function widgetLabels() {
    return {
      message: t('overlay.previewMessage', {}, '응원 메시지가 도착했습니다'),
      fanCard: t('overlay.previewFanCard', {}, '새 팬카드가 도착했습니다'),
      follow: t('overlay.previewFollow', {}, '새 팔로워가 찾아왔습니다')
    };
  }

  function themeStyle(theme) {
    if (theme === 'minimalDark') {
      return {
        color: '#ffffff',
        background: 'rgba(16, 24, 40, 0.84)',
        border: 'rgba(255, 255, 255, 0.18)'
      };
    }
    if (theme === 'cutePop') {
      return {
        color: '#831843',
        background: 'rgba(253, 242, 248, 0.9)',
        border: 'rgba(249, 168, 212, 0.5)'
      };
    }
    return {
      color: '#2f2946',
      background: 'rgba(255, 255, 255, 0.76)',
      border: 'rgba(255, 255, 255, 0.54)'
    };
  }

  function basePosition(position, index, count, width, height) {
    const widgetWidth = Math.min(620, Math.max(360, Math.round(width * 0.32)));
    const widgetHeight = 118;
    const gap = 22;
    const stackHeight = (widgetHeight * count) + (gap * Math.max(0, count - 1));
    const startY = Math.max(40, height - stackHeight - 80);
    const centerX = Math.round((width - widgetWidth) / 2);
    const centerY = Math.round((height - stackHeight) / 2);
    const bottomY = startY + (index * (widgetHeight + gap));

    if (position === 'bottomRight') return { x: width - widgetWidth - 80, y: bottomY, width: widgetWidth, height: widgetHeight };
    if (position === 'bottomCenter') return { x: centerX, y: bottomY, width: widgetWidth, height: widgetHeight };
    if (position === 'center') return { x: centerX, y: centerY + (index * (widgetHeight + gap)), width: widgetWidth, height: widgetHeight };
    return { x: 80, y: bottomY, width: widgetWidth, height: widgetHeight };
  }

  function selectedWidgetKinds() {
    const kinds = [];
    if ($('widgetMessage')?.checked) kinds.push('message');
    if ($('widgetFanCard')?.checked) kinds.push('fanCard');
    if ($('widgetFollow')?.checked) kinds.push('follow');
    return kinds;
  }

  function buildConfigFromBuilder() {
    const { width, height } = dimensions();
    const kinds = selectedWidgetKinds();
    const labels = widgetLabels();
    const theme = safeText($('overlayTheme')?.value, 'pastelGlass');
    const style = themeStyle(theme);
    const position = 'bottomLeft';
    const accent = safeText($('overlayColor')?.value, '#a78bfa');
    const fontSize = clampNumber($('overlayFontSize')?.value, 28, 8, 240);
    const borderRadius = clampNumber($('overlayRadius')?.value, 28, 0, 200);
    const animation = safeText($('overlayAnimation')?.value, 'none');

    const widgets = kinds.map((kind, index) => {
      const box = basePosition(position, index, kinds.length, width, height);
      return {
        id: WIDGET_IDS[kind],
        type: kind === 'follow' ? 'latestFollower' : (kind === 'message' ? 'alert' : 'text'),
        text: labels[kind],
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: kind === 'follow' ? accent : style.color,
        background: style.background,
        borderRadius,
        fontSize,
        animation
      };
    });

    return {
      version: 1,
      background: 'transparent',
      widgets
    };
  }

  function widgetKind(widget = {}) {
    if (widget.id === WIDGET_IDS.message || widget.type === 'alert') return 'message';
    if (widget.id === WIDGET_IDS.follow || widget.type === 'latestFollower') return 'follow';
    if (widget.id === WIDGET_IDS.fanCard || widget.type === 'text') return 'fanCard';
    return '';
  }

  function inferPosition(widget = {}) {
    const { width, height } = dimensions();
    const x = Number(widget.x || 0);
    const y = Number(widget.y || 0);
    if (Math.abs(x - ((width - Number(widget.width || 0)) / 2)) < width * 0.12 && y < height * 0.68) return 'center';
    if (Math.abs(x - ((width - Number(widget.width || 0)) / 2)) < width * 0.12) return 'bottomCenter';
    if (x > width / 2) return 'bottomRight';
    return 'bottomLeft';
  }

  function applyConfigToBuilder(config = {}) {
    const widgets = Array.isArray(config.widgets) ? config.widgets : [];
    const kinds = new Set(widgets.map(widgetKind).filter(Boolean));
    if (widgets.length) {
      $('widgetMessage').checked = kinds.has('message');
      $('widgetFanCard').checked = kinds.has('fanCard');
      $('widgetFollow').checked = kinds.has('follow');
      const first = widgets[0] || {};
      $('overlayColor').value = safeText(first.color, '#a78bfa').startsWith('#') ? first.color : '#a78bfa';
      $('overlayFontSize').value = String(clampNumber(first.fontSize, 28, 18, 64));
      $('overlayRadius').value = String(clampNumber(first.borderRadius, 28, 0, 64));
      $('overlayAnimation').value = safeText(first.animation, 'none');
      if ($('overlayPosition')) $('overlayPosition').value = inferPosition(first);
    }
    updateRangeValue('overlayFontSize', 'overlayFontSizeValue');
    updateRangeValue('overlayRadius', 'overlayRadiusValue');
    syncPresetControls();
  }

  function currentMode() {
    return safeText($('overlayMode')?.value, 'CUSTOM_HTML_CSS').toUpperCase();
  }

  function isCustomMode() {
    return currentMode() === 'CUSTOM_HTML_CSS' || currentMode() === 'CUSTOM_ADVANCED';
  }

  function canRunCustomJs() {
    if (currentMode() !== 'CUSTOM_ADVANCED') return false;
    if (isAdmin) return $('allowCustomJs')?.checked === true;
    return serverAllowsCustomJs === true;
  }

  function setObsUrl(url) {
    const input = $('overlayObsUrl');
    if (input) input.value = safeText(url);
  }

  function updateStaticLabels() {
    const title = safeText($('overlayTitle')?.value, t('overlay.untitled', {}, '이름 없는 오버레이'));
    document.title = `${title} - Seiga Studio`;
    const badge = $('overlayEditorModeBadge');
    if (badge) {
      badge.textContent = overlayId ? t('common.edit', {}, '편집') : t('overlay.newShort', {}, '신규');
    }
    const { width, height } = dimensions();
    $('obsWidthValue').textContent = String(width);
    $('obsHeightValue').textContent = String(height);
    const previewBadge = $('previewSizeBadge');
    if (previewBadge) previewBadge.textContent = `${width} x ${height}`;
  }

  function updateModeControls() {
    const custom = isCustomMode();
    const advanced = currentMode() === 'CUSTOM_ADVANCED';
    const builder = $('builderControls');
    const code = $('customCodeControls');
    if (builder) builder.hidden = true;
    if (code) code.hidden = false;

    const allowRow = $('allowCustomJsRow');
    const allowToggle = $('allowCustomJs');
    const jsCode = $('overlayJsCode');
    if (allowRow) allowRow.hidden = !isAdmin;
    if (allowToggle) allowToggle.disabled = !isAdmin || !advanced;
    if (jsCode) {
      jsCode.disabled = !canRunCustomJs();
      jsCode.placeholder = canRunCustomJs()
        ? t('overlay.jsCodePlaceholder', {}, 'console.log 없이 overlay iframe 안에서만 실행됩니다.')
        : t('overlay.jsLockedPlaceholder', {}, '고급 모드 준비 중');
    }
    const policy = $('overlayJsPolicy');
    if (policy) {
      policy.textContent = canRunCustomJs()
        ? t('overlay.jsAllowedPolicy', {}, '관리자 권한으로 sandbox iframe에서만 JavaScript를 미리보기합니다.')
        : (advanced
          ? t('overlay.advanced.locked', {}, 'JavaScript 고급 모드는 현재 비활성화되어 있습니다.')
          : t('overlay.jsPolicy', {}, 'v1에서는 일반 스트리머의 JavaScript 실행을 지원하지 않습니다.'));
    }
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

  function syncPreviewScale() {
    const canvas = document.querySelector('.overlay-preview-viewport') || document.querySelector('.overlay-preview-canvas');
    const stage = $('overlayPreviewStage');
    const frame = $('overlayPreviewFrame');
    if (!canvas || !stage) return;
    const { width, height } = dimensions();
    canvas.style.setProperty('--overlay-preview-ratio', `${width} / ${height}`);
    canvas.style.setProperty('--overlay-preview-stage-width', `${width}px`);
    canvas.style.setProperty('--overlay-preview-stage-height', `${height}px`);
    stage.style.setProperty('--overlay-preview-stage-width', `${width}px`);
    stage.style.setProperty('--overlay-preview-stage-height', `${height}px`);
    if (frame) {
      frame.setAttribute('width', String(width));
      frame.setAttribute('height', String(height));
    }
    const viewportWidth = canvas.clientWidth;
    const viewportHeight = canvas.clientHeight;
    if (!viewportWidth || !viewportHeight) {
      stage.style.setProperty('--overlay-preview-scale', '1');
      return;
    }
    const scale = Math.max(0.01, Math.min(viewportWidth / width, viewportHeight / height));
    stage.style.setProperty('--overlay-preview-scale', String(scale));
  }

  function setupPreviewResizeObserver() {
    const canvas = document.querySelector('.overlay-preview-viewport') || document.querySelector('.overlay-preview-canvas');
    if (!canvas) return;
    if (previewResizeObserver) previewResizeObserver.disconnect();
    if ('ResizeObserver' in window) {
      previewResizeObserver = new ResizeObserver(() => syncPreviewScale());
      previewResizeObserver.observe(canvas);
    }
    window.addEventListener('resize', syncPreviewScale);
    syncPreviewScale();
  }

  function widgetDocumentMarkup(widgets, width, height) {
    if (!widgets.length) {
      return `<div class="empty">${escapeHtml(t('overlay.previewEmpty', {}, '표시할 위젯을 선택하세요.'))}</div>`;
    }
    return widgets.map((widget) => {
      const left = (Number(widget.x || 0) / width) * 100;
      const top = (Number(widget.y || 0) / height) * 100;
      const boxWidth = (Number(widget.width || 320) / width) * 100;
      const boxHeight = (Number(widget.height || 120) / height) * 100;
      const animation = safeText(widget.animation, 'none') !== 'none' ? ` animation-${escapeHtml(widget.animation)}` : '';
      const style = [
        `left:${left.toFixed(3)}%`,
        `top:${top.toFixed(3)}%`,
        `width:${boxWidth.toFixed(3)}%`,
        `min-height:${boxHeight.toFixed(3)}%`,
        `color:${escapeHtml(widget.color || '#2f2946')}`,
        `background:${escapeHtml(widget.background || 'rgba(255,255,255,.76)')}`,
        `border-radius:${clampNumber(widget.borderRadius, 28, 0, 200)}px`,
        `font-size:${clampNumber(widget.fontSize, 28, 8, 240)}px`
      ].join(';');
      return `<div class="widget widget--${escapeHtml(widget.type || 'text')}${animation}" style="${style}"><span>${escapeHtml(widget.text || t('overlay.previewText', {}, '라이브 오버레이 알림'))}</span></div>`;
    }).join('');
  }

  function basePreviewCss(width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
    return `
      :root { --overlay-width: ${width}px; --overlay-height: ${height}px; --overlay-scale: calc(100vw / ${width}); }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Noto Sans KR", "Noto Sans JP", "Segoe UI", sans-serif; }
      .stage, .custom-root { position: relative; width: var(--overlay-width); height: var(--overlay-height); overflow: hidden; background: transparent; transform: scale(var(--overlay-scale)); transform-origin: top left; }
      .widget { position: absolute; display: flex; align-items: center; gap: 18px; padding: 24px 30px; border: 1px solid rgba(255,255,255,.48); box-shadow: 0 30px 80px rgba(18,24,38,.24); backdrop-filter: blur(22px) saturate(1.2); font-weight: 950; line-height: 1.25; overflow: hidden; overflow-wrap: anywhere; word-break: keep-all; }
      .widget--latestFollower::before, .widget--alert::before { content: "!"; width: 52px; height: 52px; border-radius: 18px; display: grid; place-items: center; flex: 0 0 auto; color: currentColor; background: rgba(255,255,255,.28); border: 1px solid rgba(255,255,255,.32); }
      .widget--latestFollower::before { content: "+"; }
      .empty { position: absolute; inset: 0; display: grid; place-items: center; color: #6b6680; font-size: 28px; font-weight: 900; }
      .nestory-test-alert { position: absolute; left: 80px; bottom: 80px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 18px; align-items: center; width: min(720px, calc(100% - 160px)); min-height: 120px; padding: 24px 28px; border-radius: 28px; color: #fff; background: rgba(17,24,39,.64); border: 1px solid rgba(255,255,255,.2); box-shadow: 0 28px 80px rgba(0,0,0,.22); backdrop-filter: blur(18px); overflow: hidden; }
      .nestory-test-image { width: 76px; height: 76px; border-radius: 22px; object-fit: cover; background: rgba(255,255,255,.18); }
      .nestory-test-alert strong { display: block; font-size: 28px; line-height: 1.2; font-weight: 950; color: #f9a8d4; }
      .nestory-test-alert span { display: block; margin-top: 6px; font-size: 26px; line-height: 1.35; font-weight: 850; overflow-wrap: anywhere; }
      .nestory-test-alert em { display: inline-flex; width: max-content; margin-top: 10px; padding: 6px 10px; border-radius: 999px; font-style: normal; font-size: 18px; font-weight: 950; background: rgba(167,139,250,.24); }
      .nestory-test-copy { display: grid; gap: 6px; min-width: 0; }
      .nestory-test-copy strong { color: #f9a8d4; font-size: 28px; line-height: 1.2; }
      .nestory-test-copy span { font-size: 26px; line-height: 1.35; }
      .nestory-test-copy em { width: max-content; padding: 6px 10px; border-radius: 999px; background: rgba(167,139,250,.24); font-style: normal; font-size: 18px; font-weight: 950; }
      .nestory-test-chat { position: absolute; left: 80px; bottom: 80px; width: min(620px, calc(100% - 160px)); display: grid; gap: 12px; padding: 18px; border-radius: 24px; background: rgba(17,24,39,.52); border: 1px solid rgba(255,255,255,.18); backdrop-filter: blur(18px); box-shadow: 0 28px 80px rgba(0,0,0,.2); }
      .nestory-test-chat-line { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 12px 14px; border-radius: 18px; color: #fff; background: rgba(255,255,255,.12); font-size: 28px; line-height: 1.35; }
      .nestory-test-chat-line strong { color: #f9a8d4; font-weight: 950; }
      .nestory-test-chat-line span { min-width: 0; color: rgba(255,255,255,.94); font-weight: 850; overflow-wrap: anywhere; }
      .animation-fade { animation: fade 4.5s ease-in-out infinite; }
      .animation-slide { animation: slide 4.5s ease-in-out infinite; }
      .animation-pop { animation: pop 4.5s ease-in-out infinite; }
      .animation-pulse { animation: pulse 2.4s ease-in-out infinite; }
      @keyframes fade { 0%, 100% { opacity: .68; } 45%, 70% { opacity: 1; } }
      @keyframes slide { 0%, 100% { transform: translateY(16px); opacity: .72; } 45%, 70% { transform: translateY(0); opacity: 1; } }
      @keyframes pop { 0%, 100% { transform: scale(.96); opacity: .78; } 45%, 70% { transform: scale(1); opacity: 1; } }
      @keyframes pulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.12); } }
    `;
  }

  function previewDocumentForBuilder() {
    const { width, height } = dimensions();
    const config = buildConfigFromBuilder();
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${basePreviewCss(width, height)}</style></head><body><main class="stage">${widgetDocumentMarkup(config.widgets, width, height)}</main></body></html>`;
  }

  function testAlertData() {
    const type = normalizeOverlayType(currentOverlayType || 'CUSTOM');
    const settings = collectTypeSettings();
    if (type === 'CHAT') {
      return {
        type: 'test',
        overlayType: type,
        eventName: 'Chat',
        username: t('overlay.testAlertName', {}, 'Seiga Viewer'),
        name: t('overlay.testAlertName', {}, 'Seiga Viewer'),
        message: settings.sampleMessage || t('overlay.testAlertMessage', {}, '테스트 알림입니다'),
        amount: 1000,
        amountLabel: t('overlay.testAlertAmount', {}, '100 pt'),
        imageUrl: ''
      };
    }
    if (type === 'FOLLOW') {
      return {
        type: 'test',
        overlayType: type,
        eventName: 'Follow',
        username: t('overlay.testAlertName', {}, 'Seiga Viewer'),
        name: t('overlay.testAlertName', {}, 'Seiga Viewer'),
        message: settings.text || t('overlay.previewFollow', {}, '새 팔로워가 찾아왔습니다'),
        amount: 0,
        amountLabel: '',
        imageUrl: alertAssetUrl
      };
    }
    if (type === 'FAN_CARD') {
      return {
        type: 'test',
        overlayType: type,
        eventName: 'Fan Card',
        username: settings.author || t('overlay.testAlertName', {}, 'Seiga Viewer'),
        name: settings.author || t('overlay.testAlertName', {}, 'Seiga Viewer'),
        message: settings.message || t('overlay.fanCardSampleMessage', {}, '방송 항상 즐겁게 보고 있어요!'),
        amount: 0,
        amountLabel: settings.title || t('overlay.previewFanCard', {}, '새 팬카드가 도착했습니다'),
        imageUrl: alertAssetUrl
      };
    }
    return {
      type: 'test',
      overlayType: type,
      eventName: type === 'DONATION' ? 'Donation' : 'Alert',
      username: settings.showName === false ? '' : t('overlay.testAlertName', {}, 'Seiga Viewer'),
      name: settings.showName === false ? (settings.title || t('overlay.previewMessage', {}, '응원 메시지가 도착했습니다')) : t('overlay.testAlertName', {}, 'Seiga Viewer'),
      message: settings.showMessage === false ? (settings.title || t('overlay.previewMessage', {}, '응원 메시지가 도착했습니다')) : t('overlay.testAlertMessage', {}, '테스트 알림입니다'),
      amount: 1000,
      amountLabel: settings.showAmount === false ? '' : t('overlay.testAlertAmount', {}, '100 pt'),
      imageUrl: alertAssetUrl
    };
  }

  function testChatLineMarkup(data = testAlertData()) {
    const settings = normalizeOverlayType(currentOverlayType) === 'CHAT' ? collectTypeSettings() : {};
    const fontSize = clampNumber(settings.fontSize, 28, 12, 64);
    const nameColor = escapeHtml(settings.nameColor || '#f9a8d4');
    const messageColor = escapeHtml(settings.messageColor || '#ffffff');
    return `<div class="nestory-test-chat-line" data-overlay-chat-message style="font-size:${fontSize}px"><strong data-alert-name style="color:${nameColor}">${escapeHtml(data.name)}</strong><span data-alert-message style="color:${messageColor}">${escapeHtml(data.message)}</span></div>`;
  }

  function testAlertMarkup(data = testAlertData()) {
    if (normalizeOverlayType(data.overlayType) === 'CHAT') {
      const settings = collectTypeSettings();
      const width = clampNumber(settings.width, 560, 260, 1200);
      const height = clampNumber(settings.height, 640, 180, 1000);
      const opacity = Math.max(0, Math.min(1, Number(settings.backgroundOpacity ?? 0.46)));
      return `<section class="nestory-test-chat" data-overlay-alert data-overlay-chat-list style="width:${width}px;max-height:${height}px;background:rgba(17,24,39,${opacity})">${testChatLineMarkup(data)}</section>`;
    }
    const settings = collectTypeSettings();
    const animation = safeText(settings.animation, '');
    const animationClass = animation ? ` animation-${escapeHtml(animation)}` : '';
    const image = data.imageUrl
      ? `<img class="nestory-test-image" src="${escapeHtml(data.imageUrl)}" alt="" data-alert-image />`
      : `<span class="nestory-test-image" aria-hidden="true"></span>`;
    return `<section class="nestory-test-alert${animationClass}" data-overlay-alert data-overlay-event="${escapeHtml(data.eventName)}">${image}<div><strong data-alert-name>${escapeHtml(data.name)}</strong><span data-alert-message>${escapeHtml(data.message)}</span><em data-alert-amount>${escapeHtml(data.amountLabel || data.amount || '')}</em></div></section>`;
  }

  function applyTestAlertToMarkup(markup) {
    if (!testAlertVisible) return markup;
    const template = document.createElement('template');
    template.innerHTML = markup || '';
    const data = testAlertData();
    let usedHook = false;
    const chatList = template.content.querySelector('[data-overlay-chat-list], [data-chat-list]');
    if (chatList) {
      chatList.insertAdjacentHTML('beforeend', testChatLineMarkup(data));
      usedHook = true;
    }
    template.content.querySelectorAll('[data-alert-name]').forEach((node) => {
      node.textContent = data.name;
      usedHook = true;
    });
    template.content.querySelectorAll('[data-alert-message]').forEach((node) => {
      node.textContent = data.message;
      usedHook = true;
    });
    template.content.querySelectorAll('[data-alert-amount]').forEach((node) => {
      node.textContent = data.amountLabel || String(data.amount || '');
      usedHook = true;
    });
    template.content.querySelectorAll('img[data-alert-image]').forEach((node) => {
      if (data.imageUrl) node.src = data.imageUrl;
      usedHook = true;
    });
    const root = template.content.querySelector('[data-overlay-alert]');
    if (root && data.imageUrl && !root.querySelector('img[data-alert-image]')) {
      const image = document.createElement('img');
      image.className = 'nestory-test-image';
      image.dataset.alertImage = 'true';
      image.alt = '';
      image.src = data.imageUrl;
      root.prepend(image);
      usedHook = true;
    }
    if (!usedHook) {
      if (root) {
        root.insertAdjacentHTML('beforeend', `<div class="nestory-test-copy"><strong>${escapeHtml(data.name)}</strong><span>${escapeHtml(data.message)}</span><em>${escapeHtml(data.amountLabel || data.amount || '')}</em></div>`);
      } else {
        template.innerHTML += testAlertMarkup(data);
      }
    }
    return template.innerHTML;
  }

  function previewDocumentForCustom() {
    const { width, height } = dimensions();
    let htmlCode = stripUnsupportedMarkup($('overlayHtmlCode')?.value || '');
    htmlCode = applyTestAlertToMarkup(htmlCode);
    const cssCode = sanitizeStyleBlock($('overlayCssCode')?.value || '');
    const jsCode = canRunCustomJs() ? sanitizeScriptBlock($('overlayJsCode')?.value || '') : '';
    const script = jsCode ? `<script>${jsCode}<\\/script>` : '';
    const body = htmlCode || `<div class="empty">${escapeHtml(t('overlay.previewEmpty', {}, '표시할 위젯을 선택하세요.'))}</div>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${basePreviewCss(width, height)}${cssCode}</style></head><body><main class="custom-root">${body}</main>${script}</body></html>`;
  }

  function renderPreview() {
    updateStaticLabels();
    updateModeControls();
    syncPresetControls();
    syncPreviewScale();
    const frame = $('overlayPreviewFrame');
    if (!frame) return;
    frame.setAttribute('sandbox', canRunCustomJs() ? 'allow-scripts' : '');
    const shouldPostTestEvent = testAlertVisible && canRunCustomJs();
    if (shouldPostTestEvent) {
      frame.addEventListener('load', () => {
        try {
          frame.contentWindow?.postMessage({
            source: 'nestory-overlay-editor',
            type: 'overlay-test',
            payload: testAlertData()
          }, '*');
        } catch (_error) {
          // sandbox preview에만 전달하는 테스트 이벤트라 실패해도 화면 렌더링은 유지합니다.
        }
      }, { once: true });
    }
    frame.srcdoc = isCustomMode() ? previewDocumentForCustom() : previewDocumentForBuilder();
  }

  function activateCustomHtmlMode() {
    const mode = $('overlayMode');
    if (!mode || mode.value !== 'BUILDER') return;
    mode.value = 'CUSTOM_HTML_CSS';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function defaultAlertHtml() {
    return `<section class="stream-alert" data-overlay-alert>
  <img class="alert-image" data-alert-image alt="" />
  <div class="alert-copy">
    <strong data-alert-name>${escapeHtml(t('overlay.testAlertName', {}, 'Seiga Viewer'))}</strong>
    <span data-alert-message>${escapeHtml(t('overlay.testAlertMessage', {}, '테스트 알림입니다'))}</span>
    <em data-alert-amount>${escapeHtml(t('overlay.testAlertAmount', {}, '100 pt'))}</em>
  </div>
</section>`;
  }

  function defaultAlertCss() {
    return `.stream-alert {
  position: absolute;
  right: 80px;
  bottom: 80px;
  width: 620px;
  min-height: 136px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  padding: 26px 30px;
  border-radius: 30px;
  color: #ffffff;
  background: rgba(17, 24, 39, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);
}

.alert-image {
  width: 82px;
  height: 82px;
  border-radius: 24px;
  object-fit: cover;
  background: linear-gradient(135deg, #a78bfa, #f9a8d4);
}

.alert-copy strong {
  display: block;
  color: #f9a8d4;
  font-size: 30px;
  line-height: 1.2;
  font-weight: 950;
}

.alert-copy span {
  display: block;
  margin-top: 6px;
  font-size: 28px;
  line-height: 1.35;
  font-weight: 850;
}

.alert-copy em {
  display: inline-flex;
  width: max-content;
  margin-top: 10px;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(167, 139, 250, 0.28);
  font-style: normal;
  font-size: 18px;
  font-weight: 950;
}`;
  }

  function chatTemplateHtml() {
    return `<section class="nestory-chat-overlay" data-chat-list aria-label="${escapeHtml(t('overlay.chatTemplate', {}, '채팅창 템플릿'))}">
  <div class="chat-line">
    <span class="chat-time">21:04</span>
    <strong class="chat-name">${escapeHtml(t('overlay.chatSampleUser1', {}, 'SeigaFan'))}</strong>
    <span class="chat-message">${escapeHtml(t('overlay.chatSampleMessage1', {}, '오늘 방송 분위기 너무 좋아요!'))}</span>
  </div>
  <div class="chat-line is-highlight">
    <span class="chat-time">21:05</span>
    <strong class="chat-name">${escapeHtml(t('overlay.chatSampleUser2', {}, 'NekoViewer'))}</strong>
    <span class="chat-message">${escapeHtml(t('overlay.chatSampleMessage2', {}, '새 오버레이 귀엽다!'))}</span>
  </div>
  <div class="chat-line">
    <span class="chat-time">21:06</span>
    <strong class="chat-name">${escapeHtml(t('overlay.chatSampleUser3', {}, 'TwitchBuddy'))}</strong>
    <span class="chat-message">${escapeHtml(t('overlay.chatSampleMessage3', {}, '다음 판도 응원합니다.'))}</span>
  </div>
</section>`;
  }

  function chatTemplateCss() {
    return `.nestory-chat-overlay {
  position: absolute;
  left: 80px;
  bottom: 80px;
  width: 560px;
  max-height: 640px;
  display: grid;
  gap: 14px;
  padding: 24px;
  border-radius: 28px;
  background: rgba(17, 24, 39, 0.46);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.chat-line {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 28px;
  line-height: 1.35;
}

.chat-line.is-highlight {
  background: rgba(167, 139, 250, 0.26);
}

.chat-time {
  color: rgba(255, 255, 255, 0.58);
  font-size: 18px;
  font-weight: 800;
}

.chat-name {
  color: #f9a8d4;
  font-weight: 950;
}

.chat-message {
  min-width: 0;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 850;
  overflow-wrap: anywhere;
}`;
  }

  function followTemplateHtml() {
    return `<section class="stream-alert stream-alert--follow" data-overlay-alert>
  <img class="alert-image" data-alert-image alt="" />
  <div class="alert-copy">
    <strong data-alert-name>${escapeHtml(t('overlay.testAlertName', {}, 'Seiga Viewer'))}</strong>
    <span data-alert-message>${escapeHtml(t('overlay.previewFollow', {}, '새 팔로워가 찾아왔습니다'))}</span>
    <em data-alert-amount>Follow</em>
  </div>
</section>`;
  }

  function fanCardTemplateHtml() {
    return `<section class="stream-alert stream-alert--fan-card" data-overlay-alert>
  <img class="alert-image" data-alert-image alt="" />
  <div class="alert-copy">
    <strong data-alert-name>${escapeHtml(t('overlay.testAlertName', {}, 'Seiga Viewer'))}</strong>
    <span data-alert-message>${escapeHtml(t('overlay.fanCardSampleMessage', {}, '방송 항상 즐겁게 보고 있어요!'))}</span>
    <em data-alert-amount>${escapeHtml(t('overlay.previewFanCard', {}, '새 팬카드가 도착했습니다'))}</em>
  </div>
</section>`;
  }

  function customTemplateHtml() {
    return `<section class="custom-overlay" data-overlay-alert>
  <strong data-alert-name>${escapeHtml(t('overlay.testAlertName', {}, 'Seiga Viewer'))}</strong>
  <span data-alert-message>${escapeHtml(t('overlay.testAlertMessage', {}, '테스트 알림입니다'))}</span>
</section>`;
  }

  function customTemplateCss() {
    return `.custom-overlay {
  position: absolute;
  left: 80px;
  bottom: 80px;
  min-width: 420px;
  display: grid;
  gap: 8px;
  padding: 28px 32px;
  border-radius: 28px;
  color: #ffffff;
  background: rgba(17, 24, 39, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

.custom-overlay strong {
  color: #f9a8d4;
  font-size: 30px;
  font-weight: 950;
}

.custom-overlay span {
  font-size: 26px;
  font-weight: 850;
}`;
  }

  function templateForType(type) {
    const value = normalizeOverlayType(type || currentOverlayType || 'CUSTOM');
    if (value === 'CHAT') return { html: chatTemplateHtml(), css: chatTemplateCss() };
    if (value === 'FOLLOW') return { html: followTemplateHtml(), css: defaultAlertCss() };
    if (value === 'FAN_CARD') return { html: fanCardTemplateHtml(), css: defaultAlertCss() };
    if (value === 'CUSTOM') return { html: customTemplateHtml(), css: customTemplateCss() };
    return { html: defaultAlertHtml(), css: defaultAlertCss() };
  }

  function defaultTitleForType(type) {
    const value = normalizeOverlayType(type || 'CUSTOM');
    if (value === 'CHAT') return t('overlay.defaultChatName', {}, '채팅창 오버레이');
    if (value === 'DONATION') return t('overlay.defaultDonationName', {}, '후원 알림 오버레이');
    if (value === 'FOLLOW') return t('overlay.defaultFollowName', {}, '팔로우 알림 오버레이');
    if (value === 'FAN_CARD') return t('overlay.defaultFanCardName', {}, '팬카드 알림 오버레이');
    return t('overlay.defaultCustomName', {}, '커스텀 오버레이');
  }

  function applyTemplateForType(type = currentOverlayType) {
    const template = templateForType(type);
    if ($('overlayMode')) $('overlayMode').value = type === 'CUSTOM' ? 'CUSTOM_HTML_CSS' : 'CUSTOM_HTML_CSS';
    if ($('overlayHtmlCode')) $('overlayHtmlCode').value = template.html;
    if ($('overlayCssCode')) $('overlayCssCode').value = template.css;
    if ($('overlayJsCode')) $('overlayJsCode').value = '';
  }

  function applyChatTemplate() {
    setOverlayType('CHAT', { applyTemplate: true });
    if ($('overlayMode')) $('overlayMode').dispatchEvent(new Event('change', { bubbles: true }));
    renderPreview();
    api.showToast(t('overlay.chatTemplateApplied', {}, '채팅창 템플릿을 적용했습니다.'));
  }

  function renderAlertAssetPreview() {
    const preview = $('overlayAlertAssetPreview');
    const status = $('overlayAlertAssetStatus');
    if (!preview) return;
    if (alertAssetUrl) {
      preview.innerHTML = `<img src="${escapeHtml(alertAssetUrl)}" alt="" /><span>${escapeHtml(alertAssetName || t('overlay.alertAssetSelected', {}, '알림 이미지 선택됨'))}</span>`;
      preview.classList.add('has-asset');
      if (status) {
        status.textContent = alertAssetObjectUrl
          ? t('overlay.alertAssetPreviewOnly', {}, '선택한 이미지는 저장 시 업로드되고 Test 알림에 반영됩니다.')
          : t('overlay.alertAssetSaved', {}, '저장된 알림 이미지가 적용되어 있습니다.');
      }
      return;
    }
    preview.classList.remove('has-asset');
    preview.innerHTML = `<span>${escapeHtml(t('overlay.alertAssetEmpty', {}, '등록된 알림 이미지가 없습니다.'))}</span>`;
    if (status) status.textContent = t('overlay.alertAssetTodo', {}, '지원 형식: PNG, JPG, WebP, GIF. 파일 크기 제한은 서버 정책을 따릅니다.');
  }

  function handleAlertAssetChange(event) {
    const file = event.target.files?.[0] || null;
    revokeAlertAssetObjectUrl();
    alertAssetFile = null;
    alertAssetUrl = '';
    alertAssetName = '';
    if (!file) {
      renderAlertAssetPreview();
      renderPreview();
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      event.target.value = '';
      api.showToast(t('overlay.alertAssetInvalid', {}, 'PNG, JPG, WEBP, GIF 파일만 선택할 수 있습니다.'));
      renderAlertAssetPreview();
      renderPreview();
      return;
    }
    alertAssetObjectUrl = URL.createObjectURL(file);
    alertAssetUrl = alertAssetObjectUrl;
    alertAssetName = file.name;
    alertAssetFile = file;
    testAlertVisible = true;
    renderAlertAssetPreview();
    renderPreview();
  }

  function showTestAlert() {
    testAlertVisible = true;
    renderPreview();
    api.showToast(t('overlay.testAlertShown', {}, '미리보기 Test 알림을 표시했습니다.'));
  }

  function chooseOverlayType(type) {
    const nextType = normalizeOverlayType(type);
    if (!overlayId && !currentOverlay) {
      fillNewOverlay(nextType);
      return;
    }
    setOverlayType(nextType, { applyTemplate: true });
    applyTypeSettings({});
    testAlertVisible = true;
    showEditor();
    renderPreview();
    api.showToast(t('overlay.typeChanged', {}, '오버레이 타입을 변경했습니다.'));
  }

  function collectPayload() {
    const { width, height } = dimensions();
    const mode = currentMode();
    const title = safeText($('overlayTitle')?.value);
    if (!title) {
      throw new Error(t('overlay.titleRequired', {}, '오버레이 제목을 입력해주세요.'));
    }
    const status = safeText($('overlayStatus')?.value, 'DRAFT').toUpperCase();
    const allowCustomJs = canRunCustomJs();
    const configJson = buildConfigFromBuilder();
    configJson.editorMode = 'code';
    configJson.overlayType = normalizeOverlayType(currentOverlayType || 'CUSTOM');
    configJson[typeConfigKey(configJson.overlayType)] = collectTypeSettings();
    if (supportsAlertAsset(configJson.overlayType) && alertAssetUrl && !alertAssetObjectUrl) {
      configJson.assets = {
        ...(configJson.assets || {}),
        alertImageUrl: alertAssetUrl,
        alertImageName: alertAssetName
      };
      configJson.alertAssetUrl = alertAssetUrl;
      configJson.alertAssetName = alertAssetName;
    }
    return {
      title,
      name: title,
      description: safeText($('overlayDescription')?.value),
      mode,
      status,
      width,
      height,
      isEnabled: status !== 'DISABLED',
      htmlCode: $('overlayHtmlCode')?.value || '',
      cssCode: $('overlayCssCode')?.value || '',
      jsCode: $('overlayJsCode')?.value || '',
      allowCustomJs,
      configJson
    };
  }

  function fillForm(overlay = {}) {
    currentOverlay = overlay;
    serverAllowsCustomJs = Boolean(overlay.allowCustomJs);
    revokeAlertAssetObjectUrl();
    alertAssetFile = null;
    if ($('overlayAlertAsset')) $('overlayAlertAsset').value = '';
    const config = overlay.configJson || {};
    setOverlayType(overlayTypeFromOverlay(overlay), { applyTemplate: false });
    applyTypeSettings(config);
    const savedAssetUrl = normalizeAssetUrl(config.assets?.alertImageUrl || config.alertAssetUrl || overlay.thumbnailUrl || '');
    alertAssetUrl = savedAssetUrl;
    alertAssetName = safeText(config.assets?.alertImageName || config.alertAssetName || '', savedAssetUrl ? t('overlay.alertAssetSaved', {}, '저장된 알림 이미지') : '');
    testAlertVisible = false;
    $('overlayTitle').value = safeText(overlay.title || overlay.name, t('overlay.defaultName', {}, '방송 알림 오버레이'));
    $('overlayDescription').value = safeText(overlay.description);
    $('overlayMode').value = safeText(overlay.mode, 'CUSTOM_HTML_CSS').toUpperCase() === 'CUSTOM_ADVANCED'
      ? 'CUSTOM_ADVANCED'
      : 'CUSTOM_HTML_CSS';
    $('overlayStatus').value = safeText(overlay.status, overlay.isEnabled === false ? 'DISABLED' : 'DRAFT').toUpperCase();
    $('overlayWidth').value = String(clampNumber(overlay.width, DEFAULT_WIDTH, 320, 7680));
    $('overlayHeight').value = String(clampNumber(overlay.height, DEFAULT_HEIGHT, 180, 4320));
    $('overlayHtmlCode').value = safeText(overlay.htmlCode);
    $('overlayCssCode').value = safeText(overlay.cssCode);
    $('overlayJsCode').value = safeText(overlay.jsCode);
    $('allowCustomJs').checked = Boolean(overlay.allowCustomJs && isAdmin);
    applyConfigToBuilder(config);
    renderAlertAssetPreview();
    setObsUrl(overlayObsUrl(overlay));
    showEditor();
    updateStaticLabels();
    renderPreview();
    updateActionState();
  }

  function fillNewOverlay(type = 'CUSTOM') {
    const overlayType = normalizeOverlayType(type);
    setOverlayType(overlayType, { applyTemplate: true });
    fillForm({
      title: defaultTitleForType(overlayType),
      description: '',
      mode: 'CUSTOM_HTML_CSS',
      status: 'DRAFT',
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      htmlCode: $('overlayHtmlCode')?.value || templateForType(overlayType).html,
      cssCode: $('overlayCssCode')?.value || templateForType(overlayType).css,
      configJson: {
        ...buildConfigFromBuilder(),
        overlayType,
        [typeConfigKey(overlayType)]: collectTypeSettings()
      }
    });
  }

  async function loadOverlay() {
    if (!overlayId) {
      const requestedType = params.get('type');
      if (requestedType && OVERLAY_TYPES.includes(String(requestedType).toUpperCase())) {
        fillNewOverlay(requestedType);
      } else {
        showTypePicker();
      }
      return;
    }
    try {
      const payload = await api.getJson(`/api/overlays/${encodeURIComponent(overlayId)}`);
      const overlay = unwrapItem(payload);
      if (!overlay?.id) throw new Error(t('overlay.loadError', {}, '오버레이를 불러오지 못했습니다.'));
      fillForm(overlay);
    } catch (error) {
      const message = overlayErrorMessage(error, 'overlay.loadError', '오버레이를 불러오지 못했습니다.');
      setAccess('', message);
      api.showToast(message);
    }
  }

  function unwrapUploadedAsset(payload = {}) {
    const item = payload.item || payload.asset || payload;
    const url = normalizeAssetUrl(payload.url || item.url);
    if (!url) return null;
    return {
      url,
      name: safeText(item.fileName || item.originalName || alertAssetName, t('overlay.alertAssetSaved', {}, '저장된 알림 이미지'))
    };
  }

  async function uploadAlertAssetForOverlay(id) {
    if (!alertAssetFile || !id) return null;
    api.showToast(t('overlay.alertAssetUploading', {}, '알림 이미지를 업로드하는 중입니다.'));
    const payload = await api.uploadFile(`/api/overlays/${encodeURIComponent(id)}/assets`, 'asset', alertAssetFile);
    const uploaded = unwrapUploadedAsset(payload);
    if (!uploaded?.url) throw new Error(t('overlay.alertAssetUploadFailed', {}, '알림 이미지를 업로드하지 못했습니다.'));
    revokeAlertAssetObjectUrl();
    alertAssetFile = null;
    alertAssetUrl = uploaded.url;
    alertAssetName = uploaded.name;
    return uploaded;
  }

  async function saveOverlay() {
    const button = $('saveOverlayButton');
    button.disabled = true;
    try {
      const payload = collectPayload();
      api.showToast(t('overlay.saving', {}, '저장 중...'));
      const response = overlayId
        ? await api.patchJson(`/api/overlays/${encodeURIComponent(overlayId)}`, payload)
        : await api.postJson('/api/overlays', payload);
      let saved = unwrapItem(response);
      if (!saved?.id) throw new Error(t('overlay.saveFailed', {}, '오버레이를 저장하지 못했습니다.'));
      currentOverlay = saved;
      overlayId = saved.id;
      params.set('id', overlayId);
      history.replaceState(null, '', `overlay-editor.html?${params.toString()}`);
      if (alertAssetFile && supportsAlertAsset(currentOverlayType)) {
        try {
          const uploaded = await uploadAlertAssetForOverlay(overlayId);
          if (uploaded?.url) {
            const nextType = normalizeOverlayType(saved.configJson?.overlayType || payload.configJson?.overlayType || currentOverlayType || 'CUSTOM');
            const nextKey = typeConfigKey(nextType);
            const configJson = {
              ...(saved.configJson || payload.configJson || {}),
              overlayType: nextType,
              assets: {
                ...((saved.configJson || payload.configJson || {}).assets || {}),
                alertImageUrl: uploaded.url,
                alertImageName: uploaded.name
              },
              alertAssetUrl: uploaded.url,
              alertAssetName: uploaded.name
            };
            configJson[nextKey] = {
              ...(configJson[nextKey] || {}),
              alertImageUrl: uploaded.url,
              alertImageName: uploaded.name
            };
            const responseWithAsset = await api.patchJson(`/api/overlays/${encodeURIComponent(overlayId)}`, {
              ...payload,
              configJson
            });
            saved = unwrapItem(responseWithAsset) || { ...saved, configJson };
            api.showToast(t('overlay.alertAssetUploadDone', {}, '알림 이미지를 업로드했습니다.'));
          }
        } catch (assetError) {
          api.showToast(assetError.message || t('overlay.alertAssetUploadFailed', {}, '알림 이미지를 업로드하지 못했습니다.'));
        }
      }
      currentOverlay = saved;
      fillForm(saved);
      api.showToast(t('overlay.saveDone', {}, '오버레이를 저장했습니다.'));
    } catch (error) {
      api.showToast(overlayErrorMessage(error, 'overlay.saveFailed', '오버레이를 저장하지 못했습니다.'));
    } finally {
      button.disabled = false;
      updateActionState();
    }
  }

  async function regenerateToken() {
    if (!overlayId) {
      api.showToast(t('overlay.saveBeforeObs', {}, 'OBS URL은 저장 후 발급할 수 있습니다.'));
      return '';
    }
    if (!canUseObsUrl()) {
      api.showToast(obsBlockedMessage());
      updateActionState();
      return '';
    }
    const button = $('regenerateTokenButton');
    button.disabled = true;
    try {
      api.showToast(t('overlay.regenerating', {}, '재발급 중...'));
      const response = await api.postJson(`/api/overlays/${encodeURIComponent(overlayId)}/regenerate-token`, {});
      const updated = unwrapItem(response);
      currentOverlay = { ...(currentOverlay || {}), ...(updated || {}) };
      const url = overlayObsUrl(currentOverlay);
      setObsUrl(url);
      api.showToast(t('overlay.regenerateDone', {}, '새 OBS URL을 발급했습니다.'));
      return url;
    } catch (error) {
      api.showToast(error.message || t('overlay.regenerateFailed', {}, 'token 재발급에 실패했습니다.'));
      return '';
    } finally {
      updateActionState();
    }
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_error) {
        // 권한이 없는 브라우저에서는 아래 textarea fallback으로 한 번 더 시도합니다.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand?.('copy') === true;
    } catch (_error) {
      copied = false;
    } finally {
      textarea.remove();
    }
    return copied;
  }

  async function copyObsUrl() {
    if (!canUseObsUrl()) {
      api.showToast(obsBlockedMessage());
      updateActionState();
      return;
    }
    let url = safeText($('overlayObsUrl')?.value);
    if (!url) url = await regenerateToken();
    if (!url) {
      api.showToast(t('overlay.obsUrlMissing', {}, '복사할 OBS URL이 없습니다. token을 재발급해주세요.'));
      return;
    }
    if (await copyTextToClipboard(url)) {
      api.showToast(t('common.copyDone', {}, '복사 완료'));
      return;
    }
    api.showToast(t('common.copyFailed', {}, '복사 실패'));
  }

  function updateActionState() {
    const saved = Boolean(overlayId);
    const active = canUseObsUrl();
    const saveButton = $('saveOverlayButton');
    const copyButton = $('copyObsUrlButton');
    const tokenButton = $('regenerateTokenButton');
    if (saveButton) saveButton.disabled = !currentOverlayType;
    if (copyButton) copyButton.disabled = !active;
    if (tokenButton) tokenButton.disabled = !active;
    const state = $('overlayObsState');
    if (!state) return;
    state.classList.toggle('is-ready', active);
    state.classList.toggle('is-blocked', !active);
    if (!saved) {
      state.textContent = t('overlay.saveBeforeObs', {}, 'OBS URL은 저장 후 발급할 수 있습니다.');
    } else if (active) {
      state.textContent = t('overlay.obsActiveHint', {}, 'ACTIVE 상태입니다. OBS URL을 복사해 사용할 수 있습니다.');
    } else {
      state.textContent = obsBlockedMessage();
    }
  }

  function bind() {
    $('overlayEditorForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveOverlay();
    });
    $('refreshOverlayPreviewButton')?.addEventListener('click', renderPreview);
    $('testOverlayAlertButton')?.addEventListener('click', showTestAlert);
    $('copyObsUrlButton')?.addEventListener('click', copyObsUrl);
    $('regenerateTokenButton')?.addEventListener('click', regenerateToken);
    $('overlayAlertAsset')?.addEventListener('change', handleAlertAssetChange);
    $('changeOverlayTypeButton')?.addEventListener('click', showTypePicker);

    document.querySelectorAll('[data-overlay-type-choice]').forEach((button) => {
      button.addEventListener('click', () => chooseOverlayType(button.dataset.overlayTypeChoice));
    });

    document.querySelectorAll('[data-overlay-select][data-overlay-value]').forEach((button) => {
      button.addEventListener('click', () => {
        setSelectFromPreset(button);
        renderPreview();
      });
    });

    [
      'overlayTitle',
      'overlayDescription',
      'overlayMode',
      'overlayStatus',
      'overlayWidth',
      'overlayHeight',
      'overlayTheme',
      'widgetMessage',
      'widgetFanCard',
      'widgetFollow',
      'overlayColor',
      'overlayFontSize',
      'overlayRadius',
      'overlayAnimation',
      'chatWidth',
      'chatHeight',
      'chatMaxMessages',
      'chatNameColor',
      'chatMessageColor',
      'chatBackgroundOpacity',
      'chatFontSize',
      'chatSampleMessage',
      'donationTitle',
      'donationShowName',
      'donationShowAmount',
      'donationShowMessage',
      'donationAnimation',
      'donationDuration',
      'followText',
      'followShowName',
      'followAnimation',
      'fanCardText',
      'fanCardAuthor',
      'fanCardMessage',
      'fanCardAnimation',
      'overlayHtmlCode',
      'overlayCssCode',
      'overlayJsCode',
      'allowCustomJs'
    ].forEach((id) => {
      const node = $(id);
      if (!node) return;
      const eventName = node.tagName === 'TEXTAREA' || node.tagName === 'INPUT' ? 'input' : 'change';
      node.addEventListener(eventName, () => {
        if (id === 'overlayHtmlCode' || id === 'overlayCssCode') activateCustomHtmlMode();
        updateRangeValue('overlayFontSize', 'overlayFontSizeValue');
        updateRangeValue('overlayRadius', 'overlayRadiusValue');
        updateRangeValue('chatBackgroundOpacity', 'chatBackgroundOpacityValue', '%');
        renderPreview();
        updateActionState();
      });
      if (eventName !== 'change') {
        node.addEventListener('change', () => {
          renderPreview();
          updateActionState();
        });
      }
    });

    $('applyChatTemplateButton')?.addEventListener('click', applyChatTemplate);
    window.addEventListener('beforeunload', revokeAlertAssetObjectUrl);

    document.addEventListener('seiga:i18n-change', () => {
      updateStaticLabels();
      syncPresetControls();
      renderAlertAssetPreview();
      renderPreview();
    });
  }

  const role = roleOf(me);
  isAdmin = window.SeigaAuth?.isAdmin?.(me) || role === 'ADMIN';
  isStreamer = window.SeigaAuth?.isStreamer?.(me) || role === 'STREAMER' || isAdmin || Boolean(me.streamerProfile);

  if (!isStreamer) {
    setAccess('overlay.forbiddenRedirect', '승인된 스트리머만 오버레이를 관리할 수 있습니다. 기본 화면으로 이동합니다.', true);
    return;
  }

  bind();
  setupPreviewResizeObserver();
  syncPresetControls();
  updateActionState();
  await loadOverlay();
  updateActionState();
})();
