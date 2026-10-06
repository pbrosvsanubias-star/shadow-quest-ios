/* Shadow Quest — local interface. Native iOS owns storage, GPS and optional sharing. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const paths = {
    system: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5"/>',
    run: '<circle cx="15" cy="4" r="2"/><path d="m12 8 4 3 4 1M6 11l4-3 4 1-3 6 4 3v4M11 15l-4 4H3"/>',
    strength: '<path d="M7 8v8M4 9v6M17 8v8M20 9v6M7 12h10M4 12H2m18 0h2"/>',
    squats: '<circle cx="14" cy="4" r="2"/><path d="m12 8-3 6 7 2-4 5h5M12 8l4 3h5M9 14l-5 2 3 5H3"/>',
    camera: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
    history: '<path d="M3 10a9 9 0 1 1 1.8 8M3 4v6h6M12 7v5l3 2"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    pause: '<path d="M8 4v16M16 4v16" stroke-width="3"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    gps: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    bolt: '<path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z"/>',
    shield: '<path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 3v6m-4 1h8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.system}</svg>`;
  const rune = `<svg viewBox="0 0 150 170" fill="none" aria-hidden="true"><defs><linearGradient id="rune-gradient" x1="0" y1="0" x2="130" y2="170" gradientUnits="userSpaceOnUse"><stop stop-color="#d3c0ff"/><stop offset=".45" stop-color="#9a72f7"/><stop offset="1" stop-color="#574084"/></linearGradient></defs><path d="m75 10 55 33v74l-55 42-55-42V43L75 10Z" stroke="#a890ff" stroke-opacity=".2"/><path d="m75 20 46 28v63l-46 36-46-36V48l46-28Z" stroke="#a890ff" stroke-opacity=".14"/><path d="m75 38 27 16v38l-27 38-27-38V54l27-16Z" stroke="url(#rune-gradient)" stroke-width="2"/><path d="m48 54 27 29 27-29M75 83v47M48 92l27-9 27 9M75 38v22" stroke="url(#rune-gradient)" stroke-width="2"/><path d="m37 32-12 7m88-7 12 7M20 126l10 7m100-7-10 7M75 3v12m0 138v12" stroke="#c2a6ff" stroke-opacity=".5"/><path d="m75 60 8 10-8 13-8-13 8-10Z" fill="#bfa3ff" fill-opacity=".5"/><circle cx="20" cy="43" r="2" fill="#9e7aff"/><circle cx="130" cy="117" r="2" fill="#9e7aff"/></svg>`;
  $$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));

  const fallbackState = () => ({ run: { status: 'idle', distanceMeters: 0, elapsedSeconds: 0, gpsStatus: 'GPS bereit', accuracyMeters: null, points: [] }, squatDraft: 0, squats: {status:'idle', guidance:'Stelle das iPhone seitlich auf. Hüfte, Knie und Füße sollen sichtbar sein.', phase:'setup', tracking:false, camera:'front', cameraLabel:'Frontkamera', previewAvailable:false, previewActive:false}, pushupCameraDraft: 0, pushupCamera: {status:'idle', guidance:'Stelle das iPhone seitlich auf. Schultern, Ellenbogen, Hände, Hüfte und Füße sollen sichtbar sein.', phase:'setup', tracking:false, camera:'front', cameraLabel:'Frontkamera', previewAvailable:false, previewActive:false}, workouts: [], gifts: [], profile: {nickname:"",bio:"",friends:[],busy:false,error:null,statusMessage:"",lastUpdated:0}, leaderboard: {configured:false, enabled:false, entries:[]}, error: null });
  const native = typeof window.Hunter !== 'undefined';
  let state = fallbackState();
  let tab = 'home';
  let profileOrigin = 'home';
  let menuMusicAllowed = null;
  let squatScreenActive = null;
  let lastSquatPreviewBounds = '';
  let squatPreviewFramePending = false;
  let squatPreviewStartPending = false;
  let squatPreviewSuppressed = false;
  let squatFeedbackCount = null;
  let squatCountedUntil = 0;
  let squatCountedTimer;
  let squatResetPending = false;
  let squatResetTimer;
  let pushupCameraScreenActive = null;
  let lastPushupPreviewBounds = '';
  let pushupPreviewFramePending = false;
  let pushupPreviewStartPending = false;
  let pushupPreviewSuppressed = false;
  let pushupFeedbackCount = null;
  let pushupCountedUntil = 0;
  let pushupCountedTimer;
  let pushupResetPending = false;
  let pushupResetTimer;
  let noseMode = false;
  let strengthTouchMode = null;
  let disposeCounterTouch = null;
  let disposeNoseTouch = null;
  let toastTimer;
  let busy = false;
  let busyTimer;
  let pendingSave = null;
  let pendingGift = null;
  let giftRequestSequence = 0;
  let giftRequestTimer;
  let cancelGiftAnimation = null;
  let giftPlaybackGeneration = 0;
  let previousError = '';
  let modalFocus;
  let lastDay = new Date().toDateString();
  function loadLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } }
  function saveLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  let draft = Math.max(0, Math.min(10000, Math.floor(Number(loadLocal('sq.pushups', 0)) || 0)));
  let goals = loadLocal('sq.goals', { meters: 1000, reps: 20 });
  if (!goals || !Number.isFinite(goals.meters) || !Number.isFinite(goals.reps)) goals = { meters: 1000, reps: 20 };
  goals.meters = Math.max(100, Math.min(100000, goals.meters));
  goals.reps = Math.max(1, Math.min(1000, goals.reps));
  goals.squats = Math.max(1, Math.min(1000, Math.floor(Number(goals.squats) || 20)));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (n, places = 0) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: places, maximumFractionDigits: places });
  const distance = meters => meters >= 1000 ? `${num(meters / 1000, 2)} km` : `${num(meters)} m`;
  function duration(seconds) { const t = Math.max(0, Math.floor(seconds || 0)); return t >= 3600 ? `${Math.floor(t / 3600)}:${String(Math.floor(t % 3600 / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
  function pace(run) { if (run.distanceMeters < 20 || run.elapsedSeconds <= 0) return '–:––'; const seconds = Math.round(run.elapsedSeconds / (run.distanceMeters / 1000)); return seconds > 5999 ? '> 99:59' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  function progress(total) { let level = 1, current = Math.max(0, total), next = 100; while (current >= next) { current -= next; level++; next = 100 + (level - 1) * 50; } return { level, current, next, rank: level >= 100 ? 'S' : level >= 70 ? 'A' : level >= 44 ? 'B' : level >= 24 ? 'C' : level >= 10 ? 'D' : 'E' }; }
  function sameDay(timestamp, day = new Date()) { return new Date(timestamp).toDateString() === day.toDateString(); }
  function totals() { const all = state.workouts; const today = all.filter(w => sameDay(w.timestamp)); const sum = (list, key, type) => list.filter(w => !type || w.type === type).reduce((n, w) => n + Math.max(0, Number(w[key]) || 0), 0); return { xp: sum(all, 'xp') + sum(state.gifts, 'xp'), meters: sum(all, 'distanceMeters', 'run'), reps: sum(all, 'reps', 'pushups'), squats: sum(all, 'reps', 'squats'), todayMeters: sum(today, 'distanceMeters', 'run'), todayReps: sum(today, 'reps', 'pushups'), todaySquats: sum(today, 'reps', 'squats'), sessions: all.length }; }
  function streak() { const days = new Set(state.workouts.map(w => new Date(w.timestamp).toDateString())); const day = new Date(); if (!days.has(day.toDateString())) day.setDate(day.getDate() - 1); let count = 0; while (days.has(day.toDateString())) { count++; day.setDate(day.getDate() - 1); } return count; }
  function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200); }
  function callNative(method, ...args) {
    if (!native) { toast('GPS und Speichern sind in der iPhone-App verfügbar.'); return false; }
    if (busy && ['startRun','resumeRun','finishRun','savePushups','saveCameraPushups','saveSquats','claimGift'].includes(method)) return false;
    try {
      if (['startRun','resumeRun','finishRun','savePushups','saveCameraPushups','saveSquats','claimGift'].includes(method)) { busy = true; clearTimeout(busyTimer); busyTimer = setTimeout(() => { busy = false; }, 2500); }
      window.Hunter[method](...args); return true;
    } catch (_) { busy = false; toast('Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.'); return false; }
  }
  function syncMenuMusic() {
    if (!native || typeof window.Hunter.setMenuMusicAllowed !== 'function') return;
    const profileMenu = tab === 'profile' && !['training','run','strength','squats','pushup-camera'].includes(profileOrigin);
    const allowed = !document.hidden && (tab === 'home' || tab === 'history' || tab === 'leaderboard' || profileMenu) && state.run.status === 'idle';
    if (allowed === menuMusicAllowed) return;
    if (callNative('setMenuMusicAllowed', allowed)) menuMusicAllowed = allowed;
  }
  function stopGiftAnimation() { giftPlaybackGeneration++; if (cancelGiftAnimation) cancelGiftAnimation(); cancelGiftAnimation = null; }
  function syncSquatScreen() {
    if (!native || typeof window.Hunter.setSquatScreenActive !== 'function') return;
    const active = tab === 'squats' && !document.hidden;
    if (active !== squatScreenActive && callNative('setSquatScreenActive', active)) squatScreenActive = active;
  }
  // Only geometry crosses the bridge. Android displays the camera directly;
  // neither camera pixels nor model frames are copied into the page.
  function syncSquatPreviewBounds() {
    if (!native || typeof window.Hunter.setSquatPreviewBounds !== 'function') return;
    const preview = $('#squat-preview');
    const rect = preview?.getBoundingClientRect();
    const viewportHeight = Math.max(1, window.innerHeight);
    const nav = $('.bottom-nav')?.getBoundingClientRect();
    const clipBottom = nav && nav.height > 0 ? Math.max(0, Math.min(viewportHeight, nav.top)) : viewportHeight;
    const active = squatPreviewStartPending || ['starting','tracking'].includes(state.squats.status);
    const round = value => Math.round(Number(value || 0) * 10) / 10;
    const bounds = {
      x:round(rect?.left), y:round(rect?.top), width:round(rect?.width), height:round(rect?.height),
      viewportWidth:Math.max(1, window.innerWidth), viewportHeight, clipTop:0, clipBottom,
      visible:!!(preview && tab === 'squats' && !document.hidden && $('#modal-layer').hidden && active && !squatPreviewSuppressed && rect.width > 0 && rect.height > 0)
    };
    const payload = JSON.stringify(bounds);
    if (payload !== lastSquatPreviewBounds && callNative('setSquatPreviewBounds', payload)) lastSquatPreviewBounds = payload;
  }
  function scheduleSquatPreviewBounds() {
    if (squatPreviewFramePending) return;
    squatPreviewFramePending = true;
    window.requestAnimationFrame(() => { squatPreviewFramePending = false; syncSquatPreviewBounds(); });
  }
  function hideSquatPreview() {
    squatPreviewStartPending = false;
    squatPreviewSuppressed = true;
    clearSquatCountFeedback();
    syncSquatPreviewBounds();
  }
  function startSquatCamera() {
    squatPreviewSuppressed = false;
    squatPreviewStartPending = true;
    syncSquatPreviewBounds(); // Prepare the native surface before capture starts.
    if (!callNative('startSquats')) hideSquatPreview();
  }
  function clearSquatCountFeedback() {
    squatCountedUntil = 0;
    clearTimeout(squatCountedTimer);
  }
  function resetSquatPosition() {
    if (!native || typeof window.Hunter.resetSquatCalibration !== 'function' || squatResetPending || state.squats.status !== 'tracking' || pendingSave) return;
    clearSquatCountFeedback();
    squatResetPending = true;
    if (!callNative('resetSquatCalibration')) squatResetPending = false;
    clearTimeout(squatResetTimer);
    squatResetTimer = setTimeout(() => { squatResetPending = false; updateSquats(); }, 2000);
    updateSquats();
  }
  function updateSquatPhase(s, count, active, starting) {
    if (!active || !s.tracking || document.hidden || squatPreviewSuppressed || squatFeedbackCount === null || count < squatFeedbackCount) clearSquatCountFeedback();
    else if (count > squatFeedbackCount) {
      squatCountedUntil = Date.now() + 1500;
      clearTimeout(squatCountedTimer);
      squatCountedTimer = setTimeout(updateSquats, 1500);
    }
    squatFeedbackCount = count;
    const counted = active && s.tracking && !document.hidden && !squatPreviewSuppressed && Date.now() < squatCountedUntil;
    let phase = 'idle', label = 'Kamera aus', detail = 'Starte, wenn du bereit bist.';
    if (s.status === 'paused' || active && squatPreviewSuppressed) { label = 'Pausiert'; detail = 'Zum Weiterzählen bewusst fortsetzen.'; }
    else if (s.status === 'error') { phase = 'setup'; label = 'Kamera prüfen'; detail = 'Folge dem Hinweis oben.'; }
    else if (starting) { phase = 'setup'; label = 'Kamera startet'; detail = 'Handy stabil stehen lassen.'; }
    else if (squatResetPending) { phase = 'setup'; label = 'Oben neu erkennen'; detail = 'Kurz aufrecht und ruhig stehen.'; }
    else if (active && !s.tracking) { phase = 'setup'; label = s.bodyDetected ? 'Oben finden' : 'Position prüfen'; detail = s.bodyDetected ? 'Kurz aufrecht stehen, bevor du beginnst.' : 'Kopf, Schultern, Hüfte und Knie sichtbar halten.'; }
    else if (counted && ['upper','standing'].includes(s.phase)) { phase = 'counted'; label = 'Gezählt ✓'; detail = 'Wiederholung erfasst. Bereit für die nächste.'; }
    else if (active) {
      const steps = {
        standing:['standing','Bereit · oben','Jetzt kontrolliert absenken.'],
        upper:['standing','Bereit · oben','Jetzt kontrolliert absenken.'],
        lowering:['lowering','Absenken','Bewegung erkannt. Unten noch nicht bestätigt.'],
        down:['down','Unten erkannt','Jetzt wieder ganz aufrichten.'],
        rising:['rising','Hochkommen','Bewegung erkannt. Richte dich weiter auf.']
      };
      [phase,label,detail] = steps[s.phase] || ['setup','Oben finden','Kurz aufrecht und ruhig stehen.'];
    }
    const output = $('#squat-phase');
    output.classList.add('squat-progress');
    const key = JSON.stringify([phase,label,detail]);
    if (output.dataset.key !== key) {
      output.dataset.key = key;
      output.innerHTML = `<span class="squat-phase-label" data-phase="${phase}">${label}</span><span class="squat-phase-detail">${detail}</span>`;
    }
    $('#squat-count').dataset.counted = String(counted);
  }
  function syncPushupPreviewBounds() {
    if (!native || typeof window.Hunter.setPushupPreviewBounds !== 'function') return;
    const preview = $('#pushup-preview');
    const rect = preview?.getBoundingClientRect();
    const viewportHeight = Math.max(1, window.innerHeight);
    const nav = $('.bottom-nav')?.getBoundingClientRect();
    const clipBottom = nav && nav.height > 0 ? Math.max(0, Math.min(viewportHeight, nav.top)) : viewportHeight;
    const active = pushupPreviewStartPending || ['starting','tracking'].includes(state.pushupCamera.status);
    const round = value => Math.round(Number(value || 0) * 10) / 10;
    const bounds = {
      x:round(rect?.left), y:round(rect?.top), width:round(rect?.width), height:round(rect?.height),
      viewportWidth:Math.max(1, window.innerWidth), viewportHeight, clipTop:0, clipBottom,
      visible:!!(preview && tab === 'pushup-camera' && !document.hidden && $('#modal-layer').hidden && active && !pushupPreviewSuppressed && rect.width > 0 && rect.height > 0)
    };
    const payload = JSON.stringify(bounds);
    if (payload !== lastPushupPreviewBounds && callNative('setPushupPreviewBounds', payload)) lastPushupPreviewBounds = payload;
  }
  function schedulePushupPreviewBounds() {
    if (pushupPreviewFramePending) return;
    pushupPreviewFramePending = true;
    window.requestAnimationFrame(() => { pushupPreviewFramePending = false; syncPushupPreviewBounds(); });
  }
  function hidePushupPreview() {
    pushupPreviewStartPending = false;
    pushupPreviewSuppressed = true;
    clearPushupCountFeedback();
    syncPushupPreviewBounds();
  }
  function startPushupCamera() {
    pushupPreviewSuppressed = false;
    pushupPreviewStartPending = true;
    syncPushupPreviewBounds(); // Prepare the native surface before capture starts.
    if (!callNative('startPushupCamera')) hidePushupPreview();
  }
  function clearPushupCountFeedback() {
    pushupCountedUntil = 0;
    clearTimeout(pushupCountedTimer);
  }
  function resetPushupPosition() {
    if (!native || typeof window.Hunter.resetPushupCalibration !== 'function' || pushupResetPending || state.pushupCamera.status !== 'tracking' || pendingSave) return;
    clearPushupCountFeedback();
    pushupResetPending = true;
    if (!callNative('resetPushupCalibration')) pushupResetPending = false;
    clearTimeout(pushupResetTimer);
    pushupResetTimer = setTimeout(() => { pushupResetPending = false; updatePushupCamera(); }, 2000);
    updatePushupCamera();
  }
  function updatePushupPhase(s, count, active, starting) {
    if (!active || !s.tracking || document.hidden || pushupPreviewSuppressed || pushupFeedbackCount === null || count < pushupFeedbackCount) clearPushupCountFeedback();
    else if (count > pushupFeedbackCount) {
      pushupCountedUntil = Date.now() + 1500;
      clearTimeout(pushupCountedTimer);
      pushupCountedTimer = setTimeout(updatePushupCamera, 1500);
    }
    pushupFeedbackCount = count;
    const counted = active && s.tracking && !document.hidden && !pushupPreviewSuppressed && Date.now() < pushupCountedUntil;
    let phase = 'idle', label = 'Kamera aus', detail = 'Starte, wenn du bereit bist.';
    if (s.status === 'paused' || active && pushupPreviewSuppressed) { label = 'Pausiert'; detail = 'Zum Weiterzählen bewusst fortsetzen.'; }
    else if (s.status === 'error') { phase = 'setup'; label = 'Kamera prüfen'; detail = 'Folge dem Hinweis oben.'; }
    else if (starting) { phase = 'setup'; label = 'Kamera startet'; detail = 'Handy stabil stehen lassen.'; }
    else if (pushupResetPending) { phase = 'setup'; label = 'Oben neu erkennen'; detail = 'Kurz oben mit gestreckten Armen halten.'; }
    else if (active && !s.tracking) { phase = 'setup'; label = s.bodyDetected ? 'Oben finden' : 'Position prüfen'; detail = s.bodyDetected ? 'Kurz oben mit gestreckten Armen halten.' : 'Kopf, Schultern, Ellenbogen und Hände sichtbar halten.'; }
    else if (counted && ['upper','standing'].includes(s.phase)) { phase = 'counted'; label = 'Gezählt ✓'; detail = 'Wiederholung erfasst. Bereit für die nächste.'; }
    else if (active) {
      const steps = {
        standing:['standing','Bereit · oben','Jetzt kontrolliert absenken.'],
        upper:['standing','Bereit · oben','Jetzt kontrolliert absenken.'],
        lowering:['lowering','Absenken','Bewegung erkannt. Unten noch nicht bestätigt.'],
        down:['down','Unten erkannt','Jetzt wieder hochdrücken.'],
        rising:['rising','Hochkommen','Bewegung erkannt. Drücke dich weiter hoch.']
      };
      [phase,label,detail] = steps[s.phase] || ['setup','Oben finden','Kurz oben mit gestreckten Armen halten.'];
    }
    const output = $('#pushup-camera-phase');
    output.classList.add('pushup-progress');
    const key = JSON.stringify([phase,label,detail]);
    if (output.dataset.key !== key) {
      output.dataset.key = key;
      output.innerHTML = `<span class="pushup-phase-label" data-phase="${phase}">${label}</span><span class="pushup-phase-detail">${detail}</span>`;
    }
    $('#pushup-camera-count').dataset.counted = String(counted);
  }
  function syncPushupCameraScreen() {
    if (!native || typeof window.Hunter.setPushupCameraScreenActive !== 'function') return;
    const active = tab === 'pushup-camera' && !document.hidden;
    if (active !== pushupCameraScreenActive && callNative('setPushupCameraScreenActive', active)) pushupCameraScreenActive = active;
  }
  function syncStrengthTouchMode() {
    const enabled = noseMode && !document.hidden && tab === 'strength';
    if (strengthTouchMode === enabled || !native || typeof window.Hunter.setStrengthTouchMode !== 'function') return;
    if (callNative('setStrengthTouchMode', enabled)) strengthTouchMode = enabled;
  }
  function stopNoseMode() {
    noseMode = false;
    if (disposeNoseTouch) disposeNoseTouch();
    disposeNoseTouch = null;
    $('#modal-layer').classList.remove('nose-mode');
    syncStrengthTouchMode();
  }
  function showModal(html) { if (tab === 'squats') { hideSquatPreview(); if (['starting','tracking'].includes(state.squats.status)) callNative('pauseSquats'); } if (tab === 'pushup-camera') { hidePushupPreview(); callNative('pausePushupCamera'); } stopNoseMode(); stopGiftAnimation(); modalFocus = document.activeElement; $('#modal').innerHTML = html; $('#modal-layer').hidden = false; $('#modal').focus(); document.body.style.overflow = 'hidden'; scheduleSquatPreviewBounds();schedulePushupPreviewBounds(); }
  function closeModal() {
    stopNoseMode();
    stopGiftAnimation();
    if (pendingGift) {
      pendingGift.present = false;
      if (pendingGift.stage === 'preload') { clearTimeout(giftRequestTimer); pendingGift = null; refreshGiftArea(); }
    }
    $('#modal-layer').hidden = true; $('#modal').innerHTML = ''; document.body.style.overflow = '';
    if (modalFocus?.isConnected) modalFocus.focus();
    scheduleSquatPreviewBounds();schedulePushupPreviewBounds();
  }
  function modalHeader(title) { return `<div class="row"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close" aria-label="Schließen">${icon('close')}</button></div>`; }
  function touchRep(surface) {
    if (draft >= 10000) return;
    setDraft(draft + 1);
    surface.classList.remove('rep-registered');
    void surface.offsetWidth;
    surface.classList.add('rep-registered');
    if (native && typeof window.Hunter.feedbackRepTouch === 'function') {
      try { window.Hunter.feedbackRepTouch(); } catch (_) { /* Feedback is optional. */ }
    }
  }
  function bindCounterTouch() {
    const surface = $('.counter-tap');
    if (!surface || !window.RepTouch) return;
    disposeCounterTouch = window.RepTouch.bind(surface, {
      canCount: () => tab === 'strength' && !document.hidden && $('#modal-layer').hidden,
      onRep: () => touchRep(surface),
    });
  }
  function updateNoseCounter() {
    if (!noseMode || !$('#nose-rep-count')) return;
    $('#nose-rep-count').textContent = num(draft);
    $('#nose-rep-count').dataset.large = String(draft >= 1000);
    $('#nose-xp').textContent = `Dieser Satz bringt dir +${num(draft * 2)} XP`;
    $('[data-action="nose-minus"]').disabled = draft < 1;
  }
  function openNoseMode() {
    if (tab !== 'strength') return;
    showModal(`${modalHeader('Mit Nase zählen')}<p class="nose-intro">Berühre die große Fläche, dann hebe kurz ab.</p><button id="nose-touch-pad" class="nose-touch-pad" data-rep-surface aria-label="Eine Push Ups zählen"><span class="kicker">DEIN AKTUELLER SATZ</span><strong id="nose-rep-count" aria-live="polite" aria-atomic="true">${num(draft)}</strong><span class="nose-unit">WIEDERHOLUNGEN</span><span class="nose-touch-hint">DIE GANZE FLÄCHE ZÄHLT</span></button><p id="nose-xp" class="nose-xp"></p><div class="button-pair nose-controls"><button class="secondary-button" data-action="nose-minus" aria-label="Eine Wiederholung korrigieren">${icon('minus')} Korrigieren</button><button class="primary-button" data-action="nose-done">Fertig ${icon('check')}</button></div><p class="nose-save-note">Danach deinen Satz mit „Satz speichern“ sichern.</p>`);
    noseMode = true;
    $('#modal-layer').classList.add('nose-mode');
    updateNoseCounter(); syncStrengthTouchMode();
    const surface = $('#nose-touch-pad');
    if (window.RepTouch) disposeNoseTouch = window.RepTouch.bind(surface, {
      canCount: () => noseMode && tab === 'strength' && !document.hidden && !$('#modal-layer').hidden,
      onRep: () => touchRep(surface),
    });
  }
  const cardNames = { strength: 'Kraftkarte', crown: 'Kronenkarte', energy: 'Energiekarte' };
  function giftCard(gift) { const card = gift?.cards?.[0]; return Object.hasOwn(cardNames, card) ? card : 'strength'; }
  function localDayKey(day = new Date()) { return `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`; }
  function todaysGift() { return state.gifts.find(gift => gift.day === localDayKey()); }
  function giftReady() { return !todaysGift() && totals().todayReps >= goals.reps; }
  function sprite(type, frame = 0, cls = '') { return window.RewardAnimation ? window.RewardAnimation.frameMarkup(type, frame, cls) : `<span class="gift-fallback">${icon('trophy')}</span>`; }
  function dailyGiftMarkup() {
    const claimed = todaysGift(), ready = giftReady(), remaining = Math.max(0, goals.reps - totals().todayReps);
    const status = claimed ? 'claimed' : ready ? 'ready' : 'locked';
    return `<article class="daily-gift ${status}" aria-label="Tägliches Push Up-Geschenk"><div class="gift-overview"><div class="gift-thumb">${sprite(claimed ? giftCard(claimed) : 'gift', claimed ? 5 : 0)}</div><div class="gift-copy"><div class="kicker">PUSH UP-BELOHNUNG</div><h3>${claimed ? 'Heute abgeholt' : 'Dein tägliches Geschenk'}</h3><p>${claimed ? `${cardNames[giftCard(claimed)]} · +${num(claimed.xp)} XP` : 'Eine zufällige Karte + 50 Bonus-XP'}</p><span class="gift-status">${claimed ? 'Morgen wartet ein neues Geschenk.' : ready ? 'Quest geschafft. Deine Belohnung wartet!' : `Noch ${num(remaining)} gespeicherte Push Ups.`}</span></div></div><button class="quest-action" data-action="claim-gift" ${!ready || pendingGift || pendingSave ? 'disabled' : ''}>${claimed ? 'Bereits abgeholt' : pendingGift ? 'Wird abgeholt …' : ready ? 'Geschenk abholen' : 'Push Up-Quest abschließen'}${icon(claimed ? 'check' : 'arrow')}</button>${claimed ? '<button class="text-button gift-replay" data-action="replay-gift">Animation ansehen</button>' : ''}</article>`;
  }
  function refreshGiftArea() { const area = $('.daily-gift'); if (area) area.outerHTML = dailyGiftMarkup(); }
  function replayDailyGift() {
    const gift = todaysGift();
    if (!gift || pendingGift || pendingSave) return;
    // This is a presentation of an existing reward, never a new claim or award.
    presentGift(gift, totals().xp, { replay: true });
  }
  function collectionMarkup() {
    if (!state.gifts.length) return '';
    return `<section class="gift-collection" aria-label="Deine Kartensammlung"><div class="section-heading"><h2>Deine Karten</h2><span>${num(state.gifts.length)} GESAMMELT</span></div><div class="collection-grid">${Object.keys(cardNames).map(card => {const count=state.gifts.filter(g=>giftCard(g)===card).length;return `<div class="collection-card ${count ? '' : 'undiscovered'}">${sprite(card,5)}<strong>${cardNames[card]}</strong><span>${count ? `${num(count)} × gesammelt` : 'Noch nicht gefunden'}</span></div>`;}).join('')}</div><p class="collection-note">Alle drei Karten sind gleich selten. Jedes Geschenk bringt 50 Bonus-XP.</p></section>`;
  }
  function showGiftResult(gift, beforeXP, animationFailed = false, replay = false) {
    const card = giftCard(gift), before = progress(beforeXP), after = progress(totals().xp);
    showModal(`<div class="gift-result summary"><div class="kicker" style="justify-content:center;margin:6px 0 13px">DEINE TAGESBELOHNUNG</div><h2 id="modal-title">${cardNames[card]} erhalten!</h2><div class="gift-result-card">${sprite(card,5)}</div><div class="summary-xp">+${num(gift.xp)} <span>BONUS-XP</span></div><p class="summary-stat">${replay ? 'Bereits abgeholt · keine weiteren XP.' : after.level > before.level ? `Level ${after.level} erreicht!` : 'Deine Belohnung ist gespeichert.'}</p><p>${animationFailed ? 'Die Animation konnte nicht geladen werden. Deine Karte und XP sind trotzdem sicher gespeichert.' : 'Die Karte findest du in deiner Chronik.<br>Morgen wartet ein neues Geschenk.'}</p><button class="primary-button" data-action="close">Belohnung erhalten ${icon('check')}</button></div>`);
  }
  function presentGift(gift, beforeXP, { replay = false } = {}) {
    showModal(`${modalHeader(replay ? 'Geschenk noch einmal ansehen' : 'Dein Geschenk öffnet sich')}<p class="gift-stage-label" id="gift-stage-label">Deine Kraft-Quest hat sich gelohnt.</p><div id="gift-frame" class="gift-animation-stage"></div><p class="gift-saved-note">Karte und +${num(gift.xp)} XP sind bereits gespeichert.</p><button class="text-button gift-skip" data-action="gift-skip">Animation überspringen</button>`);
    const generation = giftPlaybackGeneration;
    const stillOpen = () => generation === giftPlaybackGeneration && !!$('#gift-frame');
    const finish = failed => { if (stillOpen()) showGiftResult(gift, beforeXP, failed, replay); };
    $('#modal').querySelector('[data-action="gift-skip"]').addEventListener('click', () => finish(false));
    if (!window.RewardAnimation) { finish(true); return; }
    cancelGiftAnimation = window.RewardAnimation.play($('#gift-frame'), giftCard(gift), {
      onStage: stage => { if (stillOpen()) $('#gift-stage-label').textContent = stage === 'gift' ? 'Das Geschenk öffnet sich …' : 'Deine zufällige Karte erscheint …'; },
      onComplete: () => finish(false),
      onError: () => finish(true),
    });
  }
  function claimDailyGift() {
    if (pendingGift || pendingSave || busy || !giftReady()) return;
    if (!native) { toast('Geschenke kannst du in der iPhone-App abholen.'); return; }
    const request = { id: `gift-${Date.now()}-${++giftRequestSequence}`, ids: new Set(state.gifts.map(g => g.id)), present: true, stage: 'preload', beforeXP: totals().xp };
    pendingGift = request;
    refreshGiftArea();
    showModal(`${modalHeader('Geschenk abholen')}<div id="gift-claim-wait"><div class="gift-result-card">${sprite('gift')}</div><p>Dein Geschenk wird vorbereitet …</p></div>`);
    const failed = message => {
      if (pendingGift !== request) return;
      const present = request.present;
      pendingGift = null; busy = false; clearTimeout(giftRequestTimer);
      if (present && $('#gift-claim-wait')) closeModal();
      refreshGiftArea(); toast(message);
    };
    giftRequestTimer = setTimeout(() => failed('Noch keine Bestätigung. Bitte versuche die Abholung erneut.'), 8000);
    // Preload every possible card so a random result can animate without a gap.
    const prepare = window.RewardAnimation ? Promise.all(Object.keys(cardNames).map(card => window.RewardAnimation.preload(card))) : Promise.reject(new Error('Animation missing'));
    prepare.then(() => {
      if (pendingGift !== request || !request.present) return;
      request.stage = 'claim';
      if (!callNative('claimGift', goals.reps, request.id)) failed('Das Geschenk konnte nicht abgeholt werden. Bitte erneut versuchen.');
    }).catch(() => failed('Die Geschenk-Bilder konnten nicht geladen werden. Bitte erneut versuchen.'));
  }
  function settings() {
    showModal(`${modalHeader('Deine Tagesquests')}<p>Wähle Ziele, die zu dir passen. Jeder neue Tag beginnt mit einer neuen Quest.</p><form id="goals-form"><label for="goal-run">Laufziel in Kilometern</label><input id="goal-run" type="number" inputmode="decimal" min="0.1" max="100" step="0.1" required value="${goals.meters / 1000}"><label for="goal-reps">Push Ups pro Tag</label><input id="goal-reps" type="number" inputmode="numeric" min="1" max="1000" step="1" required value="${goals.reps}"><label for="goal-squats">Squats pro Tag</label><input id="goal-squats" type="number" inputmode="numeric" min="1" max="1000" step="1" required value="${goals.squats}"><button class="primary-button" type="submit">Ziele speichern ${icon('check')}</button></form><p class="privacy">${icon('shield')} <strong>Dein Training bleibt lokal.</strong><br>Trainings, Laufstrecken, deine Bio und deine private Freundesliste werden auf diesem Gerät gespeichert. Nur wenn du bei der Hunter-Rangliste mitmachst, werden dein Hunter-Name und zusammengefasste Trainings-XP über Firebase mit allen Teilnehmern der gemeinsamen Rangliste geteilt. Keine Laufstrecken oder Kamerabilder. Die Körpererkennung nutzt Apple Vision direkt auf deinem iPhone. Eine Deinstallation kann deine lokalen Trainings löschen. Sichere wichtige Daten vorher.</p><p class="modal-footnote">Shadow Quest · iOS-Port 1.10.0<br>10 gelaufene Meter = 1 XP · 1 Push Up / Squat = 2 XP<br>Tägliches Push Up-Geschenk: 1 Zufallskarte + 50 XP<br>Ränge: E ab Level 1 · D ab 10 · C ab 24 · B ab 44 · A ab 70 · S ab 100</p>`);
    $('#goals-form').addEventListener('submit', e => { e.preventDefault(); const km = Number($('#goal-run').value); const reps = Number($('#goal-reps').value), squats = Number($('#goal-squats').value); if (!(km >= .1 && km <= 100 && Number.isInteger(reps) && reps >= 1 && reps <= 1000 && Number.isInteger(squats) && squats >= 1 && squats <= 1000)) return; goals = { meters: Math.round(km * 1000), reps, squats }; saveLocal('sq.goals', goals); closeModal(); render(); toast('Deine Tagesziele wurden gespeichert.'); });
  }
  function renderHome() {
    const t = totals(), p = progress(t.xp), done = Number(t.todayMeters >= goals.meters) + Number(t.todayReps >= goals.reps) + Number(t.todaySquats >= goals.squats);
    const active = state.run.status !== 'idle';
    $('#main').innerHTML = `<section class="training-hero" aria-label="Dein Training beginnt hier"><img class="training-hero-image" src="images/shadow-training.png" alt="Anime-Athlet beim Krafttraining vor einer violett leuchtenden Schattenwelt" width="941" height="1672" fetchpriority="high"><div class="training-hero-copy"><div class="kicker">DAS NÄCHSTE LEVEL WARTET</div><h1>Werde jeden Tag<br><span class="violet">stärker.</span></h1></div></section>${!native ? '<div class="notice">App-Vorschau · GPS und Speichern funktionieren in der installierten App.</div>' : ''}<section class="level-card" aria-label="Dein Level"><div class="hero-rune">${rune.replaceAll('rune-gradient','hero-gradient')}</div><div class="content"><div class="row"><span class="level-label">DEIN HUNTER-STATUS</span><span class="pill">RANG ${p.rank}</span></div><div class="level-number"><span>LV.</span><strong>${String(p.level).padStart(2,'0')}</strong></div><div class="rank-label">${p.level === 1 ? 'Deine Reise beginnt hier.' : 'Jede Wiederholung zählt.'}</div><div class="xp-block"><div class="xp-text"><span><strong>${num(p.current)}</strong> / ${num(p.next)} XP</span><span>LEVEL ${p.level + 1} ${icon('arrow').replace('<svg','<svg style="display:inline;width:10px;height:10px;vertical-align:middle"')}</span></div><div class="progress"><span style="width:${100*p.current/p.next}%"></span></div></div></div></section><button class="leaderboard-entry" data-go="leaderboard"><span class="quest-icon">${icon('trophy')}</span><span><strong>Hunter-Rangliste</strong><small>Alle Hunter. Eure Wochen- und Gesamt-XP.</small></span>${icon('arrow')}</button><div class="section-heading"><h2>Deine Tagesquests</h2><span>${done} / 3 ERLEDIGT</span></div><div class="stack">${questCard('run', 'Lauf deinen Weg', 'Ausdauer · GPS-Tracking', t.todayMeters, goals.meters, `${distance(t.todayMeters)} <span>/ ${distance(goals.meters)}</span>`, '1 XP / 10 m', active ? 'Zum aktiven Lauf' : 'Lauf starten')}${questCard('strength', 'Überwinde dein Limit', 'Kraft · Push Ups', t.todayReps, goals.reps, `${num(t.todayReps)} <span>/ ${num(goals.reps)} Wdh.</span>`, '2 XP / Wdh.', 'Training starten')}${questCard('squats', 'Fest auf deinen Beinen', 'Kraft · Kamera-Squats', t.todaySquats, goals.squats, `${num(t.todaySquats)} <span>/ ${num(goals.squats)} Wdh.</span>`, '2 XP / Wdh.', 'Squats starten')}</div>${dailyGiftMarkup()}<div class="stats-strip"><div class="stat"><strong>${streak()}</strong><span>Tage in Folge</span></div><div class="stat"><strong>${num(t.sessions)}</strong><span>Trainings</span></div><div class="stat"><strong>${num(t.xp)}</strong><span>Gesamt-XP</span></div></div><div class="system-note">${icon('shield')} TRAININGS LOKAL · RANGLISTE OPTIONAL</div>`;
  }
  function questCard(type, title, subtitle, current, goal, label, reward, action) { const done = current >= goal; return `<article class="quest-card ${type}"><div class="row"><div class="quest-title"><div class="quest-icon ${type === 'run' ? 'cyan' : ''}">${icon(type)}</div><div><h3>${title}</h3><p>${subtitle}</p></div></div><span class="reward">${done ? 'ERLEDIGT ✓' : reward}</span></div><div class="quest-progress"><div class="row"><strong>${label}</strong><span>${Math.min(100,Math.floor(current/goal*100))}%</span></div><div class="progress"><span style="width:${Math.min(100,current/goal*100)}%"></span></div></div><button class="quest-action" data-go="${type}">${action}${icon('arrow')}</button></article>`; }
  function runActions() { const s = state.run.status; return s === 'idle' ? `<button class="primary-button" data-action="start-run">${icon('play')} GPS-Lauf starten</button>` : `<div class="button-pair"><button class="secondary-button" data-action="${s === 'paused' ? 'resume-run' : 'pause-run'}">${icon(s === 'paused' ? 'play' : 'pause')}${s === 'paused' ? 'Fortsetzen' : 'Pause'}</button><button class="primary-button" data-action="finish-run">${icon('stop')} Beenden</button></div><button class="text-button" style="display:block;margin:5px auto 0" data-action="discard-run">Lauf verwerfen</button>`; }
  function renderRun() { $('#main').innerHTML = `<div class="page-heading"><div class="kicker">AUSDAUER-QUEST</div><h1>Dein Weg.<br><span class="cyan">Dein Tempo.</span></h1><p>Rausgehen. Loslaufen. Erfahrung sammeln.</p></div><section class="panel tracking-card"><div class="row"><span class="tracking-status" id="run-status"></span><span class="pill green">GPS-TRACKING</span></div><div class="distance"><span id="run-distance">0,00</span><small>km</small></div><div class="distance-caption">ZURÜCKGELEGTE DISTANZ</div><div class="run-metrics"><div class="stat"><strong id="run-time">00:00</strong><span>DAUER</span></div><div class="stat"><strong id="run-pace">–:––</strong><span>Ø MIN / KM</span></div></div><div class="route-view"><canvas id="route-canvas" aria-label="Skizze deiner GPS-Laufstrecke"></canvas><div class="route-placeholder" id="route-placeholder">${icon('pin')}<span id="route-empty-text"></span></div><span class="route-label">DEINE ROUTE · OHNE ONLINE-KARTE</span></div></section><div class="gps-line"><span class="gps-copy">${icon('gps')}<span id="gps-status"></span></span><span id="gps-accuracy"></span></div><div id="run-error"></div><div id="run-actions">${runActions()}</div><p class="hint">${native ? 'Erlaube beim Start den genauen Standort.<br>Die Aufzeichnung läuft auch bei gesperrtem Bildschirm.' : 'Das echte GPS-Tracking ist in der iPhone-App verfügbar.'}</p><div class="info-card">${icon('bolt')}<div><strong>Jeder Schritt bringt dich weiter.</strong>Pro 10 erfasste Meter erhältst du 1 XP. Am besten funktioniert GPS draußen mit freier Sicht zum Himmel.</div></div>`; updateRun(); }
  function updateRun() { if (tab !== 'run' || !$('#run-status')) return; const r = state.run; $('#run-status').innerHTML = `<span class="status-dot" style="background:${r.status === 'running' ? 'var(--green)' : 'var(--muted)'}"></span>${r.status === 'running' ? 'LAUF AKTIV' : r.status === 'paused' ? 'LAUF PAUSIERT' : 'BEREIT, WENN DU ES BIST'}`; $('#run-distance').textContent = num(r.distanceMeters/1000,2); $('#run-time').textContent = duration(r.elapsedSeconds); $('#run-pace').textContent = pace(r); $('#gps-status').textContent = r.gpsStatus || 'GPS bereit'; $('#gps-accuracy').textContent = r.accuracyMeters != null && r.accuracyMeters > 0 ? `± ${num(r.accuracyMeters)} m` : ''; $('#route-empty-text').textContent = r.status === 'idle' ? 'Deine Route entsteht beim Laufen.' : 'Warte auf deine erste GPS-Position.'; $('#run-error').innerHTML = state.error ? `<div class="notice error-notice">${esc(state.error)} <button class="text-button" data-action="location-settings">Standort-Einstellungen</button></div>` : ''; drawRoute(); }
  function drawRoute() { const canvas = $('#route-canvas'); if (!canvas) return; const pts = (state.run.points || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)); $('#route-placeholder').hidden = pts.length > 0; $('#route-placeholder').style.display = pts.length ? 'none' : 'flex'; const w = canvas.clientWidth || 300, h = canvas.clientHeight || 190, dpr = Math.min(window.devicePixelRatio || 1, 3); canvas.width = w*dpr; canvas.height = h*dpr; const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h); if (!pts.length) return; const refLat = pts[0].lat; const xs = pts.map(p => (p.lon-pts[0].lon)*Math.cos(refLat*Math.PI/180)); const ys = pts.map(p => p.lat-pts[0].lat); const minX = Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys); const scale=Math.min((w-60)/Math.max(maxX-minX,.0002),(h-65)/Math.max(maxY-minY,.0002)); const xy= i => [w/2+(xs[i]-(minX+maxX)/2)*scale,(h-18)/2-(ys[i]-(minY+maxY)/2)*scale]; ctx.strokeStyle='#76e7ef';ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowColor='#76e7ef66';ctx.shadowBlur=10;ctx.beginPath();pts.forEach((p,i)=>{const [x,y]=xy(i); i && !p.segmentStart ? ctx.lineTo(x,y) : ctx.moveTo(x,y);});ctx.stroke();ctx.shadowBlur=0;for(const [i,c] of [[0,'#a890ff'],[pts.length-1,'#76e7ef']]){const[x,y]=xy(i);ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#111523';ctx.stroke();} }
  function renderStrength() { $('#main').innerHTML = `<div class="page-heading"><div class="kicker">KRAFT-QUEST</div><h1>Eine Wiederholung<br><span class="violet">stärker.</span></h1><p>Deine Push Ups. Dein persönlicher Fortschritt.</p></div><button class="primary-button pushup-camera-launch" data-go="pushup-camera">${icon('camera')} Mit Kamera zählen ${icon('arrow')}</button><p class="pushup-camera-launch-note">Live-Kamerabild · automatische Wiederholungszählung<span id="pushup-camera-draft-note"></span></p><button class="secondary-button nose-launch" data-action="nose-mode">${icon('plus')} Mit Nase zählen · große Fläche</button><section class="panel counter-card"><div class="counter-head"><span>DEIN AKTUELLER SATZ</span><span class="pill">MANUELL</span></div><div class="counter-wrap"><svg class="counter-ring" viewBox="0 0 230 230" aria-hidden="true"><circle class="ring-bg" cx="115" cy="115" r="111"/><circle class="ring-fill" id="counter-ring-fill" cx="115" cy="115" r="111" stroke-dasharray="697.43" stroke-dashoffset="697.43"/></svg><button class="counter-tap" data-rep-surface data-action="add-rep" aria-label="Eine Push Ups hinzufügen"><strong id="rep-count">${draft}</strong><span>WIEDERHOLUNGEN</span><span class="plus">+</span></button></div><p class="counter-goal" id="counter-goal"></p><div class="counter-controls"><button class="icon-button" data-action="subtract-rep" aria-label="Eine Push Ups abziehen">${icon('minus')}</button><button class="text-button" data-action="edit-reps">Anzahl eingeben</button><button class="icon-button" data-action="add-rep" aria-label="Eine Push Ups hinzufügen">${icon('plus')}</button></div></section><div class="xp-preview">${icon('bolt')} Dieser Satz bringt dir <span id="rep-xp"></span></div><button class="primary-button" id="save-reps" data-action="save-reps">Satz speichern ${icon('check')}</button><p class="hint">Berühre die Zählfläche oder nutze „Mit Nase zählen“.<br>Du kannst deinen fertigen Satz auch direkt eintragen.</p>${dailyGiftMarkup()}<div class="info-card">${icon('strength')}<div><strong>Dein Tempo zählt.</strong>Lege das Handy stabil ab. Achte auf eine saubere Ausführung und gönn dir zwischen den Sätzen eine Pause.</div></div>`; updateStrength(); bindCounterTouch(); }
  function updateStrength() {
    if (tab !== 'strength' || !$('#rep-count')) return;
    const today = totals().todayReps;
    $('#rep-count').textContent = num(draft);
    $('#rep-count').dataset.large = String(draft >= 1000);
    $('#counter-ring-fill').style.strokeDashoffset = String(697.43*(1-Math.min(1,draft/goals.reps)));
    $('#counter-goal').innerHTML = `Heute gespeichert: <span class="violet">${num(today)}</span> / ${num(goals.reps)} Wiederholungen`;
    $('#rep-xp').textContent = `+${num(draft*2)} XP`;
    if ($('#pushup-camera-draft-note')) $('#pushup-camera-draft-note').textContent = state.pushupCameraDraft > 0 ? ` · ${num(state.pushupCameraDraft)} ungespeichert` : '';
    $('#save-reps').disabled = draft < 1 || !!pendingSave || !!pendingGift;
    $('[data-action="subtract-rep"]').disabled = draft < 1;
    refreshGiftArea(); updateNoseCounter();
  }
  function setDraft(n) { draft = Math.max(0,Math.min(10000,Math.floor(n))); saveLocal('sq.pushups',draft); updateStrength(); }
  function editReps() { showModal(`${modalHeader('Dein Satz')}<p>Wie viele Push Ups hast du geschafft?</p><form id="reps-form"><label for="manual-reps">Wiederholungen</label><input id="manual-reps" type="number" inputmode="numeric" min="0" max="10000" step="1" required value="${draft}"><button type="submit" class="primary-button">Anzahl übernehmen ${icon('check')}</button></form>`); $('#reps-form').addEventListener('submit',e=>{e.preventDefault();const n=Number($('#manual-reps').value);if(Number.isInteger(n)&&n>=0&&n<=10000){setDraft(n);closeModal();}}); }
  function renderHistory() {
    const t = totals();
    const entries = [...state.workouts, ...state.gifts.map(g => ({...g, type: 'gift'}))].sort((a,b) => b.timestamp-a.timestamp);
    let last = '';
    const history = entries.map(w => {
      const day = new Date(w.timestamp).toLocaleDateString('de-DE',{day:'numeric',month:'long',year:'numeric'});
      const heading = day !== last ? `<div class="day-label">${sameDay(w.timestamp)?'HEUTE · ':''}${esc(day)}</div>` : '';
      last = day;
      const gift = w.type === 'gift';
      const title = gift ? 'Tagesgeschenk abgeholt' : w.type === 'run' ? 'Lauf abgeschlossen' : w.type === 'squats' ? 'Squats geschafft' : 'Push Ups geschafft';
      const detail = gift ? cardNames[giftCard(w)] : w.type === 'run' ? `${distance(w.distanceMeters)} · ${duration(w.elapsedSeconds)} · ${pace(w)} min/km` : `${num(w.reps)} Wiederholungen`;
      return `${heading}<article class="history-card ${gift?'gift-history-card':''}" style="margin-bottom:10px"><div class="${gift?'gift-history-thumb':`quest-icon ${w.type==='run'?'cyan':''}`}">${gift?sprite(giftCard(w),5):icon(w.type==='run'?'run':w.type==='squats'?'squats':'strength')}</div><div class="history-body"><div class="row"><h3>${title}</h3><span class="reward">+${num(w.xp)} XP</span></div><p>${detail}</p><small>${new Date(w.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr · Gespeichert auf deinem Gerät</small></div></article>`;
    }).join('');
    $('#main').innerHTML = `<div class="page-heading"><div class="kicker">DEINE ENTWICKLUNG</div><h1>Jede Quest<br><span class="violet">zählt.</span></h1><p>Hier wird aus Training deine Geschichte.</p></div><div class="total-card"><div class="panel">${icon('run')}<strong>${num(t.meters/1000,2)} <small>km</small></strong><span>INSGESAMT GELAUFEN</span></div><div class="panel">${icon('strength')}<strong>${num(t.reps)}</strong><span>PUSH UPS GESAMT</span></div><div class="panel squat-total">${icon('squats')}<strong>${num(t.squats)}</strong><span>SQUATS GESAMT</span></div></div>${collectionMarkup()}${entries.length?history: `<section class="panel empty-state"><div class="empty-icon">${icon('history')}</div><h2>Dein erstes Kapitel wartet.</h2><p>Speichere deinen ersten Lauf oder Satz.<br>Deine Erfolge erscheinen dann hier.</p><button class="primary-button" data-go="home">Zur ersten Quest ${icon('arrow')}</button></section>`}`;
  }
  function renderTraining() {
    // The supplied artwork remains intact; only its old baked exercise title is covered.
    const pushupTitleOverlay = `<g class="training-title-replacement"><rect x="94" y="325" width="382" height="84" rx="12" fill="#170910" stroke="#ff429230" stroke-width="1.2"/><text x="108" y="386" fill="#fff6fc" font-family="Arial, sans-serif" font-size="64" font-weight="700">Push Ups</text></g>`;
    const t = totals();
    const choices = [
      {type:'run', title:'Laufen', tag:'AUSDAUER', copy:'Deine Strecke. Dein Tempo. Jeder Meter zählt.', detail:`${distance(t.todayMeters)} / ${distance(goals.meters)} heute`, badge:state.run.status !== 'idle' ? 'Lauf fortsetzen' : 'Mit GPS', image:'a', crop:'48 310 754 465', ratio:'754 / 465'},
      {type:'strength', title:'Push Ups', tag:'KRAFT', copy:'Mit Kamera, per Berührung oder direkt eintragen.', detail:`${num(t.todayReps)} / ${num(goals.reps)} heute`, badge:'Kamera & manuell', image:'b', crop:'56 163 742 442', ratio:'742 / 442'},
      {type:'squats', title:'Squats', tag:'KAMERA-TRAINING', copy:'Kniebeugen automatisch zählen. Mit Live-Kamerabild.', detail:`${num(t.todaySquats)} / ${num(goals.squats)} heute`, badge:'Mit Kamera', image:'b', crop:'56 746 742 499', ratio:'742 / 499'},
    ];
    $('#main').innerHTML = `<div class="page-heading"><div class="kicker">DEIN NÄCHSTER SCHRITT</div><h1>Wähle deine<br><span class="violet">Herausforderung.</span></h1><p>Alle Trainings. Ein Weg zu deinem nächsten Level.</p></div><div class="training-list">${choices.map(c => `<button class="training-choice ${c.type}" data-go="${c.type}" aria-label="${c.title}. ${c.copy} ${c.detail}. ${c.badge}."><span class="training-card-label">${c.tag} · ${c.title}. ${c.copy}</span><svg class="training-card-art" viewBox="${c.crop}" style="aspect-ratio:${c.ratio}" aria-hidden="true" focusable="false"><image href="images/training-cards-${c.image}.png" width="${c.image==='a'?851:852}" height="${c.image==='a'?1849:1847}"/>${c.type==='strength'?pushupTitleOverlay:''}</svg><span class="training-choice-bottom"><span>${c.detail}</span><span class="pill">${c.badge}</span></span></button>`).join('')}</div><p class="hint">Dein Training bleibt musikfrei.<br>Deine Fortschritte findest du in der Chronik.</p>`;
  }
  function cameraStatus(camera, pushup) {
    if (camera.status === 'starting') return 'KAMERA STARTET';
    if (camera.status === 'tracking') {
      if (camera.tracking) return pushup ? 'ARME ERKANNT' : 'BEINE ERKANNT';
      return camera.bodyDetected ? 'KÖRPER ERKANNT' : 'SUCHE KÖRPER';
    }
    return camera.status === 'paused' ? 'PAUSIERT · KAMERA AUS' : camera.status === 'error' ? 'KAMERA PRÜFEN' : 'KAMERA AUS';
  }
  function renderCameraScreen(pushup) {
    const id = pushup ? 'pushup-camera' : 'squat', layout = pushup ? 'pushup-camera' : 'squat-camera';
    const label = pushup ? 'Push Ups' : 'Squats';
    const save = pushup ? 'save-camera-pushups' : 'save-squats', discard = pushup ? 'discard-camera-pushups' : 'discard-squats';
    const heading = pushup ? 'Deine Bewegung.' : 'Eine Kniebeuge.';
    const setup = pushup
      ? '<strong>iPhone stabil seitlich aufstellen.</strong>Nutze das Hochformat. Schultern, Ellenbogen, Hände, Hüfte und Füße sollen im Kamerabild bleiben. Beginne oben mit gestreckten Armen, senke dich ab und drücke dich wieder hoch. Warte auf die Rückmeldung, dass deine Position erkannt wurde.'
      : '<strong>iPhone stabil seitlich aufstellen.</strong>Nutze das Hochformat. Hüfte, Knie und Füße müssen auch beim Absenken sichtbar bleiben. Beginne aufrecht, mache eine Kniebeuge und richte dich wieder auf. Warte auf die Rückmeldung, dass deine Position erkannt wurde.';
    const preview = `<div id="${pushup?'pushup':'squat'}-preview" class="squat-preview ${pushup?'pushup-preview':''}" role="img" aria-label="Live-Kamerabild für ${label}; erscheint nach dem Start"><div id="${id}-preview-placeholder" class="squat-preview-placeholder">${icon('camera')}<span id="${id}-preview-message">Dein Kamerabild erscheint nach dem Start.</span><small>${pushup?'Arme · Hüfte · Füße':'Hüfte · Knie · Füße'} sichtbar halten</small></div></div>`;
    const privacy = `Livebild nur während deiner ${label}.`;
    $('#main').innerHTML = `<div class="page-heading ${pushup?'pushup-camera-heading':'squat-heading'}"><div class="kicker">${label.toUpperCase()} · KAMERA</div><h1>${heading}<br><span class="violet">Dein Fortschritt.</span></h1><p>Kamera starten und loslegen.</p></div><div class="${layout}-layout"><section class="panel squat-panel ${layout}-panel camera-direct-panel"><div class="row"><span id="${id}-status" class="tracking-status"></span><span id="${pushup?'pushup-camera-label':'squat-camera-label'}" class="pill"></span></div>${preview}<div class="camera-direct-display"><div class="squat-counter"><strong id="${id}-count" aria-live="polite" aria-atomic="true">0</strong><span>${label.toUpperCase()}</span></div><h2 id="${id}-guidance" role="status" aria-live="polite" aria-atomic="true"></h2><p id="${id}-phase" class="camera-direct-phase"></p></div><p id="${id}-today" class="counter-goal"></p></section><div class="${layout}-controls"><div id="${id}-actions"></div><div class="xp-preview">${icon('bolt')} Dieser Satz: <span id="${id}-xp"></span></div><button class="primary-button" data-action="${save}">Satz speichern ${icon('check')}</button><button class="text-button squat-discard" data-action="${discard}">Satz verwerfen</button></div></div><div class="info-card ${pushup?'pushup-camera-setup':''}">${icon('camera')}<div>${setup}<br><br>Die erste vollständige Wiederholung zählt. Folge dem Hinweis über den Tasten, falls deine Position nicht erkannt wird.</div></div><p class="hint">${privacy} Die Bilder werden auf deinem Handy ausgewertet, nicht gespeichert oder hochgeladen.<br>Beim Verlassen oder Sperren des Displays geht die Kamera aus. Danach bewusst fortsetzen.</p>${!native?'<div class="notice">Die Kamera-Erkennung ist in der iPhone-App verfügbar.</div>':''}`;
    updateCameraScreen(pushup);
  }
  function updateCameraScreen(pushup) {
    const id = pushup ? 'pushup-camera' : 'squat', page = pushup ? 'pushup-camera' : 'squats';
    if (tab !== page || !$('#'+id+'-count')) return;
    const s = pushup ? state.pushupCamera : state.squats;
    const count = Math.max(0, Number(pushup ? state.pushupCameraDraft : state.squatDraft) || 0);
    const active = s.status === 'tracking' || s.status === 'starting', starting = s.status === 'starting';
    const waiting = !!pendingSave || (pushup && !!pendingGift);
    const el = part => $('#'+id+'-'+part);
    el('guidance').textContent = s.guidance || (pushup ? fallbackState().pushupCamera.guidance : fallbackState().squats.guidance);
    const phases = {upper:'Oben · bereit für die nächste Wiederholung', standing:'Oben · bereit für die nächste Wiederholung', lowering:pushup?'Kontrolliert absenken':'Bewegung · kontrolliert absenken', down:pushup?'Unten · jetzt wieder hochdrücken':'Unten · jetzt wieder aufrichten', rising:pushup?'Wieder in die obere Position':'Bewegung · wieder aufrichten'};
    el('phase').setAttribute('aria-live','polite'); el('phase').setAttribute('aria-atomic','true');
    if (pushup) updatePushupPhase(s,count,active,starting); else updateSquatPhase(s,count,active,starting);
    el('count').textContent = num(count);
    el('count').dataset.large = String(count >= 1000);
    el('status').innerHTML = `<span class="status-dot" style="background:${active && s.tracking?'var(--green)':active?'var(--cyan)':'var(--muted)'}"></span>${cameraStatus(s,pushup)}`;
    $('#'+(pushup?'pushup-camera-label':'squat-camera-label')).textContent = s.cameraLabel || (s.camera === 'back' ? 'Rückkamera' : 'Frontkamera');
    $('.'+(pushup?'pushup-camera-panel':'squat-camera-panel')).classList.toggle('position-ready', active && !!s.tracking);
    el('today').textContent = `Heute gespeichert: ${num(pushup ? totals().todayReps : totals().todaySquats)} / ${num(pushup ? goals.reps : goals.squats)} ${pushup?'Push Ups':'Squats'}`;
    el('xp').textContent = `+${num(count*2)} XP`;
    $('[data-action="'+(pushup?'save-camera-pushups':'save-squats')+'"]').disabled = count < 1 || waiting || !native;
    $('[data-action="'+(pushup?'discard-camera-pushups':'discard-squats')+'"]').disabled = count < 1 || waiting || !native;
    const resetPending = pushup ? pushupResetPending : squatResetPending;
    const canReset = native && typeof window.Hunter[pushup?'resetPushupCalibration':'resetSquatCalibration'] === 'function';
    const actions = el('actions'), key = JSON.stringify([s.status, count > 0, waiting, native, resetPending, canReset]);
    if (actions.dataset.key !== key) {
      actions.dataset.key = key;
      const toggle = pushup ? (active?'pause-pushup-camera':'start-pushup-camera') : (active?'pause-squats':'start-squats');
      actions.innerHTML = `<button class="${active?'secondary':'primary'}-button" data-action="${toggle}" ${waiting||!native?'disabled':''}>${icon(active?'pause':'camera')}${starting?'Start abbrechen':active?'Erkennung pausieren':s.status==='paused'?'Erkennung fortsetzen':'Kamera-Erkennung starten'}</button><div class="button-pair squat-tools"><button class="secondary-button" data-action="${pushup?'switch-pushup-camera':'switch-squat-camera'}" ${waiting||starting||!native?'disabled':''}>${icon('camera')} Kamera wechseln</button><button class="secondary-button" data-action="${pushup?'correct-camera-pushup':'correct-squat'}" ${count<1||waiting||!native?'disabled':''}>${icon('minus')} Korrigieren</button></div><button class="secondary-button squat-reset-position" data-action="${pushup?'recalibrate-pushups':'recalibrate-squats'}" ${!canReset||s.status!=='tracking'||waiting||resetPending?'disabled':''}>${icon('gps')} ${resetPending?'Obere Position halten …':'Position neu erkennen'}</button><p class="squat-reset-note">Wenn die Bewegung nicht zählt: ${pushup?'oben mit gestreckten Armen halten':'aufrecht stehen'} und Position neu erkennen. Dein Satz bleibt erhalten.</p>${s.status==='error'?'<button class="text-button camera-settings" data-action="camera-settings">Kamera-Berechtigung prüfen</button>':''}`;
    }
    {
      if (pushup) pushupPreviewStartPending = false; else squatPreviewStartPending = false;
      const preview = $('#'+(pushup?'pushup':'squat')+'-preview'), placeholder = el('preview-placeholder');
      const suppressed = pushup ? pushupPreviewSuppressed : squatPreviewSuppressed;
      const live = active && !!s.previewActive && !suppressed && !document.hidden && $('#modal-layer').hidden;
      preview.dataset.live = String(live);
      preview.setAttribute('aria-label', live ? `Live-Kamerabild für ${pushup?'Push Ups':'Squats'}` : 'Kamera derzeit ohne Livebild');
      placeholder.hidden = live;
      el('preview-message').textContent = live ? 'Live-Kamerabild aktiv.' : s.status === 'paused' || suppressed ? 'Kamera pausiert. Zum Fortsetzen starten.' : s.status === 'error' ? 'Kamera nicht verfügbar. Prüfe den Hinweis unten.' : active ? s.previewAvailable === false ? 'Kamerabild wird vorbereitet …' : 'Kamerabild wird geladen …' : native ? 'Dein Kamerabild erscheint nach dem Start.' : 'Das Livebild ist in der iPhone-App verfügbar.';
      scheduleSquatPreviewBounds();schedulePushupPreviewBounds();
    }
  }
  function renderSquats() { squatFeedbackCount = null; clearSquatCountFeedback(); renderCameraScreen(false); }
  function updateSquats() { updateCameraScreen(false); }
  function renderPushupCamera() { pushupFeedbackCount = null; clearPushupCountFeedback(); renderCameraScreen(true); }
  function updatePushupCamera() { updateCameraScreen(true); }
  function renderLeaderboard() {
    $('#main').innerHTML = `<button class="text-button training-back" data-go="home">${icon('arrow')} Zum System</button><div id="leaderboard-root"></div>`;
    window.LeaderboardUI.render($('#leaderboard-root'), state.leaderboard);
  }
  function profileStats() {
    const t = totals(), p = progress(t.xp), today = state.workouts.filter(w => sameDay(w.timestamp));
    return { lifetimeXp:t.xp, trainingXp:state.workouts.reduce((n,w)=>n+Math.max(0,Number(w.xp)||0),0),
      level:p.level, rank:p.rank, nextLevelXp:p.next, currentLevelXp:p.current,
      runMeters:t.meters, pushups:t.reps, squats:t.squats, sessions:t.sessions, streak:streak(),
      today:{runMeters:t.todayMeters,pushups:t.todayReps,squats:t.todaySquats,sessions:today.length,
        trainingXp:today.reduce((n,w)=>n+Math.max(0,Number(w.xp)||0),0)} };
  }
  function renderProfile() {
    const current = $('#profile-root');
    if (current) { window.HunterProfileUI.update(state.profile,state.leaderboard,profileStats()); return; }
    $('#main').innerHTML = `<button class="text-button training-back" data-go="${profileOrigin}">${icon('arrow')} Zurück</button><div id="profile-root"></div>`;
    window.HunterProfileUI.render($('#profile-root'),state.profile,state.leaderboard,profileStats(),{
      openLeaderboard:()=>navigate('leaderboard'), openGoals:settings
    });
  }
  function render() {
    if (window.LeaderboardUI) window.LeaderboardUI.close();
    if (window.HunterProfileUI && tab !== 'profile') window.HunterProfileUI.destroy();
    if(disposeCounterTouch)disposeCounterTouch();disposeCounterTouch=null;
    syncMenuMusic();syncSquatScreen();syncPushupCameraScreen();
    document.body.classList.toggle('pushup-camera-page', tab === 'pushup-camera');
    document.body.classList.toggle('squat-camera-page', tab === 'squats');
    if(tab==='home')renderHome();if(tab==='training')renderTraining();if(tab==='run')renderRun();if(tab==='strength')renderStrength();if(tab==='squats')renderSquats();if(tab==='pushup-camera')renderPushupCamera();if(tab==='history')renderHistory();if(tab==='leaderboard')renderLeaderboard();if(tab==='profile')renderProfile();
    if(tab==='pushup-camera') $('#main').insertAdjacentHTML('afterbegin',`<button class="text-button training-back" data-go="strength">${icon('arrow')} Push Ups</button>`);
    if(['run','strength','squats'].includes(tab)) $('#main').insertAdjacentHTML('afterbegin',`<button class="text-button training-back" data-go="training">${icon('arrow')} Alle Trainings</button>`);
    scheduleSquatPreviewBounds();schedulePushupPreviewBounds();
  }
  function navigate(next) {
    if(!['home','training','run','strength','squats','pushup-camera','history','leaderboard','profile'].includes(next)) return;
    if(noseMode)closeModal();
    const enteringProfile = next === 'profile' && tab !== 'profile';
    if (enteringProfile) profileOrigin = tab;
    if (tab === 'pushup-camera' && next !== 'pushup-camera') { hidePushupPreview(); pushupFeedbackCount = null; pushupResetPending = false; clearTimeout(pushupResetTimer); }
    if (next === 'pushup-camera' && tab !== 'pushup-camera') pushupPreviewSuppressed = false;
    if (tab === 'squats' && next !== 'squats') hideSquatPreview();
    if (tab === 'squats' && next !== 'squats') { clearSquatCountFeedback(); squatFeedbackCount = null; squatResetPending = false; clearTimeout(squatResetTimer); }
    if (next === 'squats' && tab !== 'squats') squatPreviewSuppressed = false;
    tab=next;
    const destination = tab === 'profile' ? profileOrigin : tab;
    const selected=['run','strength','squats','pushup-camera'].includes(destination)?'training':destination==='leaderboard'?'home':destination;
    $$('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.tab===selected);if(b.dataset.tab===selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    render();window.scrollTo(0,0);
    if (enteringProfile && native && state.leaderboard?.configured && state.leaderboard?.enabled && state.profile?.friends?.length && typeof window.Hunter.refreshProfileFriends === 'function') callNative('refreshProfileFriends');
  }
  function celebrate(workout, beforeXP) { const after=progress(totals().xp), before=progress(beforeXP); showModal(`<div class="summary"><div class="success-emblem">${icon(after.level>before.level?'trophy':'check')}</div><div class="kicker" style="justify-content:center;margin-bottom:12px">${after.level>before.level?'LEVEL AUFGESTIEGEN':'QUEST-FORTSCHRITT GESPEICHERT'}</div><h2 id="modal-title">${after.level>before.level?`Willkommen in Level ${after.level}.`:'Du bist stärker geworden.'}</h2><div class="summary-xp">+${num(workout.xp)} <span>XP</span></div><p class="summary-stat">${workout.type==='run'?`${distance(workout.distanceMeters)} · ${duration(workout.elapsedSeconds)}`:`${num(workout.reps)} ${workout.type==='squats'?'Squats':'Push Ups'}`}</p><p style="margin-top:12px">Ein Schritt weiter auf deinem eigenen Weg.</p>${workout.type==='pushups'&&giftReady()?'<button class="primary-button" data-action="claim-gift">Tagesgeschenk abholen</button>':''}<button class="primary-button" data-action="close">Weiter geht’s ${icon('arrow')}</button></div>`); }
  window.onNativeState = payload => {
    try {
      const incoming = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!incoming || !incoming.run || !Array.isArray(incoming.workouts)) return;
      const beforeXP = totals().xp, oldStatus = state.run.status;
      const oldWorkouts = JSON.stringify(state.workouts), oldGifts = JSON.stringify(state.gifts);
      state = {...fallbackState(), ...incoming, run:{...fallbackState().run, ...incoming.run}, squats:{...fallbackState().squats, ...incoming.squats}, pushupCamera:{...fallbackState().pushupCamera, ...incoming.pushupCamera}, gifts:Array.isArray(incoming.gifts)?incoming.gifts:[]};
      if (pushupResetPending && (!state.pushupCamera.tracking || !['starting','tracking'].includes(state.pushupCamera.status))) { pushupResetPending = false; clearTimeout(pushupResetTimer); }
      if (squatResetPending && (!state.squats.tracking || !['starting','tracking'].includes(state.squats.status))) { squatResetPending = false; clearTimeout(squatResetTimer); }
      syncMenuMusic();
      state.workouts.sort((a,b) => b.timestamp-a.timestamp);
      const changed = JSON.stringify(state.workouts)!==oldWorkouts || JSON.stringify(state.gifts)!==oldGifts;
      let saved = null, claimed = null, giftRequest = null;
      if (pendingSave) {
        saved = state.workouts.find(w => w.type===pendingSave.type && !pendingSave.ids.has(w.id));
        if (saved) {
          if (saved.type==='pushups' && pendingSave.method==='savePushups') setDraft(Math.max(0,draft-pendingSave.reps));
          pendingSave = null; busy = false;
        }
      }
      if (pendingGift && pendingGift.stage==='claim') {
        claimed = state.gifts.find(g => g.day===localDayKey() && !pendingGift.ids.has(g.id));
        if (claimed) { giftRequest = pendingGift; pendingGift = null; clearTimeout(giftRequestTimer); busy = false; }
      }
      if (state.error) {
        if (state.error!==previousError) toast(state.error);
        pendingSave = null; busy = false;
        updateStrength(); refreshGiftArea();
      }
      previousError = state.error || '';
      if (oldStatus!==state.run.status) { busy = false; if(tab==='run') $('#run-actions').innerHTML=runActions(); }
      if (changed) { if(tab==='home'||tab==='training'||tab==='history')render();else if(tab==='strength')updateStrength(); }
      updateRun(); updateSquats(); updatePushupCamera();
      if(tab==='leaderboard') window.LeaderboardUI.update(state.leaderboard);
      if(tab==='profile') window.HunterProfileUI.update(state.profile,state.leaderboard,profileStats());
      if (saved) celebrate(saved,beforeXP);
      if (claimed && giftRequest.present) presentGift(claimed,giftRequest.beforeXP);
    } catch (_) { toast('Trainingsdaten konnten nicht geladen werden.'); }
  };
  // A GPS status error belongs to its own action. Only this request's response
  // may reject a gift claim; persisted state independently confirms success.
  window.onNativeGiftResult = payload => {
    try {
      const result = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!result || !pendingGift || result.requestId !== pendingGift.id || result.ok) return;
      const present = pendingGift.present;
      pendingGift = null; busy = false; clearTimeout(giftRequestTimer);
      if (present && $('#gift-claim-wait')) closeModal();
      updateStrength(); refreshGiftArea();
      toast(result.error || 'Das Geschenk konnte nicht abgeholt werden. Bitte erneut versuchen.');
    } catch (_) { /* A malformed reply expires through the request timeout. */ }
  };
  window.onNativeBack = () => { if(!$('#modal-layer').hidden){closeModal();return true;}if(tab==='profile'){navigate(profileOrigin);return true;}if(tab==='pushup-camera'){navigate('strength');return true;}if(['run','strength','squats'].includes(tab)){navigate('training');return true;}if(tab!=='home'){navigate('home');return true;}return false; };
  function startSaving(type, method, ...args){if(pendingSave||pendingGift||busy)return;pendingSave={type,method,ids:new Set(state.workouts.map(w=>w.id)),reps:method==='savePushups'?draft:0};if(!callNative(method,...args))pendingSave=null;updateStrength();updateSquats();updatePushupCamera();setTimeout(()=>{if(pendingSave){pendingSave=null;busy=false;updateStrength();updateSquats();updatePushupCamera();}},5000);}
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled||b.hasAttribute('data-rep-surface'))return;if(b.dataset.tab){navigate(b.dataset.tab);return;}if(b.dataset.go){navigate(b.dataset.go);return;}switch(b.dataset.action){case'start-pushup-camera':startPushupCamera();break;case'pause-pushup-camera':hidePushupPreview();callNative('pausePushupCamera');updatePushupCamera();break;case'switch-pushup-camera':callNative('switchPushupCamera');break;case'correct-camera-pushup':callNative('correctCameraPushup');break;case'recalibrate-pushups':resetPushupPosition();break;case'save-camera-pushups':if(state.pushupCameraDraft>0)startSaving('pushups','saveCameraPushups');break;case'discard-camera-pushups':showModal(`${modalHeader('Kamera-Satz verwerfen?')}<p>Deine ${num(state.pushupCameraDraft)} noch nicht gespeicherten Kamera-Push Ups werden verworfen. Dein manueller Satz und gespeicherte Trainings bleiben erhalten.</p><div class="button-pair"><button class="secondary-button" data-action="close">Zurück</button><button class="secondary-button" data-action="confirm-discard-camera-pushups">Verwerfen</button></div>`);break;case'confirm-discard-camera-pushups':closeModal();callNative('discardCameraPushups');break;case'start-squats':startSquatCamera();break;case'pause-squats':hideSquatPreview();callNative('pauseSquats');updateSquats();break;case'switch-squat-camera':callNative('switchSquatCamera');break;case'correct-squat':callNative('correctSquat');break;case'recalibrate-squats':resetSquatPosition();break;case'save-squats':if(state.squatDraft>0)startSaving('squats','saveSquats');break;case'discard-squats':showModal(`${modalHeader('Squat-Satz verwerfen?')}<p>Deine ${num(state.squatDraft)} noch nicht gespeicherten Squats werden verworfen. Gespeicherte Trainings bleiben erhalten.</p><div class="button-pair"><button class="secondary-button" data-action="close">Zurück</button><button class="secondary-button" data-action="confirm-discard-squats">Verwerfen</button></div>`);break;case'confirm-discard-squats':closeModal();callNative('discardSquats');break;case'camera-settings':callNative('openCameraSettings');break;case'replay-gift':replayDailyGift();break;case'nose-mode':openNoseMode();break;case'nose-done':closeModal();break;case'nose-minus':setDraft(draft-1);break;case'claim-gift':claimDailyGift();break;case'close':closeModal();break;case'add-rep':setDraft(draft+1);break;case'subtract-rep':setDraft(draft-1);break;case'edit-reps':editReps();break;case'save-reps':if(draft>0)startSaving('pushups','savePushups',draft);break;case'start-run':callNative('startRun');break;case'pause-run':callNative('pauseRun');break;case'resume-run':callNative('resumeRun');break;case'finish-run':showModal(`${modalHeader('Lauf abschließen?')}<p>Du hast ${distance(state.run.distanceMeters)} in ${duration(state.run.elapsedSeconds)} erfasst. Speichere deinen Lauf und sammle deine XP.</p><div class="button-pair"><button class="secondary-button" data-action="close">Zurück</button><button class="primary-button" data-action="confirm-finish">Speichern</button></div>`);break;case'confirm-finish':closeModal();startSaving('run','finishRun');break;case'discard-run':showModal(`${modalHeader('Lauf verwerfen?')}<p>Die Aufzeichnung dieses Laufs wird gelöscht. Dafür werden keine XP vergeben.</p><div class="button-pair"><button class="secondary-button" data-action="close">Zurück</button><button class="secondary-button" style="color:var(--red)" data-action="confirm-discard">Verwerfen</button></div>`);break;case'confirm-discard':closeModal();callNative('discardRun');break;case'location-settings':callNative('openLocationSettings');break;}});
  $('.modal-scrim').addEventListener('click',closeModal);
  document.addEventListener('keydown',e=>{if($('#modal-layer').hidden)return;if(e.key==='Escape'){e.preventDefault();closeModal();}if(e.key==='Tab'){const els=$$('button,input,[tabindex="0"]',$('#modal')).filter(el=>!el.disabled);if(!els.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('#modal'))){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  window.addEventListener('resize',()=>{if(tab==='run')drawRoute();scheduleSquatPreviewBounds();schedulePushupPreviewBounds();});
  window.addEventListener('scroll',()=>{scheduleSquatPreviewBounds();schedulePushupPreviewBounds();},{passive:true});
  window.visualViewport?.addEventListener('resize',()=>{scheduleSquatPreviewBounds();schedulePushupPreviewBounds();});
  window.visualViewport?.addEventListener('scroll',()=>{scheduleSquatPreviewBounds();schedulePushupPreviewBounds();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){hideSquatPreview();hidePushupPreview();}syncMenuMusic();syncStrengthTouchMode();syncSquatScreen();syncPushupCameraScreen();updateSquats();updatePushupCamera();scheduleSquatPreviewBounds();schedulePushupPreviewBounds();if(!document.hidden&&native)callNative('requestUpdate');});
  setInterval(()=>{const day=new Date().toDateString();if(day!==lastDay){lastDay=day;if(tab!=='run')render();}},30000);
  if(native){try{const initial=JSON.parse(window.Hunter.getState());if(initial&&initial.run&&Array.isArray(initial.workouts))state={...fallbackState(),...initial,run:{...fallbackState().run,...initial.run},squats:{...fallbackState().squats,...initial.squats},pushupCamera:{...fallbackState().pushupCamera,...initial.pushupCamera}};}catch(_){} }
  state.gifts = Array.isArray(state.gifts) ? state.gifts : [];
  render();
  if(native)callNative('requestUpdate');
})();
