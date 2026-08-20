window.__RR_bootErrors = [];
window.__RR_showBootError = function (msg, detail) {
  window.__RR_bootErrors.push([msg, detail || '']);
  if (window.__RR_flushBootErrors) window.__RR_flushBootErrors();
  else console.warn('[boot]', msg, detail || '');
};
