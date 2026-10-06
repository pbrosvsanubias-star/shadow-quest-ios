/* Local presentation only: authentication and Firestore traffic stay in native iOS. */
(function () {
  'use strict';
  const icons = {
    trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 3v5m-4 2h8m-10 0h12"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/>',
    shield: '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>'
  };
  let host = null;
  let state = {};
  let signature = '';
  let localError = '';
  let confirmation = '';
  let submitted = false;
  let submitTimer = null;
  const drafts = { nickname: '' };

  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
  const points = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const number = value => points(value).toLocaleString('de-DE');
  const busy = () => Boolean(state.busy || submitted);
  const disabled = () => busy() ? ' disabled' : '';
  const value = field => escape(drafts[field]);

  function normalize(source) {
    const raw = source || {};
    return {
      configured: Boolean(raw.configured), enabled: Boolean(raw.enabled), busy: Boolean(raw.busy),
      nickname: String(raw.nickname || ''), period: raw.period === 'total' ? 'total' : 'week',
      entries: Array.isArray(raw.entries) ? raw.entries.slice(0, 50).filter(item => item && typeof item === 'object').map(item => ({ uid: String(item.uid || ''), name: String(item.name || 'Hunter'), totalXp: points(item.totalXp), weekXp: points(item.weekXp) })) : [],
      ownUid: String(raw.ownUid || ''), ownTotalXp: points(raw.ownTotalXp), ownWeekXp: points(raw.ownWeekXp),
      weekStartUTCMondayMillis: Number(raw.weekStartUTCMondayMillis || raw.weekStart) || 0,
      lastUpdated: Number(raw.lastUpdated) || 0, error: String(raw.error || ''), statusMessage: String(raw.statusMessage || '')
    };
  }

  function notices() {
    const message = localError || state.error;
    return '<div class="lb-notices" aria-live="polite" aria-atomic="true">' +
      (message ? '<p class="lb-error" role="alert">' + escape(message) + '</p>' : '') +
      (state.statusMessage ? '<p class="lb-status">' + escape(state.statusMessage) + '</p>' : '') + '</div>';
  }

  function introduction() {
    return '<header class="page-heading lb-heading"><span class="kicker">GEMEINSAM STÄRKER</span><h1>Hunter-Rangliste.</h1><p>Alle Hunter. Eine Herausforderung.</p></header>';
  }

  function offline() {
    return '<section class="panel lb-welcome"><div class="lb-emblem">' + icon('people') + '</div><span class="lb-overline">ALLE HUNTER</span><h2>Gemeinsam aufsteigen.</h2><p>Vergleiche deine Trainings-XP mit allen teilnehmenden Huntern.</p><div class="lb-setup-note"><span class="lb-dot"></span><strong>Online-Verbindung wird noch eingerichtet</strong></div><p class="lb-small">Die Rangliste ist noch nicht verbunden. Deine Trainings, Level und Geschenke funktionieren weiterhin auf deinem Handy.</p></section>';
  }

  function enrollment() {
    return '<section class="panel lb-welcome"><div class="lb-emblem">' + icon('trophy') + '</div><span class="lb-overline">DEIN PLATZ IN DER RANGLISTE</span><h2>Wie heißt dein Hunter?</h2><p>Wähle deinen Namen und nimm direkt an der gemeinsamen Rangliste teil.</p><form data-lb-form="activate" class="lb-form"><label for="lb-nickname">Hunter-Name</label><input id="lb-nickname" name="nickname" data-lb-draft="nickname" value="' + value('nickname') + '" maxlength="20" minlength="2" autocomplete="nickname" placeholder="Dein Hunter-Name" required' + disabled() + '><p class="lb-input-help">2–20 Zeichen · für alle Teilnehmer sichtbar</p><div class="lb-disclosure">' + icon('shield') + '<p>Mit „Mitmachen“ sendest du deinen Hunter-Namen und deine gesamten und wöchentlichen Trainings-XP an Firebase. Alle Teilnehmer können diese Werte sehen. Kamerabilder und Laufstrecken bleiben auf deinem Handy.</p></div><button class="primary-button" type="submit"' + disabled() + '>' + (busy() ? 'Verbindung wird hergestellt …' : 'Mitmachen') + '</button></form><p class="lb-small">Dein Gastprofil gehört zu dieser Installation. Beim Deinstallieren oder Löschen der App-Daten kann der Zugang verloren gehen.</p></section>';
  }

  function weekLabel() {
    if (!state.weekStartUTCMondayMillis) return 'Neue Woche: Montag, 00:00 Uhr UTC.';
    const date = new Date(state.weekStartUTCMondayMillis);
    if (!Number.isFinite(date.getTime())) return 'Neue Woche: Montag, 00:00 Uhr UTC.';
    return 'Seit ' + date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' · Neustart montags um 00:00 Uhr UTC.';
  }

  function ranking() {
    const week = state.period === 'week';
    const key = week ? 'weekXp' : 'totalXp';
    const entries = state.entries.slice().sort((first, second) => second[key] - first[key] || first.name.localeCompare(second.name, 'de') || first.uid.localeCompare(second.uid));
    let rank = 0;
    let previous = null;
    const rows = entries.map((entry, index) => {
      if (entry[key] !== previous) rank = index + 1;
      previous = entry[key];
      const self = Boolean(state.ownUid && entry.uid === state.ownUid);
      return '<li class="lb-entry' + (self ? ' lb-self' : '') + (rank <= 3 ? ' lb-top-' + rank : '') + '"><span class="lb-place" aria-label="Platz ' + rank + '">' + (rank === 1 ? icon('trophy') : rank) + '</span><span class="lb-player"><strong>' + escape(entry.name) + '</strong>' + (self ? '<span class="lb-you">DU</span>' : '') + '</span><span class="lb-points"><strong>' + number(entry[key]) + '</strong><span>XP</span></span></li>';
    }).join('');
    const updated = state.lastUpdated ? new Date(state.lastUpdated) : null;
    const updatedText = updated && Number.isFinite(updated.getTime()) ? 'Letzter Abruf: ' + updated.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Noch keine Rangliste abgerufen.';
    return '<section class="panel lb-community"><div class="lb-community-title"><div><span class="lb-overline">ALLE HUNTER</span><h2>Gemeinsam aufsteigen.</h2></div><span class="lb-mini-emblem">' + icon('people') + '</span></div><p class="lb-profile-line">' + icon('shield') + '<span>Dein Hunter: <strong>' + escape(state.nickname) + '</strong></span></p><p class="lb-small">Dein Name und deine Trainings-XP sind für alle Teilnehmer sichtbar.</p></section>' +
      '<div class="lb-period" role="group" aria-label="Zeitraum"><button type="button" data-lb-action="week" aria-pressed="' + week + '"' + disabled() + '>Diese Woche</button><button type="button" data-lb-action="total" aria-pressed="' + !week + '"' + disabled() + '>Gesamt</button></div>' +
      '<section class="lb-own-score"><div><span>DEINE TRAININGS-XP</span><strong>' + number(week ? state.ownWeekXp : state.ownTotalXp) + '<small> XP</small></strong></div><span class="lb-score-rune" aria-hidden="true">◇</span></section><p class="lb-period-note">' + (week ? escape(weekLabel()) : 'Alle gesammelten Trainings-XP. Dein persönliches Level bleibt unverändert.') + '</p>' +
      '<section class="lb-ranking" aria-label="Rangliste"><div class="lb-ranking-heading"><h2>' + (week ? 'Diese Woche' : 'Gesamtrangliste') + '</h2><span>TOP 50</span></div>' + (entries.length ? '<ol class="lb-entries">' + rows + '</ol>' : '<div class="lb-empty">' + icon('trophy') + '<h3>' + (busy() ? 'Rangliste wird geladen …' : 'Noch keine Einträge') + '</h3><p>Aktualisiere die Rangliste, um die Trainings-XP aller Teilnehmer abzurufen.</p></div>') + '</section>' +
      '<button type="button" class="secondary-button lb-refresh" data-lb-action="refresh"' + disabled() + '>' + icon('refresh') + (busy() ? 'Wird aktualisiert …' : 'Rangliste aktualisieren') + '</button><p class="lb-update-note">' + escape(updatedText) + '</p>' +
      '<div class="lb-fairness">' + icon('shield') + '<p>Es zählen nur Trainings-XP. Geschenk-Bonus-XP zählen nicht mit. Offline-Trainings werden bei der nächsten Verbindung übertragen. Die Rangliste beruht auf euren eingetragenen Trainings.</p></div>' + accountActions();
  }

  function accountActions() {
    let content = '<div class="lb-account-actions">';
    if (confirmation) {
      content += '<section class="lb-confirm" role="group" aria-labelledby="lb-confirm-title"><h3 id="lb-confirm-title">Teilnahme beenden?</h3><p>Dein Eintrag wird aus der gemeinsamen Rangliste entfernt. Deine Trainings bleiben auf deinem Handy erhalten. Du kannst später mit deinem Hunter-Namen wieder mitmachen.</p><div class="button-pair"><button type="button" class="secondary-button" data-lb-action="cancel"' + disabled() + '>Abbrechen</button><button type="button" class="secondary-button lb-danger" data-lb-action="confirm-disconnect"' + disabled() + '>Teilnahme beenden</button></div></section>';
    } else {
      content += '<button type="button" class="text-button lb-muted-button" data-lb-action="disconnect"' + disabled() + '>Teilnahme beenden</button>';
    }
    return content + '</div>';
  }

  function repaint() {
    if (!host) return;
    const active = host.contains(document.activeElement) ? document.activeElement : null;
    const focusId = active && active.id;
    const focusAction = active && active.getAttribute('data-lb-action');
    const start = active && active.selectionStart;
    const end = active && active.selectionEnd;
    host.classList.add('lb-root');
    host.setAttribute('aria-busy', String(busy()));
    host.innerHTML = introduction() + notices() + (!state.configured ? offline() : !state.enabled ? enrollment() : ranking());
    let target = focusId ? host.querySelector('#' + focusId) : null;
    if (!target && focusAction) target = Array.from(host.querySelectorAll('[data-lb-action]')).find(element => element.getAttribute('data-lb-action') === focusAction);
    if (target && !target.disabled) {
      target.focus({ preventScroll: true });
      if (typeof start === 'number' && typeof target.setSelectionRange === 'function') target.setSelectionRange(start, end);
    }
  }

  function showError(message) {
    localError = message;
    repaint();
  }

  function invoke(method, args) {
    if (busy()) return;
    if (!window.Hunter || typeof window.Hunter[method] !== 'function') {
      showError('Die Online-Verbindung ist hier noch nicht verfügbar. Dein Training bleibt gespeichert.');
      return;
    }
    localError = '';
    submitted = true;
    clearTimeout(submitTimer);
    submitTimer = setTimeout(() => {
      submitted = false;
      localError = 'Die Verbindung braucht länger. Prüfe deine Internetverbindung und versuche es erneut.';
      repaint();
    }, 30000);
    repaint();
    try { window.Hunter[method].apply(window.Hunter, args || []); }
    catch (_) {
      submitted = false;
      clearTimeout(submitTimer);
      showError('Die Verbindung konnte nicht gestartet werden. Bitte versuche es erneut.');
    }
  }

  function onInput(event) {
    const field = event.target.getAttribute('data-lb-draft');
    if (Object.prototype.hasOwnProperty.call(drafts, field)) drafts[field] = event.target.value;
  }

  function onSubmit(event) {
    const form = event.target.closest('[data-lb-form]');
    if (!form || !host.contains(form)) return;
    event.preventDefault();
    if (busy()) return;
    const action = form.getAttribute('data-lb-form');
    if (action === 'activate') {
      const nickname = drafts.nickname.trim();
      if (nickname.length < 2 || nickname.length > 20) return showError('Dein Hunter-Name braucht 2 bis 20 Zeichen.');
      drafts.nickname = nickname;
      invoke('activateLeaderboard', [nickname]);
    }
  }

  function onClick(event) {
    const button = event.target.closest('[data-lb-action]');
    if (!button || !host.contains(button) || button.disabled || busy()) return;
    const action = button.getAttribute('data-lb-action');
    if (action === 'week' || action === 'total') {
      if (state.period === action) return;
      invoke('refreshLeaderboard', [action]);
    } else if (action === 'refresh') invoke('refreshLeaderboard', [state.period]);
    else if (action === 'disconnect') {
      confirmation = action;
      repaint();
      const cancel = host.querySelector('[data-lb-action="cancel"]');
      if (cancel) cancel.focus({ preventScroll: true });
    } else if (action === 'cancel') {
      const previous = confirmation;
      confirmation = '';
      repaint();
      const original = host.querySelector('[data-lb-action="' + previous + '"]');
      if (original) original.focus({ preventScroll: true });
    } else if (action === 'confirm-disconnect') {
      confirmation = '';
      invoke('disconnectLeaderboard');
    }
  }

  function update(source) {
    if (!host) return;
    const incoming = normalize(source);
    const nextSignature = JSON.stringify(incoming);
    if (signature === nextSignature) return;
    if (state.enabled !== incoming.enabled) confirmation = '';
    state = incoming;
    signature = nextSignature;
    submitted = false;
    clearTimeout(submitTimer);
    localError = '';
    if (!drafts.nickname && state.nickname) drafts.nickname = state.nickname;
    repaint();
  }

  function close() {
    if (host) {
      host.removeEventListener('click', onClick);
      host.removeEventListener('input', onInput);
      host.removeEventListener('submit', onSubmit);
    }
    clearTimeout(submitTimer);
    host = null;
    signature = '';
    confirmation = '';
    localError = '';
    submitted = false;
  }

  function render(container, source) {
    close();
    if (!container || typeof container.addEventListener !== 'function') return;
    host = container;
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('submit', onSubmit);
    update(source);
  }

  window.LeaderboardUI = Object.freeze({ render, update, close });
})();
