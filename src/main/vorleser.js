'use strict';
// Anime-Vorleser direkt in TZBrowser: liest deutsche Crunchyroll-Untertitel mit der
// lokalen KI-Stimme vor. Nutzt die Dateien des Anime-Vorlesers (src/vorleser)
// unverändert; statt der Chrome-APIs übernimmt TZBrowser den Hintergrund-Teil.

const { app, ipcMain, webContents } = require('electron');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');
const tts = require('./tts');

const SRC = path.join(__dirname, '..', 'vorleser');
const STANDARD = {
  an: false,
  stimme: 'omni_erzaehler',
  tempo: 1.0,
  original: 15,
  lautstaerke: 100,
  schilder: false,
  spurWahl: 'auto',
  geschlecht: true,
  stimmeM: 'omni_mann',
  stimmeW: 'omni_frau',
};
const DEUTSCH = /de[-_]?DE|[/_.-]de[/_.-]|ger|deu|german/i;
const UT_ENDUNG = /\.(ass|ssa|vtt|srt)(\?|#|$)/i;
const isCr = (u) => { try { return /(^|\.)crunchyroll\.com$/i.test(new URL(u).hostname); } catch { return false; } };

// Live-Vorleser: Dienste ohne abfangbare Untertitel-Datei – liest den angezeigten Untertitel vom Bildschirm.
// Nicht alle konnte ZeroCool testen (kein Abo) – Selektoren bei Bedarf anpassen.
const LIVE = [
  { host: /(^|\.)netflix\.com$/i, selector: '.player-timedtext' },
  { host: /(^|\.)(primevideo\.com|amazon\.(de|com|co\.uk))$/i, selector: '.atvwebplayersdk-captions-text' },
  { host: /(^|\.)disneyplus\.com$/i, selector: '.dss-subtitle-renderer-cue-window, .hive-subtitle-renderer-cue-window, [class*="subtitle-renderer-cue"]' },
  { host: /(^|\.)youtube\.com$/i, selector: '.ytp-caption-window-container' },
  { host: /(^|\.)(joyn\.de|plus\.rtl\.de|zdf\.de|ardmediathek\.de|arte\.tv|wow\.tv|paramountplus\.com|apple\.com)$/i, selector: null },
];
const liveFor = (host) => LIVE.find((l) => l.host.test(host || '')) || null;
const isSite = (u) => { try { const h = new URL(u).hostname; return isCr(u) || !!liveFor(h); } catch { return false; } };

const spuren = new Map(); // webContentsId -> [{ url, text, deutsch, sprache, zeit }]
const geholt = new Set();

function einst() {
  return { ...STANDARD, ...(settings.get('animeVorleser') || {}) };
}

function setEinst(obj) {
  const alt = einst();
  const neu = { ...alt, ...obj };
  settings.set('animeVorleser', neu);
  const changes = {};
  for (const k of Object.keys(obj)) if (alt[k] !== neu[k]) changes[k] = { oldValue: alt[k], newValue: neu[k] };
  if (Object.keys(changes).length) {
    for (const wc of webContents.getAllWebContents()) if (isSite(wc.getURL())) toFrames(wc, 'ghost:av-changed', changes);
  }
  return neu;
}

function toFrames(wc, channel, data) {
  try { for (const f of wc.mainFrame.framesInSubtree) { try { f.send(channel, data); } catch { /* Frame weg */ } } } catch { /* Tab weg */ }
}

function addSpur(wc, url, text, sprache) {
  if (!spuren.has(wc.id)) wc.once('destroyed', () => spuren.delete(wc.id));
  const list = (spuren.get(wc.id) || []).filter((s) => s.url !== url);
  const deutsch = sprache ? /^de/i.test(sprache) : DEUTSCH.test(url);
  list.push({ url, text, deutsch, sprache: sprache || '', zeit: Date.now() });
  while (list.length > 8) list.shift();
  spuren.set(wc.id, list);
  toFrames(wc, 'ghost:av-msg', { typ: 'spuren', spuren: list });
}

const istUntertitel = (t) => { const a = (t || '').slice(0, 300).replace(/^﻿/, '').trimStart(); return a.startsWith('[Script Info]') || a.startsWith('WEBVTT'); };

async function holen(wc, url, sprache) {
  if (geholt.has(url)) return;
  geholt.add(url);
  try {
    const text = await (await wc.session.fetch(url)).text();
    if (istUntertitel(text)) addSpur(wc, url, text, sprache);
  } catch { geholt.delete(url); }
}

async function handle(wc, msg) {
  switch (msg && msg.typ) {
    case 'gefunden': addSpur(wc, msg.url, msg.text, ''); return { ok: true };
    case 'liste': {
      const de = (msg.liste || []).filter((x) => /^de/i.test(x.sprache));
      for (const x of de.length ? de : msg.liste || []) await holen(wc, x.url, x.sprache);
      return { ok: true };
    }
    case 'spuren':
      if (!spuren.has(wc.id)) console.log('[vorleser] aktiv auf ' + wc.getURL().slice(0, 80));
      return { spuren: spuren.get(wc.id) || [] };
    case 'status': return (await tts.status()) || { ok: false };
    case 'warmup': tts.ensure().catch(() => {}); return {};
    case 'sprecher':
      try {
        return msg.schluessel ? await tts.raw('/sprecher/' + encodeURIComponent(msg.schluessel)) : await tts.raw('/sprecher', { zeilen: msg.zeilen });
      } catch { return { status: 'fehler', fehler: 'Sprach-Server nicht erreichbar' }; }
    case 'tts':
      try {
        const wav = await tts.speak(msg.text, msg.stimme, msg.tempo, msg.max_sek);
        return { audio: wav.toString('base64') };
      } catch (e) { return { fehler: e.message }; }
    default: return {};
  }
}

// Vorlade-Skript für die Seiten bauen: Chrome-Ersatz + Untertitel-Leser + Abspieler
function buildPreload() {
  const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
  const code = `'use strict';
// automatisch erzeugt von TZBrowser (src/main/vorleser.js) – nicht bearbeiten
const { ipcRenderer, webFrame } = require('electron');
if (/(^|\\.)crunchyroll\\.com$/i.test(location.hostname) && ipcRenderer.sendSync('ghost:av-enabled')) {
  webFrame.executeJavaScript(${JSON.stringify(read('inject.js'))}).catch(() => {});
  const msgL = [];
  const storeL = [];
  ipcRenderer.on('ghost:av-msg', (_e, m) => msgL.forEach((fn) => { try { fn(m, {}, () => {}); } catch (err) { console.error(err); } }));
  ipcRenderer.on('ghost:av-changed', (_e, c) => storeL.forEach((fn) => { try { fn(c, 'sync'); } catch (err) { console.error(err); } }));
  const chrome = {
    runtime: { sendMessage: (m) => ipcRenderer.invoke('ghost:av', m), onMessage: { addListener: (fn) => msgL.push(fn) } },
    storage: {
      sync: { get: (d) => ipcRenderer.invoke('ghost:av-settings').then((s) => ({ ...d, ...s })), set: (o) => ipcRenderer.invoke('ghost:av-settings-set', o) },
      onChanged: { addListener: (fn) => storeL.push(fn) },
    },
  };
  (function (chrome) {
${read('untertitel.js')}
${read('content.js')}
  })(chrome);
}
`;
  const file = path.join(app.getPath('userData'), 'vorleser-preload.js');
  fs.writeFileSync(file, code);
  return file;
}

let preloadFile = null;

function setup() {
  preloadFile = buildPreload();
  ipcMain.on('ghost:av-enabled', (e) => { e.returnValue = !!einst().an && isCr(e.senderFrame ? e.senderFrame.url : ''); });
  ipcMain.handle('ghost:av', (e, msg) => handle(e.sender, msg));
  ipcMain.handle('ghost:av-settings', () => einst());
  ipcMain.on('ghost:avlive-config', (e, host) => {
    const live = liveFor(String(host || ''));
    const ein = einst();
    e.returnValue = ein.an && live ? { ...ein, selector: live.selector } : null;
  });
  ipcMain.handle('ghost:av-settings-set', (_e, o) => { setEinst(o || {}); return true; });
}

function prepareSession(ses) {
  if (!preloadFile) return;
  ses.registerPreloadScript({ type: 'frame', id: 'ghost-vorleser', filePath: preloadFile });
  ses.registerPreloadScript({ type: 'frame', id: 'ghost-vorleser-live', filePath: path.join(__dirname, '..', 'preload', 'vorleser-live.js') });
  // zweiter Weg: Untertitel-Dateien, die der Player im Hintergrund lädt
  ses.webRequest.onCompleted({ urls: ['*://*/*'] }, (d) => {
    if (!d.webContentsId || !einst().an || !(UT_ENDUNG.test(d.url) || /subtitle/i.test(d.url))) return;
    if (/\.(m4s|mp4|ts|m3u8|mpd|jpe?g|png|webp|gif|svg|woff2?|ttf|css)(\?|$)/i.test(d.url)) return;
    const wc = webContents.fromId(d.webContentsId);
    if (wc && isCr(wc.getURL())) holen(wc, d.url, '');
  });
}

// ☰-Menü „Vorlesen“ → Anime-Vorleser
function menuTemplate(reloadCr) {
  const e = einst();
  const voices = tts.voices();
  const radio = (key, list) => list.map((v) => ({ label: tts.voiceName(v), type: 'radio', checked: e[key] === v, click: () => setEinst({ [key]: v }) }));
  const pick = (key, values, fmt) => values.map((v) => ({ label: fmt(v), type: 'radio', checked: Number(e[key]) === v, click: () => setEinst({ [key]: v }) }));
  return [
    { label: 'Anime-Vorleser (Crunchyroll)', type: 'checkbox', checked: e.an, click: (i) => { setEinst({ an: i.checked }); if (i.checked) reloadCr(); } },
    { type: 'separator' },
    { label: 'Erzähler-Stimme', submenu: radio('stimme', voices) },
    { label: 'Männer und Frauen unterschiedlich', type: 'checkbox', checked: e.geschlecht, click: (i) => setEinst({ geschlecht: i.checked }) },
    { label: 'Männerstimme', enabled: e.geschlecht, submenu: radio('stimmeM', voices) },
    { label: 'Frauenstimme', enabled: e.geschlecht, submenu: radio('stimmeW', voices) },
    { label: `Sprechtempo (${Number(e.tempo).toFixed(1)}×)`, submenu: pick('tempo', [0.8, 0.9, 1, 1.1, 1.2, 1.4], (v) => `${v.toFixed(1)}×`) },
    { label: `Originalton (${e.original} %)`, submenu: pick('original', [0, 10, 15, 25, 40, 60], (v) => `${v} %`) },
    { label: `Lautstärke Vorleser (${e.lautstaerke} %)`, submenu: pick('lautstaerke', [60, 80, 100, 130, 160], (v) => `${v} %`) },
    { label: 'Schilder und Einblendungen mitlesen', type: 'checkbox', checked: e.schilder, click: (i) => setEinst({ schilder: i.checked }) },
  ];
}

module.exports = { setup, prepareSession, menuTemplate, einst, setEinst, isCr, isSite };
