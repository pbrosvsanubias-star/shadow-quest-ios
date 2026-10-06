/* User-provided sheets remain unchanged. The viewport selects each panel,
   excluding the gift sheet's row labels and the card sheets' dividers. */
(() => {
  'use strict';

  const giftColumns = [[13, 302], [318, 608], [625, 914], [931, 1220], [1237, 1525]];
  const giftRows = [[15, 304], [349, 636], [683, 974]];
  const cardColumns = [[5, 360], [366, 721], [727, 1083], [1089, 1444]];
  // Measured divider bands differ slightly between the three source sheets:
  // y351..359 and y698..706. Keep every card viewport inside the artwork.
  const cardRows = [[6, 350], [361, 697], [707, 1079]];
  const rectangles = (columns, rows) => rows.flatMap(([top, bottom]) =>
    columns.map(([left, right]) => ({ x: left, y: top, w: right - left, h: bottom - top })));
  const giftFrames = rectangles(giftColumns, giftRows);
  const cardFrames = rectangles(cardColumns, cardRows);
  const sheets = {
    gift: { path: 'images/rewards/gift-sheet.png', width: 1536, height: 1024, frames: giftFrames },
    strength: { path: 'images/rewards/strength-sheet.png', width: 1448, height: 1086, frames: cardFrames },
    crown: { path: 'images/rewards/crown-sheet.png', width: 1448, height: 1086, frames: cardFrames },
    energy: { path: 'images/rewards/energy-sheet.png', width: 1448, height: 1086, frames: cardFrames }
  };
  const loads = new Map();
  const active = new WeakMap();
  const number = value => Math.round(value * 1000000) / 1000000;
  const knownType = type => Object.prototype.hasOwnProperty.call(sheets, type);
  const cardType = type => knownType(type) && type !== 'gift';

  function frameStyle(type, index) {
    const sheet = sheets[type];
    const frame = sheet.frames[index];
    return `aspect-ratio:${frame.w}/${frame.h};` +
      `background-image:url('${sheet.path}');` +
      `background-size:${number(sheet.width / frame.w * 100)}% ${number(sheet.height / frame.h * 100)}%;` +
      `background-position:${number(frame.x / (sheet.width - frame.w) * 100)}% ${number(frame.y / (sheet.height - frame.h) * 100)}%;`;
  }

  function frameMarkup(type, index = 0, extraClass = '') {
    if (!knownType(type)) throw new Error('Unbekannte Belohnungsgrafik.');
    const safeIndex = Number.isFinite(index)
      ? Math.max(0, Math.min(sheets[type].frames.length - 1, Math.trunc(index))) : 0;
    const classes = String(extraClass).replace(/[^a-zA-Z0-9_ -]/g, '');
    return `<span class="reward-sprite ${classes}" data-sprite-type="${type}" data-frame="${safeIndex}" ` +
      `aria-hidden="true" style="${frameStyle(type, safeIndex)}"></span>`;
  }

  function load(type) {
    if (loads.has(type)) return loads.get(type);
    const pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        image.onload = image.onerror = null;
        resolve(image);
      };
      image.onerror = () => {
        image.onload = image.onerror = null;
        reject(new Error('Die Belohnungsgrafik konnte nicht geladen werden.'));
      };
      image.src = sheets[type].path;
    });
    loads.set(type, pending);
    pending.catch(() => loads.delete(type));
    return pending;
  }

  function preload(card) {
    if (!cardType(card)) return Promise.reject(new Error('Unbekannte Belohnungskarte.'));
    return Promise.all([load('gift'), load(card)]);
  }

  function play(container, card, options = {}) {
    if (!container || typeof container.querySelector !== 'function') {
      throw new Error('Die Belohnungsanzeige fehlt.');
    }
    if (active.has(container)) active.get(container)();
    let cancelled = false;
    let finished = false;
    let timer = null;
    let stage = '';

    function cancel() {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (active.get(container) === cancel) active.delete(container);
    }
    active.set(container, cancel);

    function callback(name, value) {
      if (!cancelled && typeof options[name] === 'function') options[name](value);
    }

    function complete() {
      if (cancelled || finished) return;
      finished = true;
      timer = null;
      active.delete(container);
      callback('onComplete');
    }

    function show(type, index) {
      if (cancelled) return;
      const nextStage = type === 'gift' ? 'gift' : 'card';
      container.dataset.animationStage = nextStage;
      container.dataset.frame = String(index);
      const sprite = container.querySelector('.reward-sprite');
      const rect = sheets[type].frames[index];
      // Keep the playback area square without cropping the differently sized rows.
      sprite.style.cssText = frameStyle(type, index) +
        `width:${number(Math.min(1, rect.w / rect.h) * 100)}%;`;
      sprite.dataset.spriteType = type;
      sprite.dataset.frame = String(index);
      if (nextStage !== stage) {
        stage = nextStage;
        callback('onStage', stage);
      }
    }

    function advance(type, index) {
      if (cancelled || finished) return;
      show(type, index);
      if (cancelled) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (cancelled) return;
        if (index + 1 < sheets[type].frames.length) advance(type, index + 1);
        else if (type === 'gift') advance(card, 0);
        else complete();
      }, type === 'gift' ? 140 : 180);
    }

    preload(card).then(() => {
      if (cancelled) return;
      container.innerHTML = `<span class="reward-sprite-stage">${frameMarkup('gift')}</span>`;
      // Opening is explicitly requested by the user. Always show the complete
      // gift and card sequence; the visible Skip/Close controls remain available.
      // A system motion preference must not silently discard both animations.
      advance('gift', 0);
    }).catch(error => {
      if (cancelled || finished) return;
      finished = true;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      active.delete(container);
      callback('onError', error);
    });

    return cancel;
  }

  window.RewardAnimation = Object.freeze({ frameMarkup, preload, play });
})();
