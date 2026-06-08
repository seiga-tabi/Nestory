(async function () {
  const api = window.SeigaApi;
  if (!api || !document.getElementById('profileCardPreview')) return;

  const me = await api.redirectIfUnauthorized();
  if (!me) return;

  const dayKo = { MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토', SUN: '일' };
  const dayEn = { 월: 'MON', 화: 'TUE', 수: 'WED', 목: 'THU', 금: 'FRI', 토: 'SAT', 일: 'SUN' };
  const designToUi = { CLEAN_WHITE: 'style-clean', SOFT_OVERLAY: 'style-soft', DARK_GLASS: 'style-dark' };
  const uiToDesign = { 'style-clean': 'CLEAN_WHITE', 'style-soft': 'SOFT_OVERLAY', 'style-dark': 'DARK_GLASS' };
  const languageLabels = { KR: '한국어', JA: '日本語', 'KR/JA': 'KR / JA', 'JA/KR': 'JA / KR' };
  const linkInputs = [
    ['TWITCH', 'Twitch', 'twitchLink'],
    ['YOUTUBE', 'YouTube', 'youtubeLink'],
    ['X', 'X', 'xLink'],
    ['DISCORD', 'Discord', 'discordLink']
  ];
  const exportSize = { width: 1200, height: 675 };
  const exportFont = '-apple-system, BlinkMacSystemFont, "Pretendard", "Noto Sans KR", "Noto Sans JP", "Segoe UI", sans-serif';
  const $ = (id) => document.getElementById(id);
  let currentProfile = null;
  let serverSnapshot = null;
  let localAvatarUrl = '';
  let backgroundPreviewUrl = '';

  function clone(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  function setFormDisabled(disabled) {
    document.querySelectorAll('.workspace input, .workspace select, .workspace textarea, .workspace button').forEach((node) => {
      if (node.id === 'resetProfileButton') return;
      node.disabled = disabled;
    });
    $('saveProfileButton').disabled = disabled;
    $('downloadProfilePngButton').disabled = disabled;
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function setValue(id, value) {
    const node = $(id);
    if (!node) return;
    node.value = value || '';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setChecked(id, checked) {
    const node = $(id);
    if (!node) return;
    node.checked = Boolean(checked);
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function revokeObjectUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function ensureOption(select, value) {
    if (!select || !value) return;
    if (!Array.from(select.options).some((option) => option.value === value || option.textContent === value)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
  }

  function selectedDesign() {
    const selected = document.querySelector('input[name="cardDesign"]:checked')?.value || 'style-clean';
    return uiToDesign[selected] || 'CLEAN_WHITE';
  }

  function selectedVisibility() {
    const toggle = $('isPublicToggle');
    return toggle ? toggle.checked : currentProfile?.isPublic !== false;
  }

  function applyCardDesignClass(uiValue) {
    const preview = $('profileCardPreview');
    if (!preview) return;
    const selected = uiValue || document.querySelector('input[name="cardDesign"]:checked')?.value || 'style-clean';
    preview.classList.remove('style-clean', 'style-soft', 'style-dark');
    preview.classList.add(selected);
  }

  function applyDesign(cardDesign) {
    const uiValue = designToUi[cardDesign] || 'style-clean';
    const input = document.querySelector(`input[name="cardDesign"][value="${uiValue}"]`);
    if (input) {
      input.checked = true;
    }
    applyCardDesignClass(uiValue);
  }

  function linksToInputs(links = []) {
    const byType = Object.fromEntries(links.map((link) => [link.type, link.url]));
    linkInputs.forEach(([type, , inputId]) => setValue(inputId, byType[type] || ''));
  }

  function scheduleToInputs(schedule = []) {
    document.querySelectorAll('#calendarEditor .calendar-day').forEach((row) => {
      const day = row.querySelector('strong')?.textContent.trim();
      const item = schedule.find((entry) => dayKo[entry.dayOfWeek] === day);
      row.querySelector('[data-type="time"]').value = item?.startTime || '';
      row.querySelector('[data-type="content"]').value = item?.title || '';
    });
    document.getElementById('calendarEditor')?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function collectSchedule() {
    return Array.from(document.querySelectorAll('#calendarEditor .calendar-day')).map((row) => {
      const day = row.querySelector('strong')?.textContent.trim();
      const time = row.querySelector('[data-type="time"]').value.trim();
      const title = row.querySelector('[data-type="content"]').value.trim();
      return {
        dayOfWeek: dayEn[day],
        startTime: time || null,
        title: title || null,
        isActive: Boolean(time || title)
      };
    }).filter((item) => item.dayOfWeek);
  }

  function collectLinks() {
    return linkInputs
      .map(([type, label, inputId], index) => ({
        type,
        label,
        url: $(inputId)?.value.trim() || '',
        sortOrder: index,
        isVisible: true
      }))
      .filter((item) => item.url);
  }

  function collectPlayStyleTags() {
    const seen = new Set();
    return String($('playStyleTags')?.value || '')
      .split(/[,\n、，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => {
        const key = tag.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }

  function displayHandle(value) {
    const text = safeText(value, '');
    if (!text) return 'Twitch ID 미등록';
    return text.startsWith('@') ? text : `@${text}`;
  }

  function displayLanguage(value) {
    const text = safeText(value, '');
    return languageLabels[text] || text;
  }

  function renderLoading() {
    setFormDisabled(true);
    $('previewName').textContent = '불러오는 중입니다.';
    $('previewHandle').textContent = '';
    $('previewSubtitle').textContent = '';
    $('previewIntro').textContent = '';
    $('previewContentTag').textContent = '';
    $('previewLanguageTag').textContent = '';
    $('previewPlayStyleTags').innerHTML = '';
    $('previewLinks').innerHTML = '';
    $('previewSchedule').innerHTML = '';
    $('previewVisibility').textContent = 'PRIVATE';
  }

  function renderError(error) {
    $('previewName').textContent = '프로필을 불러오지 못했습니다.';
    $('previewSubtitle').textContent = error?.message || '잠시 후 다시 시도해주세요.';
    api.showToast(error?.message || '프로필을 불러오지 못했습니다.');
  }

  function applyProfile(profile) {
    currentProfile = clone(profile) || {};
    ensureOption($('mainContent'), currentProfile.mainContent);
    ensureOption($('language'), currentProfile.language);
    setValue('streamerName', currentProfile.name);
    setValue('handle', currentProfile.handle);
    setValue('subtitle', currentProfile.subtitle);
    setValue('intro', currentProfile.subtitle);
    setValue('mainContent', currentProfile.mainContent);
    setValue('language', currentProfile.language);
    setValue('playStyleTags', currentProfile.playStyleTags || '');
    setValue('mainColor', currentProfile.mainColor || '#7c3aed');
    setValue('subColor', currentProfile.subColor || '#f9a8d4');
    setChecked('isPublicToggle', currentProfile.isPublic !== false);
    applyDesign(currentProfile.cardDesign);
    linksToInputs(currentProfile.socialLinks || []);
    scheduleToInputs(currentProfile.schedule || []);
    updatePreview();
  }

  function renderAvatar() {
    const image = $('previewAvatarImage');
    const avatar = $('previewAvatar');
    const text = $('previewAvatarText');
    if (!image || !avatar || !text) return;
    const name = safeText($('streamerName')?.value, '');
    const avatarUrl = localAvatarUrl || currentProfile?.avatarUrl;
    if (avatarUrl) {
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => {
        avatar.classList.add('has-image');
        text.textContent = '';
      };
      image.onerror = () => {
        image.removeAttribute('src');
        avatar.classList.remove('has-image');
        text.textContent = Array.from(name || '?')[0] || '?';
      };
      image.src = avatarUrl;
      avatar.classList.add('has-image');
      text.textContent = '';
    } else {
      image.removeAttribute('src');
      avatar.classList.remove('has-image');
      text.textContent = Array.from(name || '?')[0] || '?';
    }
  }

  function renderPreviewLinks() {
    const box = $('previewLinks');
    const linkBox = $('linkBox');
    if (!box) return;
    const links = collectLinks();
    if (!$('showLinks')?.checked) {
      if (linkBox) linkBox.hidden = true;
      box.innerHTML = '';
      return;
    }
    if (linkBox) linkBox.hidden = false;
    box.innerHTML = links.length
      ? links.map((link) => `<span class="link-chip">${api.escapeHtml(link.label)}</span>`).join('')
      : '<span class="link-chip">등록된 링크가 없습니다</span>';
  }

  function renderPreviewSchedule() {
    const box = $('previewSchedule');
    const scheduleBox = $('scheduleBox');
    if (!box) return;
    const schedule = collectSchedule().filter((item) => item.isActive);
    if (!$('showSchedule')?.checked) {
      if (scheduleBox) scheduleBox.hidden = true;
      box.innerHTML = '';
      return;
    }
    if (scheduleBox) scheduleBox.hidden = false;
    box.innerHTML = schedule.length
      ? schedule.slice(0, 3).map((item) => `<span class="schedule-chip">${api.escapeHtml(dayKo[item.dayOfWeek] || item.dayOfWeek)} ${api.escapeHtml(item.startTime || '미정')} ${api.escapeHtml(item.title || '')}</span>`).join('')
      : '<span class="schedule-chip">등록된 방송 일정이 없습니다</span>';
  }

  function renderPreviewTags(mainContent, language) {
    const contentTag = $('previewContentTag');
    const languageTag = $('previewLanguageTag');
    const playStyleBox = $('previewPlayStyleTags');
    const tags = collectPlayStyleTags();

    if (contentTag) {
      contentTag.textContent = mainContent || '콘텐츠 미등록';
      contentTag.hidden = !mainContent;
    }
    if (languageTag) {
      languageTag.textContent = displayLanguage(language) || '언어 미등록';
      languageTag.hidden = !language;
    }
    if (playStyleBox) {
      playStyleBox.innerHTML = tags
        .map((tag) => `<span class="card-tag">${api.escapeHtml(tag)}</span>`)
        .join('');
    }
  }

  function renderVisibility() {
    const visibility = $('previewVisibility');
    if (!visibility) return;
    const isPublic = selectedVisibility();
    visibility.textContent = isPublic ? 'PUBLIC' : 'PRIVATE';
    visibility.classList.toggle('private', !isPublic);
  }

  function renderBackground() {
    const image = $('previewBackgroundImage');
    const area = $('previewVisualArea');
    if (!image || !area) return;
    if (backgroundPreviewUrl) {
      image.onload = () => area.classList.add('has-background');
      image.onerror = () => {
        image.removeAttribute('src');
        area.classList.remove('has-background');
      };
      image.src = backgroundPreviewUrl;
      area.classList.add('has-background');
    } else {
      image.removeAttribute('src');
      area.classList.remove('has-background');
    }
  }

  function updatePreview() {
    const mainColor = $('mainColor')?.value || '#7c3aed';
    const subColor = $('subColor')?.value || '#f9a8d4';
    const name = safeText($('streamerName')?.value, '이름을 입력하세요');
    const handle = safeText($('handle')?.value, '');
    const subtitle = safeText($('subtitle')?.value, '');
    const mainContent = safeText($('mainContent')?.value, '');
    const language = safeText($('language')?.value, '');
    const playStyleTags = collectPlayStyleTags();

    const preview = $('profileCardPreview');
    preview.style.setProperty('--card-main', mainColor);
    preview.style.setProperty('--card-sub', subColor);
    applyCardDesignClass();
    $('previewName').textContent = name;
    $('previewHandle').textContent = displayHandle(handle);
    $('previewSubtitle').textContent = subtitle || '소개를 입력하면 이곳에 표시됩니다.';
    $('previewIntro').textContent = [mainContent, displayLanguage(language), playStyleTags.join(' · ')].filter(Boolean).join(' · ');
    $('previewFloatingText').textContent = [mainContent, displayLanguage(language), subtitle].filter(Boolean).join(' · ') || '방송 카드 비주얼이 이곳에 표시됩니다.';
    renderPreviewTags(mainContent, language);
    renderVisibility();
    renderAvatar();
    renderBackground();
    renderPreviewLinks();
    renderPreviewSchedule();
  }

  async function load() {
    renderLoading();
    try {
      const profile = await api.getJson('/api/profile-card');
      serverSnapshot = clone(profile) || {};
      applyProfile(serverSnapshot);
      setFormDisabled(false);
      if (profile.slug) {
        const status = await api.getJson(`/api/public/streamers/${encodeURIComponent(profile.slug)}/stream-status`).catch(() => null);
        if (status) $('previewStatus').textContent = status.isLive ? 'LIVE' : 'OFFLINE';
      }
    } catch (error) {
      renderError(error);
    }
  }

  async function save() {
    const previewOnlyPlayStyleTags = $('playStyleTags')?.value || '';
    const body = {
      name: $('streamerName').value.trim(),
      handle: $('handle').value.trim(),
      subtitle: $('subtitle').value.trim(),
      mainContent: $('mainContent').value.trim(),
      language: $('language')?.value.trim() || '',
      cardDesign: selectedDesign(),
      mainColor: $('mainColor').value,
      subColor: $('subColor').value,
      isPublic: selectedVisibility(),
      socialLinks: collectLinks(),
      schedule: collectSchedule()
    };
    const saved = await api.putJson('/api/profile-card', body);
    serverSnapshot = clone(saved) || {};
    applyProfile(serverSnapshot);
    setValue('playStyleTags', previewOnlyPlayStyleTags);
    api.showToast('프로필 카드가 저장되었습니다.');
  }

  function resetToServerSnapshot() {
    if (!serverSnapshot) {
      api.showToast('되돌릴 서버 데이터가 없습니다.');
      return;
    }
    revokeObjectUrl(localAvatarUrl);
    revokeObjectUrl(backgroundPreviewUrl);
    localAvatarUrl = '';
    backgroundPreviewUrl = '';
    if ($('avatarUpload')) $('avatarUpload').value = '';
    if ($('backgroundUpload')) $('backgroundUpload').value = '';
    applyProfile(serverSnapshot);
    api.showToast('마지막으로 불러온 서버 데이터로 되돌렸습니다.');
  }

  function setDownloadState(isLoading) {
    const button = $('downloadProfilePngButton');
    if (!button) return;
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
    button.disabled = isLoading;
    button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    button.textContent = isLoading ? 'PNG 생성 중...' : button.dataset.defaultText;
  }

  async function downloadPreviewPng() {
    setDownloadState(true);
    try {
      updatePreview();
      await document.fonts?.ready;
      const canvas = await renderExportCanvas();
      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `profile-card-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      api.showToast('1200x675 PNG로 저장했습니다.');
    } catch (error) {
      console.error('[profile-card-export]', error);
      api.showToast(error?.message || 'PNG 내보내기에 실패했습니다. 이미지 권한 또는 네트워크 상태를 확인해주세요.');
    } finally {
      setDownloadState(false);
    }
  }

  async function renderExportCanvas() {
    const profile = buildExportProfile();
    const canvas = document.createElement('canvas');
    canvas.width = exportSize.width;
    canvas.height = exportSize.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('PNG 캔버스를 만들 수 없습니다.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const imageResource = await loadExportImage(profile.stageImageUrl);
    try {
      drawExportCard(ctx, profile, imageResource?.image || null);
    } finally {
      imageResource?.revoke?.();
    }
    return canvas;
  }

  function buildExportProfile() {
    const slug = currentProfile?.slug || serverSnapshot?.slug || '';
    const profileUrl = slug
      ? `${location.origin}/streamer-detail.html?slug=${encodeURIComponent(slug)}`
      : location.href;
    const mainContent = safeText($('mainContent')?.value, '');
    const language = displayLanguage($('language')?.value);
    const tags = collectPlayStyleTags();
    const schedule = collectSchedule().filter((item) => item.isActive);
    return {
      name: safeText($('streamerName')?.value, '프로필 카드'),
      handle: displayHandle($('handle')?.value),
      subtitle: safeText($('subtitle')?.value, '소개를 입력하세요'),
      intro: [mainContent, language, tags.join(' · ')].filter(Boolean).join(' · '),
      mainContent,
      language,
      tags,
      links: $('showLinks')?.checked ? collectLinks().slice(0, 4) : [],
      schedule: $('showSchedule')?.checked ? schedule.slice(0, 3) : [],
      mainColor: normalizeHexColor($('mainColor')?.value, '#7c3aed'),
      subColor: normalizeHexColor($('subColor')?.value, '#f9a8d4'),
      design: document.querySelector('input[name="cardDesign"]:checked')?.value || 'style-clean',
      status: safeText($('previewStatus')?.textContent, 'AUTO'),
      visibility: selectedVisibility() ? 'PUBLIC' : 'PRIVATE',
      profileUrl,
      qrText: compactQrText(profileUrl, slug),
      stageImageUrl: backgroundPreviewUrl || localAvatarUrl || currentProfile?.avatarUrl || ''
    };
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('PNG 파일을 만들 수 없습니다.'));
        }, 'image/png');
      } catch (_error) {
        reject(new Error('PNG 변환에 실패했습니다. 외부 이미지 권한을 확인해주세요.'));
      }
    });
  }

  async function loadExportImage(src) {
    const value = String(src || '').trim();
    if (!value) return null;
    let objectUrl = '';
    try {
      if (/^data:image\/svg\+xml/i.test(value)) return null;
      if (/^data:image\//i.test(value) || /^blob:/i.test(value)) {
        return { image: await decodeImage(value), revoke: null };
      }

      const url = new URL(value, location.href);
      if (!/^https?:$/i.test(url.protocol)) return null;
      const sameOrigin = url.origin === location.origin;
      const response = await fetch(url.href, {
        mode: 'cors',
        credentials: sameOrigin ? 'include' : 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'force-cache'
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.startsWith('image/')) return null;
      objectUrl = URL.createObjectURL(await response.blob());
      return {
        image: await decodeImage(objectUrl),
        revoke: () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
      };
    } catch (_error) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return null;
    }
  }

  function decodeImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
      image.src = src;
    });
  }

  function drawExportCard(ctx, profile, stageImage) {
    const isClean = profile.design === 'style-clean';
    const isDark = profile.design === 'style-dark';
    const textColor = isClean ? '#202033' : '#ffffff';
    const mutedColor = isClean ? '#687084' : 'rgba(255,255,255,.74)';
    drawExportBackground(ctx, profile, isClean, isDark);
    drawExportFrame(ctx, isClean, isDark);
    drawLeftExportPanel(ctx, profile, { textColor, mutedColor, isClean, isDark });
    drawStagePanel(ctx, profile, stageImage, { textColor, mutedColor, isClean, isDark });
    drawBottomExportPanel(ctx, profile, { textColor, mutedColor, isClean, isDark });
  }

  function drawExportBackground(ctx, profile, isClean, isDark) {
    const gradient = ctx.createLinearGradient(0, 0, exportSize.width, exportSize.height);
    if (isClean) {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.5, '#f6f7fb');
      gradient.addColorStop(1, '#eef7ff');
    } else if (isDark) {
      gradient.addColorStop(0, mixHex(profile.mainColor, '#101827', 0.72));
      gradient.addColorStop(0.5, '#171827');
      gradient.addColorStop(1, '#0b1020');
    } else {
      gradient.addColorStop(0, profile.subColor);
      gradient.addColorStop(0.5, profile.mainColor);
      gradient.addColorStop(1, '#111827');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, exportSize.width, exportSize.height);

    const wash = ctx.createLinearGradient(0, 0, exportSize.width, 0);
    wash.addColorStop(0, rgbaFromHex(profile.subColor, isClean ? 0.42 : 0.28));
    wash.addColorStop(0.5, 'rgba(255,255,255,0)');
    wash.addColorStop(1, rgbaFromHex(profile.mainColor, isClean ? 0.34 : 0.32));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, exportSize.width, exportSize.height);

    ctx.save();
    ctx.globalAlpha = isClean ? 0.18 : 0.13;
    ctx.strokeStyle = isClean ? '#7c6f9f' : '#ffffff';
    ctx.lineWidth = 1;
    for (let x = -80; x < exportSize.width + 120; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 280, exportSize.height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawExportFrame(ctx, isClean, isDark) {
    ctx.save();
    ctx.shadowColor = isDark ? 'rgba(0,0,0,.38)' : 'rgba(80,76,110,.22)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 18;
    fillRoundRect(ctx, 42, 42, 1116, 591, 42, isClean ? 'rgba(255,255,255,.74)' : 'rgba(255,255,255,.12)');
    ctx.restore();

    strokeRoundRect(ctx, 42, 42, 1116, 591, 42, isClean ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.18)', 2);
    fillRoundRect(ctx, 66, 66, 1068, 543, 34, isClean ? 'rgba(255,255,255,.46)' : 'rgba(255,255,255,.07)');
    strokeRoundRect(ctx, 66, 66, 1068, 543, 34, isClean ? 'rgba(255,255,255,.72)' : 'rgba(255,255,255,.12)', 1);

    ctx.save();
    ctx.globalAlpha = isClean ? 0.46 : 0.32;
    fillRoundRect(ctx, 838, 44, 230, 16, 8, '#ffffff');
    fillRoundRect(ctx, 90, 610, 178, 10, 5, '#ffffff');
    ctx.restore();
  }

  function drawLeftExportPanel(ctx, profile, theme) {
    drawStatusPill(ctx, profile.status, 92, 92, 140, profile.mainColor, theme.isClean);
    drawStatusPill(ctx, profile.visibility, 244, 92, 124, profile.subColor, theme.isClean);

    fillRoundRect(ctx, 92, 154, 118, 118, 32, theme.isClean ? profile.mainColor : 'rgba(255,255,255,.88)');
    ctx.fillStyle = theme.isClean ? '#ffffff' : '#111827';
    ctx.font = `950 60px ${exportFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Array.from(profile.name || '?')[0] || '?', 151, 213);

    drawSingleLine(ctx, profile.name, 232, 205, 400, 56, 32, 950, theme.textColor);
    drawSingleLine(ctx, profile.handle, 234, 250, 398, 25, 16, 850, theme.mutedColor);

    drawWrappedText(ctx, profile.subtitle, 92, 338, 540, 40, 3, 30, 18, 850, theme.textColor);
    drawWrappedText(ctx, profile.intro || '방송 카드 비주얼이 이곳에 표시됩니다.', 92, 468, 540, 31, 2, 23, 15, 850, profile.mainColor);

    const tags = [profile.mainContent, profile.language, ...profile.tags].filter(Boolean).slice(0, 4);
    drawTagRow(ctx, tags.length ? tags : ['STREAMER', 'KR / JA'], 92, 548, 540, profile, theme);
  }

  function drawStagePanel(ctx, profile, image, theme) {
    const box = { x: 674, y: 92, width: 436, height: 300, radius: 36 };
    fillRoundRect(ctx, box.x, box.y, box.width, box.height, box.radius, theme.isClean ? 'rgba(124,58,237,.12)' : 'rgba(255,255,255,.12)');
    strokeRoundRect(ctx, box.x, box.y, box.width, box.height, box.radius, theme.isClean ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.2)', 1);
    ctx.save();
    roundedClip(ctx, box.x + 18, box.y + 18, box.width - 36, box.height - 36, 28);
    if (image) {
      drawContainedImage(ctx, image, box.x + 18, box.y + 18, box.width - 36, box.height - 36);
    } else {
      drawExportCharacter(ctx, profile, box.x + 18, box.y + 18, box.width - 36, box.height - 36, theme.isClean);
    }
    ctx.restore();

    fillRoundRect(ctx, box.x + 30, box.y + box.height - 82, box.width - 60, 58, 20, theme.isClean ? 'rgba(255,255,255,.76)' : 'rgba(15,17,27,.64)');
    strokeRoundRect(ctx, box.x + 30, box.y + box.height - 82, box.width - 60, 58, 20, theme.isClean ? 'rgba(255,255,255,.78)' : 'rgba(255,255,255,.16)', 1);
    drawSingleLine(ctx, profile.mainContent || 'STREAM NOTE', box.x + 52, box.y + box.height - 49, box.width - 104, 18, 12, 950, theme.textColor);
    drawSingleLine(ctx, [profile.language, profile.status].filter(Boolean).join(' · ') || 'AUTO PROFILE', box.x + 52, box.y + box.height - 26, box.width - 104, 14, 10, 850, theme.mutedColor);
  }

  function drawBottomExportPanel(ctx, profile, theme) {
    fillRoundRect(ctx, 674, 414, 252, 116, 26, theme.isClean ? 'rgba(255,255,255,.72)' : 'rgba(255,255,255,.13)');
    fillRoundRect(ctx, 674, 548, 252, 54, 22, theme.isClean ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.1)');
    fillRoundRect(ctx, 948, 414, 162, 188, 26, theme.isClean ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.88)');

    drawSingleLine(ctx, 'LINKS', 700, 450, 180, 18, 13, 950, theme.mutedColor);
    drawWrappedText(ctx, profile.links.map((link) => link.label).join(' · ') || '등록된 링크가 없습니다', 700, 484, 200, 26, 2, 20, 13, 850, theme.textColor);

    drawSingleLine(ctx, 'SCHEDULE', 700, 574, 120, 13, 10, 950, theme.mutedColor);
    const scheduleText = profile.schedule.length
      ? profile.schedule.map((item) => `${dayKo[item.dayOfWeek] || item.dayOfWeek} ${item.startTime || '미정'} ${item.title || ''}`).join(' / ')
      : '일정 없음';
    drawSingleLine(ctx, scheduleText, 700, 596, 198, 16, 11, 850, theme.textColor);

    drawQrMatrix(ctx, createQrMatrix(profile.qrText), 958, 426, 142, '#111827', '#ffffff');
    drawSingleLine(ctx, 'PROFILE QR', 968, 584, 122, 11, 9, 950, '#6b7280', 'center');
  }

  function drawStatusPill(ctx, label, x, y, width, color, isClean) {
    fillRoundRect(ctx, x, y, width, 38, 19, isClean ? rgbaFromHex(color, 0.88) : rgbaFromHex(color, 0.42));
    strokeRoundRect(ctx, x, y, width, 38, 19, 'rgba(255,255,255,.22)', 1);
    fillCircle(ctx, x + 22, y + 19, 5, '#ffffff');
    drawSingleLine(ctx, safeText(label, 'AUTO').toUpperCase(), x + 40, y + 25, width - 52, 14, 10, 950, '#ffffff');
  }

  function drawTagRow(ctx, tags, x, y, maxWidth, profile, theme) {
    let cursorX = x;
    tags.forEach((tag, index) => {
      const text = safeText(tag, '');
      if (!text) return;
      ctx.font = `900 17px ${exportFont}`;
      const width = Math.min(Math.max(ctx.measureText(text).width + 26, 82), 166);
      if (cursorX + width > x + maxWidth) return;
      fillRoundRect(ctx, cursorX, y, width, 34, 17, index % 2 === 0 ? rgbaFromHex(profile.mainColor, theme.isClean ? 0.16 : 0.34) : rgbaFromHex(profile.subColor, theme.isClean ? 0.24 : 0.3));
      strokeRoundRect(ctx, cursorX, y, width, 34, 17, theme.isClean ? 'rgba(124,58,237,.14)' : 'rgba(255,255,255,.16)', 1);
      drawSingleLine(ctx, text, cursorX + 13, y + 23, width - 26, 17, 11, 900, theme.isClean ? '#4b2f82' : '#ffffff');
      cursorX += width + 10;
    });
  }

  function drawContainedImage(ctx, image, x, y, width, height) {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;

    ctx.save();
    ctx.filter = 'blur(18px)';
    ctx.globalAlpha = 0.42;
    const coverScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const coverWidth = image.naturalWidth * coverScale;
    const coverHeight = image.naturalHeight * coverScale;
    ctx.drawImage(image, x + (width - coverWidth) / 2, y + (height - coverHeight) / 2, coverWidth, coverHeight);
    ctx.restore();
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  function drawExportCharacter(ctx, profile, x, y, width, height, isClean) {
    const bodyGradient = ctx.createLinearGradient(x, y, x + width, y + height);
    bodyGradient.addColorStop(0, profile.subColor);
    bodyGradient.addColorStop(1, profile.mainColor);
    ctx.fillStyle = bodyGradient;
    ctx.fillRect(x, y, width, height);

    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#ffffff';
    fillRoundRect(ctx, x + width * 0.3, y + height * 0.15, width * 0.4, width * 0.4, width * 0.2, '#ffffff');
    fillRoundRect(ctx, x + width * 0.18, y + height * 0.56, width * 0.64, height * 0.24, 48, '#ffffff');
    ctx.restore();

    ctx.fillStyle = isClean ? 'rgba(255,255,255,.94)' : 'rgba(255,255,255,.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `950 94px ${exportFont}`;
    ctx.fillText(Array.from(profile.name || '?')[0] || '?', x + width / 2, y + height / 2);
    ctx.textBaseline = 'alphabetic';
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines, fontSize, minFontSize, weight, color) {
    const value = safeText(text, '');
    if (!value) return y;
    let size = fontSize;
    let wrapped = { items: [value], overflow: false };
    while (size >= minFontSize) {
      ctx.font = `${weight} ${size}px ${exportFont}`;
      wrapped = wrapLines(ctx, value, maxWidth, maxLines);
      if (!wrapped.overflow) break;
      size -= 1;
    }
    if (size < minFontSize) size = minFontSize;
    ctx.font = `${weight} ${size}px ${exportFont}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    wrapped.items.forEach((line, index) => {
      const output = index === maxLines - 1 && wrapped.overflow ? trimToWidth(ctx, line, maxWidth, '...') : line;
      ctx.fillText(output, x, y + index * lineHeight);
    });
    return y + wrapped.items.length * lineHeight;
  }

  function drawSingleLine(ctx, text, x, y, maxWidth, fontSize, minFontSize, weight, color, align = 'left') {
    const value = safeText(text, '');
    if (!value) return;
    let size = fontSize;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    while (size > minFontSize) {
      ctx.font = `${weight} ${size}px ${exportFont}`;
      if (ctx.measureText(value).width <= maxWidth) break;
      size -= 1;
    }
    ctx.font = `${weight} ${size}px ${exportFont}`;
    ctx.fillStyle = color;
    ctx.fillText(trimToWidth(ctx, value, maxWidth), align === 'center' ? x + maxWidth / 2 : x, y);
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const tokens = tokenizeForWrap(text);
    const items = [];
    let line = '';
    let overflow = false;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const next = line ? `${line}${token}` : token.trimStart();
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
      } else {
        items.push(line.trim());
        line = token.trimStart();
        if (items.length === maxLines) {
          overflow = true;
          break;
        }
      }
    }
    if (!overflow && line) items.push(line.trim());
    if (items.length > maxLines) {
      items.length = maxLines;
      overflow = true;
    }
    return { items, overflow };
  }

  function tokenizeForWrap(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return [];
    if (value.includes(' ')) return value.split(/(\s+)/).filter(Boolean);
    return Array.from(value);
  }

  function trimToWidth(ctx, text, maxWidth, suffix = '...') {
    const value = String(text || '');
    if (ctx.measureText(value).width <= maxWidth) return value;
    const units = Array.from(value);
    while (units.length && ctx.measureText(`${units.join('')}${suffix}`).width > maxWidth) {
      units.pop();
    }
    return `${units.join('').trimEnd()}${suffix}`;
  }

  function compactQrText(profileUrl, slug) {
    if (utf8Length(profileUrl) <= 230) return profileUrl;
    const compact = slug ? `${location.origin}/streamer-detail.html?slug=${encodeURIComponent(slug)}` : location.origin;
    return utf8Length(compact) <= 230 ? compact : location.origin;
  }

  function utf8Length(value) {
    return new TextEncoder().encode(String(value || '')).length;
  }

  function createQrMatrix(text) {
    const configs = [
      { version: 5, size: 37, dataCodewords: 108, eccPerBlock: 26, blocks: [108], alignment: [6, 30] },
      { version: 6, size: 41, dataCodewords: 136, eccPerBlock: 18, blocks: [68, 68], alignment: [6, 34] },
      { version: 7, size: 45, dataCodewords: 156, eccPerBlock: 20, blocks: [78, 78], alignment: [6, 22, 38] },
      { version: 8, size: 49, dataCodewords: 194, eccPerBlock: 24, blocks: [97, 97], alignment: [6, 24, 42] },
      { version: 9, size: 53, dataCodewords: 232, eccPerBlock: 30, blocks: [116, 116], alignment: [6, 26, 46] }
    ];
    const rawBytes = Array.from(new TextEncoder().encode(String(text || location.origin)));
    const config = configs.find((item) => rawBytes.length <= Math.floor((item.dataCodewords * 8 - 12) / 8)) || configs[configs.length - 1];
    const capacity = Math.floor((config.dataCodewords * 8 - 12) / 8);
    const data = encodeQrData(rawBytes.slice(0, capacity), config.dataCodewords);
    const codewords = addQrErrorCorrection(data, config);
    const matrix = Array.from({ length: config.size }, () => Array(config.size).fill(false));
    const reserved = Array.from({ length: config.size }, () => Array(config.size).fill(false));

    drawQrFunctionPatterns(matrix, reserved, config);
    placeQrCodewords(matrix, reserved, codewords);
    const mask = chooseQrMask(matrix, reserved);
    applyQrMask(matrix, reserved, mask);
    drawQrFormatBits(matrix, reserved, config.size, mask);
    if (config.version >= 7) drawQrVersionBits(matrix, reserved, config);
    return matrix;
  }

  function encodeQrData(bytes, dataCodewords) {
    const bits = [];
    appendBits(bits, 0x4, 4);
    appendBits(bits, bytes.length, 8);
    bytes.forEach((byte) => appendBits(bits, byte, 8));
    appendBits(bits, 0, Math.min(4, dataCodewords * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    }
    for (let pad = 0xec; data.length < dataCodewords; pad = pad === 0xec ? 0x11 : 0xec) {
      data.push(pad);
    }
    return data;
  }

  function appendBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  }

  function addQrErrorCorrection(data, config) {
    const divisor = reedSolomonDivisor(config.eccPerBlock);
    const blocks = [];
    let offset = 0;
    config.blocks.forEach((length) => {
      const block = data.slice(offset, offset + length);
      offset += length;
      blocks.push({ data: block, ecc: reedSolomonRemainder(block, divisor) });
    });

    const result = [];
    const maxData = Math.max(...blocks.map((block) => block.data.length));
    for (let i = 0; i < maxData; i += 1) {
      blocks.forEach((block) => {
        if (i < block.data.length) result.push(block.data[i]);
      });
    }
    for (let i = 0; i < config.eccPerBlock; i += 1) {
      blocks.forEach((block) => result.push(block.ecc[i]));
    }
    return result;
  }

  function reedSolomonDivisor(degree) {
    const result = Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i += 1) {
      for (let j = 0; j < result.length; j += 1) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 0x02);
    }
    return result;
  }

  function reedSolomonRemainder(data, divisor) {
    const result = Array(divisor.length).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ result.shift();
      result.push(0);
      divisor.forEach((coefficient, index) => {
        result[index] ^= gfMultiply(coefficient, factor);
      });
    });
    return result;
  }

  function gfMultiply(x, y) {
    let product = 0;
    for (let i = 7; i >= 0; i -= 1) {
      product = (product << 1) ^ ((product >>> 7) * 0x11d);
      product ^= ((y >>> i) & 1) * x;
    }
    return product & 0xff;
  }

  function drawQrFunctionPatterns(matrix, reserved, config) {
    const size = config.size;
    drawQrFinder(matrix, reserved, 0, 0);
    drawQrFinder(matrix, reserved, size - 7, 0);
    drawQrFinder(matrix, reserved, 0, size - 7);
    for (let i = 0; i < size; i += 1) {
      if (!reserved[6][i]) setQrFunction(matrix, reserved, i, 6, i % 2 === 0);
      if (!reserved[i][6]) setQrFunction(matrix, reserved, 6, i, i % 2 === 0);
    }
    config.alignment.forEach((x) => {
      config.alignment.forEach((y) => {
        if (!reserved[y][x]) drawQrAlignment(matrix, reserved, x, y);
      });
    });
    reserveQrFormatAreas(matrix, reserved, size);
    if (config.version >= 7) reserveQrVersionAreas(matrix, reserved, size);
    setQrFunction(matrix, reserved, 8, size - 8, true);
  }

  function drawQrFinder(matrix, reserved, left, top) {
    for (let y = -1; y <= 7; y += 1) {
      for (let x = -1; x <= 7; x += 1) {
        const xx = left + x;
        const yy = top + y;
        if (matrix[yy]?.[xx] === undefined) continue;
        const inside = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const dark = inside && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        setQrFunction(matrix, reserved, xx, yy, dark);
      }
    }
  }

  function drawQrAlignment(matrix, reserved, centerX, centerY) {
    for (let y = -2; y <= 2; y += 1) {
      for (let x = -2; x <= 2; x += 1) {
        setQrFunction(matrix, reserved, centerX + x, centerY + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
      }
    }
  }

  function reserveQrFormatAreas(matrix, reserved, size) {
    for (let i = 0; i < 9; i += 1) {
      if (i !== 6) {
        setQrFunction(matrix, reserved, 8, i, false);
        setQrFunction(matrix, reserved, i, 8, false);
      }
    }
    for (let i = 0; i < 8; i += 1) {
      setQrFunction(matrix, reserved, size - 1 - i, 8, false);
      setQrFunction(matrix, reserved, 8, size - 1 - i, false);
    }
  }

  function reserveQrVersionAreas(matrix, reserved, size) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        setQrFunction(matrix, reserved, size - 11 + j, i, false);
        setQrFunction(matrix, reserved, i, size - 11 + j, false);
      }
    }
  }

  function setQrFunction(matrix, reserved, x, y, dark) {
    if (matrix[y]?.[x] === undefined) return;
    matrix[y][x] = dark;
    reserved[y][x] = true;
  }

  function placeQrCodewords(matrix, reserved, codewords) {
    const size = matrix.length;
    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (reserved[y][x]) continue;
          const byte = codewords[Math.floor(bitIndex / 8)];
          matrix[y][x] = byte === undefined ? false : (((byte >>> (7 - (bitIndex % 8))) & 1) !== 0);
          bitIndex += 1;
        }
      }
    }
  }

  function chooseQrMask(matrix, reserved) {
    let bestMask = 0;
    let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask += 1) {
      const clone = matrix.map((row) => row.slice());
      applyQrMask(clone, reserved, mask);
      const penalty = qrPenaltyScore(clone);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMask = mask;
      }
    }
    return bestMask;
  }

  function applyQrMask(matrix, reserved, mask) {
    const size = matrix.length;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!reserved[y][x] && qrMaskBit(mask, x, y)) matrix[y][x] = !matrix[y][x];
      }
    }
  }

  function qrMaskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }

  function qrPenaltyScore(matrix) {
    const size = matrix.length;
    let penalty = 0;
    for (let y = 0; y < size; y += 1) penalty += qrRunPenalty(matrix[y]);
    for (let x = 0; x < size; x += 1) penalty += qrRunPenalty(matrix.map((row) => row[x]));
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const color = matrix[y][x];
        if (color === matrix[y][x + 1] && color === matrix[y + 1][x] && color === matrix[y + 1][x + 1]) penalty += 3;
      }
    }
    let darkCount = 0;
    matrix.forEach((row) => row.forEach((dark) => {
      if (dark) darkCount += 1;
    }));
    penalty += Math.floor(Math.abs(darkCount * 20 - size * size * 10) / (size * size)) * 10;
    return penalty;
  }

  function qrRunPenalty(line) {
    let penalty = 0;
    let runColor = line[0];
    let runLength = 1;
    for (let i = 1; i <= line.length; i += 1) {
      if (line[i] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) penalty += runLength - 2;
        runColor = line[i];
        runLength = 1;
      }
    }
    return penalty;
  }

  function drawQrFormatBits(matrix, reserved, size, mask) {
    const eclBits = 1;
    const data = (eclBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) setQrFunction(matrix, reserved, 8, i, getQrBit(bits, i));
    setQrFunction(matrix, reserved, 8, 7, getQrBit(bits, 6));
    setQrFunction(matrix, reserved, 8, 8, getQrBit(bits, 7));
    setQrFunction(matrix, reserved, 7, 8, getQrBit(bits, 8));
    for (let i = 9; i < 15; i += 1) setQrFunction(matrix, reserved, 14 - i, 8, getQrBit(bits, i));
    for (let i = 0; i < 8; i += 1) setQrFunction(matrix, reserved, size - 1 - i, 8, getQrBit(bits, i));
    for (let i = 8; i < 15; i += 1) setQrFunction(matrix, reserved, 8, size - 15 + i, getQrBit(bits, i));
    setQrFunction(matrix, reserved, 8, size - 8, true);
  }

  function drawQrVersionBits(matrix, reserved, config) {
    let rem = config.version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (config.version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const bit = getQrBit(bits, i);
      const a = config.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setQrFunction(matrix, reserved, a, b, bit);
      setQrFunction(matrix, reserved, b, a, bit);
    }
  }

  function getQrBit(value, index) {
    return ((value >>> index) & 1) !== 0;
  }

  function drawQrMatrix(ctx, matrix, x, y, size, darkColor, lightColor) {
    const quiet = 4;
    const cells = matrix.length + quiet * 2;
    const cellSize = Math.floor(size / cells);
    const drawSize = cellSize * cells;
    const offsetX = x + (size - drawSize) / 2;
    const offsetY = y + (size - drawSize) / 2;
    ctx.fillStyle = lightColor;
    ctx.fillRect(offsetX, offsetY, drawSize, drawSize);
    ctx.fillStyle = darkColor;
    matrix.forEach((row, rowIndex) => {
      row.forEach((dark, colIndex) => {
        if (!dark) return;
        ctx.fillRect(offsetX + (colIndex + quiet) * cellSize, offsetY + (rowIndex + quiet) * cellSize, cellSize, cellSize);
      });
    });
  }

  function normalizeHexColor(value, fallback) {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text;
    if (/^#[0-9a-f]{3}$/i.test(text)) {
      return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
    }
    return fallback;
  }

  function hexToRgb(hex) {
    const color = normalizeHexColor(hex, '#000000').slice(1);
    return {
      r: parseInt(color.slice(0, 2), 16),
      g: parseInt(color.slice(2, 4), 16),
      b: parseInt(color.slice(4, 6), 16)
    };
  }

  function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function mixHex(hex, otherHex, amount) {
    const a = hexToRgb(hex);
    const b = hexToRgb(otherHex);
    const mix = (start, end) => Math.round(start + (end - start) * amount).toString(16).padStart(2, '0');
    return `#${mix(a.r, b.r)}${mix(a.g, b.g)}${mix(a.b, b.b)}`;
  }

  function roundedClip(ctx, x, y, width, height, radius) {
    roundRect(ctx, x, y, width, height, radius);
    ctx.clip();
  }

  function fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
    roundRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function strokeRoundRect(ctx, x, y, width, height, radius, strokeStyle, lineWidth) {
    roundRect(ctx, x, y, width, height, radius);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function fillCircle(ctx, x, y, radius, fillStyle) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  $('avatarUpload')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    revokeObjectUrl(localAvatarUrl);
    localAvatarUrl = URL.createObjectURL(file);
    updatePreview();
    try {
      const result = await api.uploadFile('/api/profile-card/avatar', 'avatar', file);
      revokeObjectUrl(localAvatarUrl);
      localAvatarUrl = '';
      currentProfile = { ...(currentProfile || {}), avatarUrl: result.avatarUrl };
      serverSnapshot = { ...(serverSnapshot || {}), avatarUrl: result.avatarUrl };
      updatePreview();
      api.showToast('대표 이미지가 업로드되었습니다.');
    } catch (error) {
      api.showToast(error.message);
    }
  });

  $('backgroundUpload')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    revokeObjectUrl(backgroundPreviewUrl);
    backgroundPreviewUrl = file ? URL.createObjectURL(file) : '';
    updatePreview();
  });

  ['streamerName', 'handle', 'subtitle', 'intro', 'mainContent', 'language', 'playStyleTags', 'mainColor', 'subColor', 'showLinks', 'showSchedule', 'isPublicToggle'].forEach((id) => {
    $(id)?.addEventListener('input', updatePreview);
    $(id)?.addEventListener('change', updatePreview);
  });
  document.querySelectorAll('#calendarEditor input, input[name="cardDesign"]').forEach((node) => {
    node.addEventListener('input', updatePreview);
    node.addEventListener('change', updatePreview);
  });
  linkInputs.forEach(([, , id]) => {
    $(id)?.addEventListener('input', updatePreview);
    $(id)?.addEventListener('change', updatePreview);
  });

  $('saveProfileButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    save().catch((error) => api.showToast(error.message));
  });
  $('downloadProfilePngButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    downloadPreviewPng();
  });
  $('refreshPreviewButton')?.addEventListener('click', updatePreview);
  $('resetProfileButton')?.addEventListener('click', resetToServerSnapshot);

  load();
})();
