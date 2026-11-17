'use strict';
// Werbeblocker: Ghostery-Engine mit vielen Filterlisten.
// Die fertige Engine wird zwischengespeichert und alle 24 Stunden neu gebaut.
// Pro Seite kann der Blocker pausiert werden (Ausnahmeliste).
// Gilt für alle Sitzungen (Standard + Container).

const { app, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

const LISTS = [
  // Werbung
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylistgermany/easylistgermany.txt',
  'https://filters.adtidy.org/extension/ublock/filters/6.txt', // AdGuard Deutsch
  'https://filters.adtidy.org/extension/ublock/filters/2_without_easylist.txt', // AdGuard Base
  // uBlock Origin (inkl. YouTube-Korrekturen)
  'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  'https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt',
  'https://ublockorigin.github.io/uAssets/filters/unbreak.txt',
  // Tracking
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://ublockorigin.github.io/uAssets/filters/privacy.txt',
  // Cookie-Banner & Nervkram
  'https://ublockorigin.github.io/uAssets/filters/annoyances-cookies.txt',
  'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt',
  // Schadseiten
  'https://ublockorigin.github.io/uAssets/filters/badware.txt',
  'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt',
];

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const blockedPerTab = new Map(); // webContentsId -> Anzahl
const sessions = new Set();
let blocker = null;
let onCount = () => {};
let allow = new Set(); // Hosts, auf denen der Blocker pausiert ist

const cacheFile = () => path.join(app.getPath('userData'), 'adblock-engine.bin');
const allowFile = () => path.join(app.getPath('userData'), 'adblock-allow.json');

const exceptionRule = (host) => `@@||${host}^$document`;

function loadAllow() {
  try { allow = new Set(JSON.parse(fsSync.readFileSync(allowFile(), 'utf8'))); } catch { allow = new Set(); }
}

function saveAllow() {
  fsSync.writeFileSync(allowFile(), JSON.stringify([...allow], null, 2));
}

// Fetch, das bei Fehlern eine leere Liste liefert, damit eine
// nicht erreichbare Liste nicht den ganzen Blocker verhindert.
async function safeFetch(url, init) {
  try {
    const res = await net.fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (err) {
    console.warn(`[adblock] Liste nicht geladen: ${url} (${err.message})`);
    return new Response('');
  }
}

async function buildEngine({ force = false } = {}) {
  const file = cacheFile();
  if (force) await fs.rm(file, { force: true });
  else {
    try {
      const st = await fs.stat(file);
      if (Date.now() - st.mtimeMs > MAX_AGE_MS) await fs.rm(file, { force: true });
    } catch { /* noch kein Cache */ }
  }
  const engine = await ElectronBlocker.fromLists(safeFetch, LISTS, { enableCompression: true, loadCosmeticFilters: true, loadNetworkFilters: true }, {
    path: file,
    read: fs.readFile,
    write: fs.writeFile,
  });
  if (allow.size) engine.updateFromDiff({ added: [...allow].map(exceptionRule) });
  return engine;
}

// Ghostery registriert seine IPC-Kanäle global (nur einmal erlaubt). Die Handler
// gehören zur Engine und bedienen alle Sitzungen – daher vor jedem weiteren
// Einschalten den alten Eintrag entfernen.
function enableIn(s) {
  ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters');
  ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled');
  blocker.enableBlockingInSession(s);
}

// Auf diesen Seiten übernimmt TZBrowser die Seiten-Skripte selbst (src/preload/sites.js).
// Die uBlock-Scriptlets scheitern dort in Electron teilweise und bringen die Seite durcheinander.
// Netzwerk-Blockieren bleibt aktiv.
const OWN_HANDLING = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/i;

function activate(engine) {
  if (blocker) for (const s of sessions) blocker.disableBlockingInSession(s);
  const injectCosmetics = engine.onInjectCosmeticFilters;
  engine.onInjectCosmeticFilters = (event, url, msg) => {
    let host = '';
    try { host = new URL(url).hostname; } catch { /* leer */ }
    if (OWN_HANDLING.test(host)) return Promise.resolve();
    // Die uBlock-Scriptlets sind dafür gebaut, als EIN Skript pro Frame zu laufen.
    // Ghostery spielt jedes einzeln (und für jeden Frame in die Hauptseite) ein – dann
    // überschreiben sich ihre globalen Hilfsfunktionen und z. B. Function.prototype.toString
    // landet in einer Endlosschleife (Crunchyroll-Player lädt nicht). Darum: sammeln,
    // doppelte entfernen und gekapselt genau einmal in den richtigen Frame einspielen.
    const scripts = [];
    const frame = event.senderFrame;
    const proxy = {
      frameId: event.frameId,
      processId: event.processId,
      senderFrame: frame,
      sender: {
        insertCSS: (...a) => event.sender.insertCSS(...a),
        executeJavaScript: (s) => { scripts.push(s); return Promise.resolve(); },
      },
    };
    return Promise.resolve(injectCosmetics(proxy, url, msg)).then(() => {
      if (!scripts.length) return;
      const code = '(function(){if(window.__ghostSL)return;Object.defineProperty(window,"__ghostSL",{value:true});\n'
        + [...new Set(scripts)].join(';\n') + '\n})();';
      const target = frame && !frame.isDestroyed?.() ? frame : event.sender.mainFrame;
      return target.executeJavaScript(code, true).catch((e) => console.error('[adblock] Scriptlet-Fehler: ' + (e && e.message)));
    });
  };
  blocker = engine;
  blocker.on('request-blocked', (req) => {
    const id = req.tabId;
    if (typeof id !== 'number' || id < 0) return;
    const n = (blockedPerTab.get(id) || 0) + 1;
    blockedPerTab.set(id, n);
    onCount(id, n);
  });
  for (const s of sessions) enableIn(s);
}

// Weitere Sitzung (Container) einbinden
function attach(ses) {
  if (sessions.has(ses)) return;
  sessions.add(ses);
  if (blocker) enableIn(ses);
}

async function setupAdblock(countCallback) {
  onCount = countCallback || onCount;
  loadAllow();
  const t0 = Date.now();
  activate(await buildEngine());
  console.log(`[adblock] aktiv nach ${Date.now() - t0} ms`);

  // Täglich im Hintergrund aktualisieren
  setInterval(() => refreshLists().catch((e) => console.warn('[adblock] Aktualisierung fehlgeschlagen:', e.message)), MAX_AGE_MS).unref();
}

async function refreshLists() {
  activate(await buildEngine({ force: true }));
  console.log('[adblock] Filterlisten aktualisiert');
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function isPaused(url) {
  const host = hostOf(url);
  return !!host && [...allow].some((h) => host === h || host.endsWith('.' + h));
}

// Werbeblocker für die Seite ein-/ausschalten. Gibt den neuen Zustand zurück.
function togglePause(url) {
  const host = hostOf(url);
  if (!host || !blocker) return false;
  if (allow.has(host)) {
    allow.delete(host);
    blocker.updateFromDiff({ removed: [exceptionRule(host)] });
  } else {
    allow.add(host);
    blocker.updateFromDiff({ added: [exceptionRule(host)] });
  }
  saveAllow();
  return allow.has(host);
}

const isReady = () => !!blocker;
const getBlocked = (wcId) => blockedPerTab.get(wcId) || 0;
const resetBlocked = (wcId) => blockedPerTab.set(wcId, 0);

module.exports = { setupAdblock, attach, refreshLists, getBlocked, resetBlocked, isPaused, togglePause, isReady, hostOf };
