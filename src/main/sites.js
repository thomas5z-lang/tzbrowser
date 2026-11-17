'use strict';
// Extras für YouTube und Twitch (Hauptprozess-Seite):
//  - SponsorBlock-Segmente (datenschutzfreundlich per Hash-Präfix)
//  - Return YouTube Dislike
//  - Twitch-Werbeblocker "Purple AdBlock" (Apache-2.0) – wird geladen und zwischengespeichert
// Die Seitenlogik selbst steckt in src/preload/sites.js.

const { app, ipcMain, net } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const PURPLE_URL = 'https://raw.githubusercontent.com/arthurbolsoni/Purple-adblock/refs/heads/main/platform/tampermonkey/dist/purpleadblocker.user.js';
const SCRIPT_MAX_AGE = 12 * 3600 * 1000;
const PRELOAD = path.join(__dirname, '..', 'preload', 'sites.js');

const YT_PRUNE = fs.readFileSync(path.join(__dirname, '..', 'preload', 'yt-prune.js'), 'utf8');
const scriptFile = () => path.join(app.getPath('userData'), 'scripts', 'purple.user.js');
const cache = new Map(); // kleine Antwort-Caches
let purple = '';

async function fetchJson(url) {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'TZBrowser' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ms) return hit.p;
  const p = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { t: Date.now(), p });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return p;
}

// SponsorBlock: nur die ersten 4 Zeichen des Hashs werden gesendet
function sponsorSegments(videoId) {
  return cached('sb:' + videoId, 10 * 60 * 1000, async () => {
    const prefix = crypto.createHash('sha256').update(videoId).digest('hex').slice(0, 4);
    const cats = encodeURIComponent(JSON.stringify(settings.get('sbCategories')));
    const list = await fetchJson(`https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${cats}`);
    const entry = (list || []).find((v) => v.videoID === videoId);
    return entry ? entry.segments.filter((s) => s.actionType === 'skip').map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category })) : [];
  });
}

function dislikes(videoId) {
  return cached('ryd:' + videoId, 10 * 60 * 1000, async () => {
    const data = await fetchJson(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`);
    return data ? data.dislikes : null;
  });
}

// Purple AdBlock laden (beim Start aus dem Cache, im Hintergrund aktualisieren)
function loadPurple() {
  try { purple = fs.readFileSync(scriptFile(), 'utf8'); } catch { purple = ''; }
  let age = Infinity;
  try { age = Date.now() - fs.statSync(scriptFile()).mtimeMs; } catch { /* fehlt */ }
  if (age > SCRIPT_MAX_AGE) updatePurple();
  setInterval(updatePurple, SCRIPT_MAX_AGE).unref();
}

async function updatePurple() {
  try {
    const res = await net.fetch(PURPLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('==UserScript==') || text.length < 5000) throw new Error('unerwarteter Inhalt');
    fs.mkdirSync(path.dirname(scriptFile()), { recursive: true });
    fs.writeFileSync(scriptFile(), text);
    purple = text;
    console.log('[sites] Purple AdBlock aktualisiert');
  } catch (err) {
    console.warn('[sites] Purple AdBlock nicht geladen:', err.message);
  }
}

function setup() {
  loadPurple();

  // Wird beim Laden jeder Seite synchron vom Preload abgefragt
  ipcMain.on('ghost:site-config', (event, host) => {
    const s = settings.all();
    const isTwitch = /(^|\.)twitch\.tv$/i.test(host || '');
    event.returnValue = {
      sponsorblock: s.sponsorblock,
      youtubeAds: s.youtubeAds,
      dislikes: s.dislikes,
      twitchAds: s.twitchAds,
      twitchPoints: s.twitchPoints,
      twitchScript: isTwitch && s.twitchAds ? purple : '',
      ytScript: !isTwitch && s.youtubeAds ? YT_PRUNE : '',
    };
  });
  // Google-Anmeldung: Seiten-Skript, das TZBrowser dort als Firefox ausgibt (siehe google-login.js)
  const googleLogin = require('./google-login');
  ipcMain.on('ghost:google-login-script', (event, host) => {
    event.returnValue = googleLogin.LOGIN_HOST.test(host || '') ? googleLogin.PAGE_SCRIPT : '';
  });
  ipcMain.on('ghost:site-event', (_e, text) => console.log('[sites]', String(text).slice(0, 200)));
  ipcMain.handle('ghost:sb', (_e, id) => (/^[\w-]{11}$/.test(id) ? sponsorSegments(id) : []));
  ipcMain.handle('ghost:ryd', (_e, id) => (/^[\w-]{11}$/.test(id) ? dislikes(id) : null));
}

// Preload in eine Sitzung einhängen (alle Frames)
function attach(ses) {
  ses.registerPreloadScript({ type: 'frame', id: 'ghost-sites', filePath: PRELOAD });
}

module.exports = { setup, attach };
