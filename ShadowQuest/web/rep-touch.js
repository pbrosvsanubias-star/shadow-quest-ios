/* Count a repetition at the start of a contact, including short nose touches. */
(() => {
  'use strict';
  const CONTACT_GAP_MS = 450;
  const COMPATIBILITY_CLICK_MS = 750;

  function bind(element, { onRep, canCount = () => true } = {}) {
    if (!element || typeof onRep !== 'function') throw new TypeError('RepTouch requires an element and onRep.');
    const doc = element.ownerDocument;
    const win = doc.defaultView || window;
    const contacts = new Set();
    const listeners = [];
    let disposed = false;
    let lastAccepted = -Infinity;
    let suppressClickUntil = -Infinity;
    let suppressMouseUntil = -Infinity;
    let keyboardIntentUntil = -Infinity;
    const now = () => win.performance.now();
    const prevent = event => { if (event.cancelable) event.preventDefault(); };
    const listen = (target, type, handler, options = false) => {
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    };
    const physicalContact = () => {
      suppressClickUntil = now() + COMPATIBILITY_CLICK_MS;
      keyboardIntentUntil = -Infinity;
    };
    const countContact = wasHeld => {
      if (disposed || wasHeld || now() - lastAccepted < CONTACT_GAP_MS || !canCount()) return;
      lastAccepted = now();
      onRep();
    };
    const release = (key, event) => {
      if (disposed || !contacts.delete(key)) return;
      prevent(event);
      physicalContact();
    };
    const pointerKey = event => event.pointerId ?? 'primary';
    const isContactPointer = event => event.pointerType === 'touch' || event.button === 0;
    const startsInPad = event => !!event.target?.nodeType && element.contains(event.target);

    if (typeof win.PointerEvent === 'function') {
      listen(element, 'pointerdown', event => {
        if (disposed || !isContactPointer(event)) return;
        prevent(event);
        const wasHeld = contacts.size > 0;
        contacts.add(pointerKey(event));
        physicalContact();
        // Capture is helpful when a finger moves out of the pad, but counting
        // must also work on WebViews that do not implement it successfully.
        try { element.setPointerCapture?.(event.pointerId); } catch (_) {}
        countContact(wasHeld);
      }, { passive: false });
      listen(win, 'pointerup', event => release(pointerKey(event), event), { capture: true, passive: false });
      listen(win, 'pointercancel', event => release(pointerKey(event), event), { capture: true, passive: false });
      // A second contact outside the pad must also lift before another rep.
      listen(win, 'pointerdown', event => {
        if (disposed || !contacts.size || startsInPad(event) || !isContactPointer(event)) return;
        contacts.add(pointerKey(event));
        physicalContact();
      }, true);
    } else {
      const touchKey = touch => `touch:${touch.identifier}`;
      listen(element, 'touchstart', event => {
        if (disposed || !event.changedTouches?.length) return;
        prevent(event);
        const wasHeld = contacts.size > 0;
        for (const touch of Array.from(event.touches || event.changedTouches)) contacts.add(touchKey(touch));
        physicalContact();
        suppressMouseUntil = now() + 1000;
        countContact(wasHeld);
      }, { passive: false });
      const endTouch = event => {
        if (disposed) return;
        for (const touch of Array.from(event.changedTouches || [])) release(touchKey(touch), event);
        suppressMouseUntil = now() + 1000;
      };
      listen(win, 'touchend', endTouch, { capture: true, passive: false });
      listen(win, 'touchcancel', endTouch, { capture: true, passive: false });
      listen(win, 'touchstart', event => {
        if (disposed || !contacts.size || startsInPad(event)) return;
        for (const touch of Array.from(event.touches || event.changedTouches || [])) contacts.add(touchKey(touch));
        physicalContact();
        suppressMouseUntil = now() + 1000;
      }, true);
      listen(element, 'mousedown', event => {
        if (disposed || event.button !== 0 || now() < suppressMouseUntil) return;
        prevent(event);
        const wasHeld = contacts.size > 0;
        contacts.add('mouse');
        physicalContact();
        countContact(wasHeld);
      }, { passive: false });
      listen(win, 'mouseup', event => { if (event.button === 0) release('mouse', event); }, { capture: true, passive: false });
      listen(win, 'touchmove', event => { if (!disposed && contacts.size) prevent(event); }, { passive: false });
    }

    listen(element, 'keydown', event => {
      if (disposed || !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
      if (event.repeat) { prevent(event); return; }
      keyboardIntentUntil = now() + 1000;
    });
    listen(element, 'click', event => {
      if (disposed) return;
      prevent(event);
      event.stopImmediatePropagation();
      const keyboardClick = now() <= keyboardIntentUntil;
      keyboardIntentUntil = -Infinity;
      // Physical input was counted on contact. Keep detail=0 activation for
      // keyboards, accessibility services and programmatic button activation.
      if (event.detail !== 0 || contacts.size || (!keyboardClick && now() < suppressClickUntil) || !canCount()) return;
      onRep();
    }, true);
    const blockGesture = event => {
      if (disposed) return;
      prevent(event);
      event.stopPropagation();
    };
    listen(element, 'contextmenu', blockGesture);
    listen(element, 'selectstart', blockGesture);
    listen(element, 'dragstart', blockGesture);

    const clearContacts = () => {
      if (disposed) return;
      if (contacts.size) physicalContact();
      contacts.clear();
      keyboardIntentUntil = -Infinity;
    };
    listen(win, 'blur', clearContacts);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) clearContacts(); });

    return () => {
      if (disposed) return;
      disposed = true;
      contacts.clear();
      for (const remove of listeners) remove();
    };
  }

  window.RepTouch = Object.freeze({ bind });
})();
