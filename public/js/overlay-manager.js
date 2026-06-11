(async function () {
  if (window.SeigaI18nReady) {
    await window.SeigaI18nReady.catch(() => {});
  }

  const api = window.SeigaApi;
  const board = document.getElementById('overlayManagerLayout');
  if (!api || !board) return;

  const me = await api.redirectIfUnauthorized('login.html?next=overlay-manager.html');
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  let overlays = [];
  let isAdmin = false;
  let isStreamer = false;

  function t(key, params = {}, fallback = key) {
    return window.SeigaI18n?.t?.(key, params, fallback) || fallback;
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function roleOf(auth = {}) {
    return String(auth.role || auth.user?.role || auth.raw?.role || 'USER').toUpperCase();
  }

  function unwrapItem(payload) {
    return payload?.item || payload?.overlay || payload || null;
  }

  function unwrapItems(payload) {
    return Array.isArray(payload?.items) ? payload.items : [];
  }

  function formatDate(value) {
    if (!value) return t('adminAccess.noDate', {}, '날짜 없음');
    try {
      return new Date(value).toLocaleString(window.SeigaI18n?.locale === 'ja' ? 'ja-JP' : 'ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_error) {
      return t('adminAccess.noDate', {}, '날짜 없음');
    }
  }

  function statusLabel(overlay = {}) {
    const status = statusValue(overlay);
    if (status === 'DRAFT') return t('overlay.statusDraft', {}, '초안');
    if (status === 'DISABLED') return t('overlay.statusDisabled', {}, '비활성');
    return t('overlay.statusActive', {}, '활성');
  }

  function statusValue(overlay = {}) {
    return String(overlay.status || (overlay.isEnabled === false ? 'DISABLED' : 'ACTIVE')).toUpperCase();
  }

  function statusClass(overlay = {}) {
    const status = statusValue(overlay);
    if (status === 'DRAFT') return 'is-draft';
    if (status === 'DISABLED') return 'is-disabled';
    return 'is-active';
  }

  function modeLabel(mode) {
    const value = String(mode || 'BUILDER').toUpperCase();
    if (value === 'CUSTOM_HTML_CSS') return t('overlay.modeCustomHtmlCss', {}, 'HTML/CSS');
    if (value === 'CUSTOM_ADVANCED') return t('overlay.modeCustomAdvanced', {}, '고급');
    return t('overlay.modeBuilder', {}, '빌더');
  }

  function overlayType(overlay = {}) {
    const config = overlay.configJson || {};
    const value = String(overlay.overlayType || overlay.type || config.overlayType || 'CUSTOM').toUpperCase();
    return ['CHAT', 'DONATION', 'FOLLOW', 'FAN_CARD', 'CUSTOM'].includes(value) ? value : 'CUSTOM';
  }

  function overlayTypeLabel(overlay = {}) {
    const value = overlayType(overlay);
    if (value === 'CHAT') return t('overlay.typeChat', {}, '채팅');
    if (value === 'DONATION') return t('overlay.typeDonation', {}, '후원');
    if (value === 'FOLLOW') return t('overlay.typeFollow', {}, '팔로우');
    if (value === 'FAN_CARD') return t('overlay.typeFanCard', {}, '팬카드');
    return t('overlay.typeCustom', {}, '커스텀');
  }

  function setAccess(messageKey, fallback, redirect = false) {
    const access = $('overlayAccessState');
    if (!access) return;
    access.hidden = false;
    access.classList.add('is-error');
    access.textContent = t(messageKey, {}, fallback);
    board.hidden = true;
    $('createOverlayButton')?.setAttribute('aria-disabled', 'true');
    $('createOverlayButton')?.classList.add('is-disabled');
    if (redirect) {
      window.setTimeout(() => {
        location.href = 'viewer-stats.html';
      }, 1800);
    }
  }

  function setListState(key = '', fallback = '') {
    const node = $('overlayListState');
    if (!node) return;
    node.textContent = key ? t(key, {}, fallback) : '';
  }

  function setCount() {
    const badge = $('overlayCountBadge');
    if (badge) badge.textContent = String(overlays.length);
  }

  function overlayTitle(overlay = {}) {
    return safeText(overlay.title || overlay.name, t('overlay.untitled', {}, '이름 없는 오버레이'));
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

  function ownerLabel(overlay = {}) {
    const owner = overlay.owner || overlay.streamer || overlay.ownerStreamer || {};
    const name = safeText(
      owner.displayName || owner.name || overlay.ownerName || overlay.streamerName,
      t('overlay.unknownOwner', {}, '소유자 없음')
    );
    const rawHandle = safeText(owner.handle || owner.login || owner.username || overlay.ownerHandle || overlay.streamerHandle, '');
    const handle = rawHandle ? `@${rawHandle.replace(/^@/, '')}` : '';
    return handle ? `${name} · ${handle}` : name;
  }

  function upsertOverlay(next) {
    const item = unwrapItem(next);
    if (!item?.id) return null;
    const index = overlays.findIndex((overlay) => overlay.id === item.id);
    if (index >= 0) overlays[index] = item;
    else overlays.unshift(item);
    renderCards();
    return item;
  }

  function removeOverlay(id) {
    overlays = overlays.filter((overlay) => String(overlay.id) !== String(id));
    renderCards();
  }

  async function ensureObsUrl(overlay) {
    if (statusValue(overlay) !== 'ACTIVE') {
      throw new Error(t('overlay.obsDraftHint', {}, '오버레이를 ACTIVE로 변경한 뒤 OBS URL을 사용할 수 있습니다.'));
    }
    const existing = overlayObsUrl(overlay);
    if (existing) return existing;
    const payload = await api.postJson(`/api/overlays/${encodeURIComponent(overlay.id)}/regenerate-token`, {});
    const updated = upsertOverlay(payload);
    const url = overlayObsUrl(updated || {});
    if (!url) throw new Error(t('overlay.obsUrlMissing', {}, '복사할 OBS URL이 없습니다. token을 재발급해주세요.'));
    return url;
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_error) {
        // 클립보드 권한이 없는 브라우저에서는 textarea fallback으로 한 번 더 시도합니다.
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

  async function copyText(text) {
    if (await copyTextToClipboard(text)) {
      api.showToast(t('common.copyDone', {}, '복사 완료'));
      return;
    }
    throw new Error(t('common.copyFailed', {}, '복사 실패'));
  }

  function appendMeta(card, labelKey, fallback, value) {
    const item = document.createElement('div');
    item.className = 'overlay-card-meta-item';
    const label = document.createElement('span');
    label.textContent = t(labelKey, {}, fallback);
    const strong = document.createElement('strong');
    strong.textContent = safeText(value, '-');
    item.append(label, strong);
    card.append(item);
  }

  function button(labelKey, fallback, className = 'ghost-btn') {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className;
    node.textContent = t(labelKey, {}, fallback);
    return node;
  }

  function renderCard(overlay) {
    const card = document.createElement('article');
    card.className = `overlay-card ${statusClass(overlay)}`;

    const head = document.createElement('div');
    head.className = 'overlay-card-head';
    const titleBox = document.createElement('div');
    titleBox.className = 'overlay-card-title';
    const title = document.createElement('h3');
    title.textContent = overlayTitle(overlay);
    const description = document.createElement('p');
    description.className = 'overlay-card-description';
    description.textContent = safeText(overlay.description, t('overlay.noDescription', {}, '설명이 없습니다.'));
    titleBox.append(title, description);

    const badges = document.createElement('div');
    badges.className = 'overlay-card-badges';
    const status = document.createElement('span');
    status.className = `badge overlay-status-badge ${statusClass(overlay)}`;
    status.textContent = statusLabel(overlay);
    badges.append(status);
    if (isAdmin) {
      const owner = document.createElement('span');
      owner.className = 'overlay-owner-badge';
      owner.textContent = ownerLabel(overlay);
      badges.append(owner);
    }
    head.append(titleBox, badges);
    card.append(head);

    const meta = document.createElement('div');
    meta.className = 'overlay-card-meta';
    appendMeta(meta, 'overlay.mode', '모드', modeLabel(overlay.mode));
    appendMeta(meta, 'overlay.type', '종류', overlayTypeLabel(overlay));
    appendMeta(meta, 'overlay.resolution', '해상도', `${overlay.width || 1920} x ${overlay.height || 1080}`);
    appendMeta(meta, 'overlay.updatedAt', '업데이트', formatDate(overlay.updatedAt));
    card.append(meta);

    const activeForObs = statusValue(overlay) === 'ACTIVE';
    if (!activeForObs) {
      const note = document.createElement('div');
      note.className = `overlay-card-obs-note ${statusClass(overlay)}`;
      note.textContent = statusValue(overlay) === 'DRAFT'
        ? t('overlay.obsDraftHint', {}, '오버레이를 ACTIVE로 변경한 뒤 OBS URL을 사용할 수 있습니다.')
        : t('overlay.obsDisabledHint', {}, '비활성화된 오버레이는 OBS URL을 사용할 수 없습니다.');
      card.append(note);
    }

    const actions = document.createElement('div');
    actions.className = 'overlay-card-actions';

    const edit = document.createElement('a');
    edit.className = 'primary-btn';
    edit.href = `overlay-editor.html?id=${encodeURIComponent(overlay.id)}`;
    edit.textContent = t('overlay.edit', {}, '편집');

    const preview = button('overlay.preview', '미리보기');
    preview.addEventListener('click', async () => {
      if (!activeForObs) {
        api.showToast(t('overlay.obsDraftHint', {}, '오버레이를 ACTIVE로 변경한 뒤 OBS URL을 사용할 수 있습니다.'));
        return;
      }
      try {
        const url = await ensureObsUrl(overlay);
        window.open(url, '_blank', 'noopener');
      } catch (error) {
        api.showToast(error.message || t('overlay.regenerateFailed', {}, 'token 재발급에 실패했습니다.'));
      }
    });

    const copy = button('overlay.copyObsUrl', 'OBS URL 복사');
    copy.addEventListener('click', async () => {
      if (!activeForObs) {
        api.showToast(t('overlay.obsDraftHint', {}, '오버레이를 ACTIVE로 변경한 뒤 OBS URL을 사용할 수 있습니다.'));
        return;
      }
      copy.disabled = true;
      try {
        await copyText(await ensureObsUrl(overlay));
      } catch (error) {
        api.showToast(error.message || t('common.copyFailed', {}, '복사 실패'));
      } finally {
        copy.disabled = false;
      }
    });

    const duplicate = button('overlay.duplicate', '복제');
    duplicate.addEventListener('click', async () => {
      duplicate.disabled = true;
      try {
        const payload = await api.postJson(`/api/overlays/${encodeURIComponent(overlay.id)}/duplicate`, {});
        upsertOverlay(payload);
        api.showToast(t('overlay.duplicateDone', {}, '오버레이를 복제했습니다.'));
      } catch (error) {
        api.showToast(error.message || t('overlay.duplicateFailed', {}, '오버레이 복제에 실패했습니다.'));
      } finally {
        duplicate.disabled = false;
      }
    });

    const remove = button('overlay.delete', '삭제', 'danger-btn');
    remove.classList.add('overlay-delete-action');
    const removeLabel = document.createElement('span');
    removeLabel.textContent = t('overlay.delete', {}, '삭제');
    const removeHint = document.createElement('small');
    removeHint.textContent = t('overlay.deleteConfirmShort', {}, '확인 후');
    remove.replaceChildren(removeLabel, removeHint);
    const deleteConfirmHint = t('overlay.deleteRequiresConfirm', {}, '삭제 전 확인창이 표시됩니다.');
    remove.title = deleteConfirmHint;
    remove.setAttribute('aria-label', `${t('overlay.delete', {}, '삭제')} - ${deleteConfirmHint}`);
    remove.addEventListener('click', async () => {
      const confirmed = window.confirm(t('overlay.deleteConfirm', {}, '이 오버레이를 삭제할까요? 삭제 후에는 OBS URL도 사용할 수 없습니다.'));
      if (!confirmed) return;
      remove.disabled = true;
      try {
        await api.deleteJson(`/api/overlays/${encodeURIComponent(overlay.id)}`);
        removeOverlay(overlay.id);
        api.showToast(t('overlay.deleteDone', {}, '오버레이를 삭제했습니다.'));
      } catch (error) {
        api.showToast(error.message || t('overlay.deleteFailed', {}, '오버레이를 삭제하지 못했습니다.'));
      } finally {
        remove.disabled = false;
      }
    });

    actions.append(edit);
    if (activeForObs) actions.append(preview, copy);
    actions.append(duplicate, remove);
    card.append(actions);
    return card;
  }

  function renderEmptyState() {
    const empty = document.createElement('article');
    empty.className = 'overlay-empty-state';
    const box = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = t('overlay.empty.title', {}, '아직 오버레이가 없습니다');
    const description = document.createElement('p');
    description.textContent = t('overlay.empty.description', {}, '첫 오버레이를 만들어 OBS에 추가해 보세요.');
    const cta = document.createElement('a');
    cta.className = 'primary-btn';
    cta.href = 'overlay-editor.html';
    cta.textContent = t('overlay.create', {}, '새 오버레이 만들기');
    box.append(title, description, cta);
    empty.append(box);
    return empty;
  }

  function renderCards() {
    const list = $('overlayCardList');
    list.replaceChildren();
    setCount();
    if (!overlays.length) {
      setListState('', '');
      list.append(renderEmptyState());
      return;
    }
    setListState('', '');
    overlays.forEach((overlay) => list.append(renderCard(overlay)));
  }

  async function loadOverlays() {
    setListState('overlay.loading', '오버레이 목록을 불러오는 중입니다.');
    try {
      const payload = await api.getJson('/api/overlays');
      overlays = unwrapItems(payload);
      renderCards();
    } catch (error) {
      overlays = [];
      renderCards();
      setListState('overlay.loadError', '오버레이 목록을 불러오지 못했습니다.');
      api.showToast(error.message || t('overlay.loadError', {}, '오버레이 목록을 불러오지 못했습니다.'));
    }
  }

  function applyRoleText() {
    const description = $('overlayListDescription');
    const title = $('overlaySavedListTitle');
    if (title) {
      title.dataset.i18n = isAdmin ? 'overlay.adminAllOverlays' : 'overlay.myOverlays';
      title.textContent = isAdmin
        ? t('overlay.adminAllOverlays', {}, '전체 오버레이 관리')
        : t('overlay.myOverlays', {}, '내 오버레이');
    }
    if (!description) return;
    description.dataset.i18n = isAdmin ? 'overlay.adminListDescription' : 'overlay.streamerListDescription';
    description.textContent = isAdmin
      ? t('overlay.adminListDescription', {}, '전체 스트리머 오버레이를 표시합니다.')
      : t('overlay.streamerListDescription', {}, '본인이 만든 오버레이만 표시됩니다.');
  }

  function bind() {
    $('refreshOverlaysButton')?.addEventListener('click', loadOverlays);
    document.addEventListener('seiga:i18n-change', () => {
      applyRoleText();
      renderCards();
    });
  }

  const role = roleOf(me);
  isAdmin = window.SeigaAuth?.isAdmin?.(me) || role === 'ADMIN';
  isStreamer = window.SeigaAuth?.isStreamer?.(me) || role === 'STREAMER' || isAdmin || Boolean(me.streamerProfile);
  bind();

  if (!isStreamer) {
    setAccess('overlay.forbiddenRedirect', '승인된 스트리머만 오버레이를 관리할 수 있습니다. 기본 화면으로 이동합니다.', true);
    return;
  }

  applyRoleText();
  await loadOverlays();
})();
