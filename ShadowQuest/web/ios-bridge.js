/* The same Hunter API as Android, routed to iOS. No simulated training data. */
(() => {
  'use strict';
  const handler = window.webkit?.messageHandlers?.hunter;
  if (!handler) return;
  let cached = window.__shadowQuestInitialState || {};
  const methods = [
    'activateLeaderboard','addProfileFriend','claimGift','correctCameraPushup','correctSquat',
    'discardCameraPushups','discardRun','discardSquats','disconnectLeaderboard','feedbackRepTouch',
    'finishRun','openCameraSettings','openLocationSettings','pausePushupCamera','pauseRun','pauseSquats',
    'refreshLeaderboard','refreshProfileFriends','removeProfileFriend','requestUpdate',
    'resetPushupCalibration','resetSquatCalibration','resumeRun','saveCameraPushups','saveHunterProfile',
    'savePushups','saveSquats','setMenuMusicAllowed','setPushupCameraScreenActive','setPushupPreviewBounds',
    'setSquatPreviewBounds','setSquatScreenActive','setStrengthTouchMode','startPushupCamera','startRun',
    'startSquats','switchPushupCamera','switchSquatCamera'
  ];
  const api = { getState: () => JSON.stringify(cached) };
  methods.forEach(method => { api[method] = (...args) => handler.postMessage({method, args}); });
  Object.defineProperty(window, 'Hunter', { value: Object.freeze(api), writable: false, configurable: false });
  window.__shadowQuestReceiveState = payload => {
    if (!payload || !payload.run || !Array.isArray(payload.workouts)) return;
    cached = payload;
    if (typeof window.onNativeState === 'function') window.onNativeState(payload);
  };
})();
