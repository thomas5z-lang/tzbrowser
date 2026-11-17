// Läuft in der Hauptwelt von YouTube, bevor YouTubes eigene Skripte starten.
// Entfernt die Werbeplätze aus den Player-Daten, sodass gar keine Werbung geplant wird.
// (Gleiches Prinzip wie die uBlock-Origin-Regeln "json-prune ... adPlacements".)
(() => {
  if (window.__ghostPrune) return;
  window.__ghostPrune = true;

  const KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];
  const strip = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 3) return o;
    for (const k of KEYS) if (k in o) { try { delete o[k]; } catch { o[k] = undefined; } }
    if (o.playerResponse) strip(o.playerResponse, depth + 1);
    if (Array.isArray(o)) o.forEach((x) => strip(x, depth + 1));
    return o;
  };
  const hasAds = (o) => o && typeof o === 'object' && (o.adPlacements || o.playerAds || o.adSlots || (o.playerResponse && (o.playerResponse.adPlacements || o.playerResponse.playerAds)));

  // 1) Antworten, die als Text geparst werden
  const origParse = JSON.parse;
  JSON.parse = function parse(...args) {
    const r = origParse.apply(this, args);
    try { if (hasAds(r)) strip(r); } catch { /* egal */ }
    return r;
  };

  // 2) fetch(...).json()
  const origJson = Response.prototype.json;
  Response.prototype.json = async function json(...args) {
    const r = await origJson.apply(this, args);
    try { if (hasAds(r)) strip(r); } catch { /* egal */ }
    return r;
  };

  // 3) Beim ersten Laden: window.ytInitialPlayerResponse = {...}
  let ipr;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get: () => ipr,
      set: (v) => { ipr = strip(v); },
    });
  } catch { /* schon definiert */ }
})();
