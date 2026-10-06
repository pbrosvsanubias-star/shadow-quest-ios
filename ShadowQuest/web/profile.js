/* Profile presentation. Saved data and online access belong to the native iOS bridge. */
(function () {
  'use strict';
  const icons = {
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/><path d="m14 5 5 5"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 3v5m-4 2h8"/>'
  };
  let host = null;
  let profile = {};
  let leaderboard = {};
  let stats = {};
  let actions = {};
  let signature = '';
  let editing = false;
  let picker = false;
  let search = '';
  let removeUid = '';
  let localError = '';
  let pending = null;
  let pendingTimer = null;
  const drafts = { nickname: '', bio: '' };
  const dirty = { nickname: false, bio: false };

  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const count = value => Array.from(String(value || '')).length;
  const points = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const number = value => points(value).toLocaleString('de-DE');
  const distance = value => (Math.max(0, Number(value) || 0) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
  const busy = () => Boolean(profile.busy || pending);
  const disabled = () => busy() ? ' disabled' : '';
  const networkAvailable = () => Boolean(leaderboard.configured && leaderboard.enabled);
  const currentWeek = () => { const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return date.getTime(); };

  function normalize(rawProfile, rawLeaderboard, rawStats) {
    const source = rawProfile || {};
    const board = rawLeaderboard || {};
    const values = rawStats || {};
    const today = values.today || {};
    const friends = [];
    const seenFriends = new Set();
    if (Array.isArray(source.friends)) for (const item of source.friends) {
      if (!item || typeof item !== 'object' || !item.uid || seenFriends.has(String(item.uid)) || String(item.uid) === String(board.ownUid || '')) continue;
      if (friends.length === 30) break;
      seenFriends.add(String(item.uid));
      friends.push({ uid: String(item.uid), name: String(item.name || ''), totalXp: points(item.totalXp), weekXp: Number(item.weekStart) === currentWeek() ? points(item.weekXp) : 0, active: item.active !== false, updatedAt: points(item.updatedAt), weekStart: points(item.weekStart) });
    }
    const entries = [];
    const seenEntries = new Set();
    if (Array.isArray(board.entries)) for (const item of board.entries.slice(0, 50)) {
      if (!item || typeof item !== 'object' || !item.uid || seenEntries.has(String(item.uid)) || String(item.uid) === String(board.ownUid || '')) continue;
      seenEntries.add(String(item.uid));
      entries.push({ uid: String(item.uid), name: String(item.name || ''), totalXp: points(item.totalXp), weekXp: points(item.weekXp) });
    }
    return {
      profile: { nickname: String(source.nickname || board.nickname || ''), bio: String(source.bio || ''), friends, busy: Boolean(source.busy), error: String(source.error || ''), statusMessage: String(source.statusMessage || ''), lastUpdated: points(source.lastUpdated), operationRevision: points(source.operationRevision), hasOperationRevision: Object.prototype.hasOwnProperty.call(source, 'operationRevision') && Number.isFinite(Number(source.operationRevision)) },
      leaderboard: { configured: Boolean(board.configured), enabled: Boolean(board.enabled), busy: Boolean(board.busy), error: String(board.error || ''), entries, ownUid: String(board.ownUid || ''), lastUpdated: points(board.lastUpdated) },
      stats: { lifetimeXp: points(values.lifetimeXp), trainingXp: points(values.trainingXp), level: Math.min(100, Math.max(1, points(values.level))), rank: String(values.rank || 'E'), nextLevelXp: points(values.nextLevelXp), currentLevelXp: points(values.currentLevelXp), runMeters: points(values.runMeters), pushups: points(values.pushups), squats: points(values.squats), sessions: points(values.sessions), streak: points(values.streak), today: { runMeters: points(today.runMeters), pushups: points(today.pushups), squats: points(today.squats), sessions: points(today.sessions), trainingXp: points(today.trainingXp) } }
    };
  }

  function notices() {
    const message = localError || profile.error;
    return '<div class="hp-notices" aria-live="polite" aria-atomic="true">' + (message ? '<p class="hp-error" role="alert">' + escape(message) + '</p>' : '') + (profile.statusMessage ? '<p class="hp-status">' + escape(profile.statusMessage) + '</p>' : '') + '</div>';
  }

  function identity() {
    const levelProgress = stats.level >= 100 ? 100 : stats.nextLevelXp > 0 ? Math.max(0, Math.min(100, stats.currentLevelXp / stats.nextLevelXp * 100)) : 0;
    return '<section class="panel hp-identity"><div class="hp-identity-top"><div class="hp-avatar"><svg viewBox="1715 10 450 450" role="img" aria-label="Dein Anime-Hunter"><image href="images/shadow-profile-banner.png" width="2169" height="725"/></svg></div><div class="hp-name"><span class="hp-overline">DEIN HUNTER</span><h1>' + escape(profile.nickname || 'Dein Hunter') + '</h1><div class="hp-badges"><span class="pill">RANG ' + escape(stats.rank) + '</span><span class="pill">LEVEL ' + number(stats.level) + '</span></div></div></div><div class="hp-level"><div class="xp-text"><span>DEIN LEVEL-FORTSCHRITT</span><strong>' + (stats.level >= 100 ? 'MAX. LEVEL' : number(stats.currentLevelXp) + ' / ' + number(stats.nextLevelXp) + ' XP') + '</strong></div><div class="progress" role="progressbar" aria-label="Fortschritt zum nächsten Level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(levelProgress) + '"><span style="width:' + levelProgress + '%"></span></div></div>' + (editing ? editor() : '<div class="hp-biography"><h2>Deine Bio</h2>' + (profile.bio ? '<p class="hp-bio-text">' + escape(profile.bio) + '</p>' : '<p class="hp-small">Was treibt dich an? Ergänze eine persönliche Bio.</p>') + '<button type="button" class="secondary-button hp-edit" data-hp-action="edit"' + disabled() + '>' + icon('edit') + (profile.nickname ? 'Profil bearbeiten' : 'Hunter-Namen festlegen') + '</button></div>') + '</section>';
  }

  function editor() {
    return '<form class="hp-form" data-hp-form="save"><label for="hp-nickname">Hunter-Name</label><input id="hp-nickname" name="nickname" data-hp-draft="nickname" value="' + escape(drafts.nickname) + '" maxlength="40" autocomplete="nickname" placeholder="Dein Hunter-Name" required' + disabled() + '><p class="hp-small">2–20 Zeichen. Bei Teilnahme erscheint dein Name auch in der Rangliste.</p><label for="hp-bio">Deine Bio</label><textarea id="hp-bio" name="bio" data-hp-draft="bio" maxlength="600" rows="4" placeholder="Dein Weg. Deine Motivation."' + disabled() + '>' + escape(drafts.bio) + '</textarea><div class="hp-bio-help"><span>Deine Bio bleibt auf diesem Handy.</span><span data-hp-bio-count>' + count(drafts.bio) + ' / 300</span></div><div class="button-pair"><button type="button" class="secondary-button" data-hp-action="cancel-edit"' + disabled() + '>Abbrechen</button><button type="submit" class="primary-button"' + disabled() + '>' + (pending && pending.method === 'saveHunterProfile' ? 'Wird gespeichert …' : 'Speichern') + '</button></div></form>';
  }

  function metric(label, value, detail) {
    return '<div class="hp-metric"><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd>' + (detail ? '<span>' + escape(detail) + '</span>' : '') + '</div>';
  }

  function statistics() {
    return '<section class="hp-statistics" aria-labelledby="hp-statistics-title"><div class="section-heading"><h2 id="hp-statistics-title">Deine Statistiken</h2><span>GESPEICHERTE TRAININGS</span></div><dl class="hp-xp-grid">' + metric('Level-XP', number(stats.lifetimeXp) + ' XP', 'Inklusive Geschenk-Bonus') + metric('Trainings-XP', number(stats.trainingXp) + ' XP', 'Für die Rangliste') + '</dl><dl class="hp-stats-grid">' + metric('Gelaufen', distance(stats.runMeters)) + metric('Push Ups', number(stats.pushups)) + metric('Squats', number(stats.squats)) + metric('Trainings', number(stats.sessions)) + metric('Trainingsserie', number(stats.streak) + (stats.streak === 1 ? ' Tag' : ' Tage'), 'Aufeinanderfolgende Trainingstage') + '</dl></section><section class="panel hp-today" aria-labelledby="hp-today-title"><div class="row"><h2 id="hp-today-title">Heute</h2><span class="pill">' + number(stats.today.trainingXp) + ' Trainings-XP</span></div><dl class="hp-today-grid">' + metric('Gelaufen', distance(stats.today.runMeters)) + metric('Push Ups', number(stats.today.pushups)) + metric('Squats', number(stats.today.squats)) + metric('Trainings', number(stats.today.sessions)) + '</dl></section>';
  }

  function dateText(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  }

  function friends() {
    const rows = profile.friends.map(friend => {
      const updated = dateText(friend.updatedAt);
      return '<li class="hp-friend"><span class="hp-friend-emblem" aria-hidden="true">◇</span><div class="hp-friend-copy"><strong>' + escape(friend.name || 'Name nicht verfügbar') + '</strong><span>' + (friend.active ? number(friend.totalXp) + ' Gesamt-XP · ' + number(friend.weekXp) + ' Wochen-XP' : 'Zurzeit nicht in der Rangliste') + '</span>' + (updated ? '<small>Gespeicherter Stand: ' + escape(updated) + '</small>' : '') + '</div><button type="button" class="text-button hp-remove" data-hp-action="remove" data-hp-uid="' + escape(friend.uid) + '" aria-label="' + escape(friend.name || 'Hunter') + ' aus deiner Freundesliste entfernen"' + disabled() + '>Entfernen</button></li>';
    }).join('');
    let hint = '';
    if (!leaderboard.configured) hint = '<p class="hp-friend-note">Die Online-Rangliste ist noch nicht verbunden. Deine gespeicherte Freundesliste bleibt auf deinem Handy.</p>';
    else if (!leaderboard.enabled) hint = '<p class="hp-friend-note">Nimm an der Hunter-Rangliste teil, um Hunter auszuwählen und ihre Werte zu aktualisieren.</p>';
    else if (leaderboard.error) hint = '<p class="hp-friend-note">Die Online-Verbindung ist gerade nicht verfügbar. Du siehst die zuletzt gespeicherten Werte.</p>';
    const selected = profile.friends.find(friend => friend.uid === removeUid);
    return '<section class="panel hp-friends" aria-labelledby="hp-friends-title"><div class="row"><h2 id="hp-friends-title">' + icon('people') + 'Freunde</h2><span class="hp-friend-count">' + profile.friends.length + ' / 30</span></div><p class="hp-small hp-friends-description">Hunter aus der Rangliste in deiner privaten Freundesliste merken.</p>' + hint + (profile.friends.length ? '<ul class="hp-friend-list">' + rows + '</ul>' : '<div class="hp-empty"><span aria-hidden="true">◇</span><h3>Noch keine Freunde gemerkt</h3><p>Wähle einen Hunter aus der gemeinsamen Rangliste aus.</p></div>') + (selected ? '<div class="hp-confirm" role="group" aria-labelledby="hp-confirm-title"><h3 id="hp-confirm-title">' + escape(selected.name || 'Hunter') + ' entfernen?</h3><p>Du entfernst diesen Hunter nur aus deiner privaten Liste.</p><div class="button-pair"><button type="button" class="secondary-button" data-hp-action="cancel-remove"' + disabled() + '>Abbrechen</button><button type="button" class="secondary-button hp-danger" data-hp-action="confirm-remove" data-hp-uid="' + escape(selected.uid) + '"' + disabled() + '>Entfernen</button></div></div>' : '') + '<div class="hp-friend-actions"><button type="button" class="secondary-button" data-hp-action="' + (networkAvailable() ? 'picker' : 'leaderboard') + '"' + disabled() + '>' + icon(networkAvailable() ? 'plus' : 'trophy') + (networkAvailable() ? picker ? 'Auswahl schließen' : 'Hunter hinzufügen' : 'Zur Hunter-Rangliste') + '</button>' + (networkAvailable() && profile.friends.length ? '<button type="button" class="text-button hp-refresh" data-hp-action="refresh"' + disabled() + '>' + icon('refresh') + 'Freunde aktualisieren</button>' : '') + '</div>' + (picker && networkAvailable() ? candidatePicker() : '') + '</section>';
  }

  function candidatePicker() {
    const selected = new Set(profile.friends.map(friend => friend.uid));
    const available = leaderboard.entries.filter(entry => !selected.has(entry.uid));
    const query = search.trim().toLocaleLowerCase('de-DE');
    const candidates = available.filter(entry => !query || entry.name.toLocaleLowerCase('de-DE').includes(query));
    let empty = 'Aktualisiere die Hunter-Rangliste, um Hunter zur Auswahl zu laden.';
    if (leaderboard.entries.length && !available.length) empty = 'Alle angezeigten Hunter sind bereits in deiner Freundesliste.';
    else if (available.length && !candidates.length) empty = 'Kein Hunter in dieser Auswahl gefunden.';
    return '<div class="hp-picker"><label for="hp-friend-search">Hunter in der Rangliste suchen</label><input id="hp-friend-search" data-hp-search value="' + escape(search) + '" type="search" placeholder="Hunter-Name" autocomplete="off"' + disabled() + '><p class="hp-small">Auswahl aus den zuletzt geladenen Top 50 der Rangliste.</p>' + (profile.friends.length >= 30 ? '<p class="hp-friend-note">Deine Liste ist voll. Entferne zuerst einen Hunter.</p>' : '') + (candidates.length ? '<ul class="hp-candidate-list">' + candidates.map(entry => '<li><div><strong>' + escape(entry.name || 'Name nicht verfügbar') + '</strong><span>' + number(entry.totalXp) + ' Gesamt-XP</span></div><button type="button" class="text-button" data-hp-action="add" data-hp-uid="' + escape(entry.uid) + '" aria-label="' + escape(entry.name || 'Hunter') + ' zur privaten Freundesliste hinzufügen"' + (busy() || profile.friends.length >= 30 ? ' disabled' : '') + '>Hinzufügen</button></li>').join('') + '</ul>' : '<p class="hp-friend-note">' + escape(empty) + '</p>') + '<button type="button" class="text-button hp-ranking-link" data-hp-action="leaderboard">Hunter-Rangliste öffnen</button></div>';
  }

  function repaint() {
    if (!host) return;
    const active = host.contains(document.activeElement) ? document.activeElement : null;
    const focusId = active && active.id;
    const focusAction = active && active.getAttribute('data-hp-action');
    const focusUid = active && active.getAttribute('data-hp-uid');
    let start = null;
    let end = null;
    try { start = active && active.selectionStart; end = active && active.selectionEnd; } catch (_) { /* Non-text input. */ }
    host.classList.add('hp-root');
    host.setAttribute('aria-busy', String(busy()));
    host.innerHTML = notices() + identity() + statistics() + friends() + '<button type="button" id="settings-button" class="secondary-button hp-settings" data-hp-action="goals">' + icon('settings') + 'Tagesziele &amp; App-Info</button><p class="hp-local-note">Bio und Freundesliste bleiben auf diesem Handy. Deine gespeicherten Trainings bilden deine Statistiken.</p>';
    let target = focusId ? host.querySelector('#' + focusId) : null;
    if (!target && focusAction) target = Array.from(host.querySelectorAll('[data-hp-action]')).find(element => element.getAttribute('data-hp-action') === focusAction && element.getAttribute('data-hp-uid') === focusUid);
    if (target && !target.disabled) {
      target.focus({ preventScroll: true });
      if (typeof start === 'number' && typeof target.setSelectionRange === 'function') try { target.setSelectionRange(start, end); } catch (_) { /* Search input selection may be unavailable. */ }
    }
  }

  function clearPending() {
    pending = null;
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  function invoke(method, args) {
    if (busy()) return;
    if (!window.Hunter || typeof window.Hunter[method] !== 'function') {
      localError = 'Dein Profil kann hier gerade nicht geändert werden. Bitte versuche es erneut.';
      repaint();
      return;
    }
    localError = '';
    pending = { method, args: args || [], seenBusy: false, lastUpdated: profile.lastUpdated, statusMessage: profile.statusMessage, operationRevision: profile.operationRevision, hasOperationRevision: profile.hasOperationRevision };
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      clearPending();
      localError = 'Das dauert gerade länger. Deine Eingaben bleiben erhalten. Bitte versuche es erneut.';
      repaint();
    }, 30000);
    repaint();
    try { window.Hunter[method].apply(window.Hunter, args || []); }
    catch (_) {
      clearPending();
      localError = 'Die Änderung konnte nicht gestartet werden. Deine Eingaben bleiben erhalten.';
      repaint();
    }
  }

  function onInput(event) {
    const field = event.target.getAttribute('data-hp-draft');
    if (Object.prototype.hasOwnProperty.call(drafts, field)) {
      drafts[field] = event.target.value;
      dirty[field] = true;
      if (field === 'bio') {
        const counter = host.querySelector('[data-hp-bio-count]');
        if (counter) counter.textContent = count(drafts.bio) + ' / 300';
      }
    } else if (event.target.hasAttribute('data-hp-search')) {
      search = event.target.value;
      repaint();
    }
  }

  function onSubmit(event) {
    const form = event.target.closest('[data-hp-form]');
    if (!form || !host.contains(form)) return;
    event.preventDefault();
    if (busy()) return;
    const nickname = drafts.nickname.trim().replace(/\s+/g, ' ');
    const bio = drafts.bio.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').trim();
    if (count(nickname) < 2 || count(nickname) > 20) localError = 'Dein Hunter-Name braucht 2 bis 20 Zeichen.';
    else if (count(bio) > 300) localError = 'Deine Bio darf höchstens 300 Zeichen enthalten.';
    else {
      drafts.nickname = nickname;
      drafts.bio = bio;
      invoke('saveHunterProfile', [nickname, bio]);
      return;
    }
    repaint();
  }

  function onClick(event) {
    const button = event.target.closest('[data-hp-action]');
    if (!button || !host.contains(button) || button.disabled) return;
    const action = button.getAttribute('data-hp-action');
    const uid = button.getAttribute('data-hp-uid');
    if (action === 'leaderboard' || action === 'goals') {
      const callback = action === 'leaderboard' ? actions.openLeaderboard : actions.openGoals;
      if (typeof callback === 'function') callback();
      return;
    }
    if (busy()) return;
    if (action === 'edit') {
      editing = true;
      repaint();
      const input = host.querySelector('#hp-nickname');
      if (input) input.focus({ preventScroll: true });
    } else if (action === 'cancel-edit') {
      drafts.nickname = profile.nickname;
      drafts.bio = profile.bio;
      dirty.nickname = dirty.bio = false;
      editing = false;
      localError = '';
      repaint();
    } else if (action === 'picker') {
      picker = !picker;
      removeUid = '';
      repaint();
      if (picker) {
        const input = host.querySelector('#hp-friend-search');
        if (input) input.focus({ preventScroll: true });
      }
    } else if (action === 'add') {
      if (!networkAvailable() || profile.friends.length >= 30 || !leaderboard.entries.some(entry => entry.uid === uid) || profile.friends.some(friend => friend.uid === uid)) return;
      invoke('addProfileFriend', [uid]);
    } else if (action === 'refresh' && networkAvailable()) invoke('refreshProfileFriends');
    else if (action === 'remove') {
      if (!profile.friends.some(friend => friend.uid === uid)) return;
      removeUid = uid;
      repaint();
      const cancel = host.querySelector('[data-hp-action="cancel-remove"]');
      if (cancel) cancel.focus({ preventScroll: true });
    } else if (action === 'cancel-remove') {
      const previous = removeUid;
      removeUid = '';
      repaint();
      const original = Array.from(host.querySelectorAll('[data-hp-action="remove"]')).find(element => element.getAttribute('data-hp-uid') === previous);
      if (original) original.focus({ preventScroll: true });
    } else if (action === 'confirm-remove') {
      removeUid = '';
      invoke('removeProfileFriend', [uid]);
    }
  }

  function update(rawProfile, rawLeaderboard, rawStats) {
    if (!host) return;
    const incoming = normalize(rawProfile, rawLeaderboard, rawStats);
    const nextSignature = JSON.stringify(incoming);
    let pendingChanged = false;
    if (pending) {
      if (incoming.profile.busy) pending.seenBusy = true;
      const acknowledged = !incoming.profile.busy && incoming.profile.hasOperationRevision && incoming.profile.operationRevision !== pending.operationRevision;
      const responseReceived = !pending.hasOperationRevision || acknowledged || (pending.seenBusy && !incoming.profile.busy);
      const failed = responseReceived && !incoming.profile.busy && Boolean(incoming.profile.error);
      const completed = responseReceived && !incoming.profile.busy && !incoming.profile.error && (
        pending.method === 'saveHunterProfile' ? incoming.profile.nickname === pending.args[0] && incoming.profile.bio === pending.args[1] :
          pending.method === 'addProfileFriend' ? incoming.profile.friends.some(friend => friend.uid === pending.args[0]) :
            pending.method === 'removeProfileFriend' ? !incoming.profile.friends.some(friend => friend.uid === pending.args[0]) :
              acknowledged || pending.seenBusy || incoming.profile.lastUpdated !== pending.lastUpdated || incoming.profile.statusMessage !== pending.statusMessage
      );
      if (completed || failed || acknowledged || (pending.seenBusy && !incoming.profile.busy)) {
        if (completed && pending.method === 'saveHunterProfile') {
          dirty.nickname = dirty.bio = false;
          editing = false;
        }
        clearPending();
        pendingChanged = true;
      }
    }
    if (signature === nextSignature && !pendingChanged) return;
    signature = nextSignature;
    profile = incoming.profile;
    leaderboard = incoming.leaderboard;
    stats = incoming.stats;
    if (!dirty.nickname) drafts.nickname = profile.nickname;
    if (!dirty.bio) drafts.bio = profile.bio;
    if (!profile.friends.some(friend => friend.uid === removeUid)) removeUid = '';
    if (!pending && pendingChanged) localError = '';
    repaint();
  }

  function destroy() {
    if (host) {
      host.removeEventListener('click', onClick);
      host.removeEventListener('input', onInput);
      host.removeEventListener('submit', onSubmit);
    }
    clearPending();
    host = null;
    signature = '';
    editing = picker = false;
    search = removeUid = localError = '';
    dirty.nickname = dirty.bio = false;
    drafts.nickname = drafts.bio = '';
  }

  function render(container, rawProfile, rawLeaderboard, rawStats, callbacks) {
    destroy();
    if (!container || typeof container.addEventListener !== 'function') return;
    host = container;
    actions = callbacks || {};
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('submit', onSubmit);
    update(rawProfile, rawLeaderboard, rawStats);
  }

  window.HunterProfileUI = Object.freeze({ render, update, destroy });
})();
