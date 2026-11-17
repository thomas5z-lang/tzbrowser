'use strict';
// Lesezeichen und Verlauf ("Bibliothek").
//  - Lesezeichen: flache Liste, Import aus Chrome/Edge/Brave/Opera GX
//  - Verlauf: besuchte Seiten (nie aus privaten Tabs), max. 20 000 Einträge
//  - Vorschläge für die Adressleiste aus beidem

const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIBRARY_PAGE = /\/src\/ui\/library\.html$/;
const MAX_HISTORY = 20000;

let bookmarks = null; // [{ id, url, title, favicon, added }]
let history = null; // [{ url, title, time }]  neueste zuerst
let stats = null; // url -> { title, count, last }
const timers = {};

const file = (name) => path.join(app.getPath('userData'), name);

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}

// Verzögert speichern (viele Seitenaufrufe kurz hintereinander)
function saveLater(name, getData) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    const tmp = file(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(getData()));
    fs.renameSync(tmp, file(name));
  }, 800);
}

function loadAll() {
  if (bookmarks) return;
  bookmarks = readJson('bookmarks.json', []);
  history = readJson('history.json', []);
  stats = new Map();
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const s = stats.get(h.url) || { title: h.title, count: 0, last: 0 };
    s.count++;
    s.last = Math.max(s.last, h.time);
    s.title = h.title || s.title;
    stats.set(h.url, s);
  }
}

const normUrl = (u) => String(u || '').replace(/#.*$/, '');

// ---------------- Lesezeichen ----------------
function isBookmarked(url) {
  loadAll();
  const u = normUrl(url);
  return bookmarks.some((b) => b.url === u);
}

function toggleBookmark(url, title, favicon) {
  loadAll();
  const u = normUrl(url);
  if (!/^https?:/i.test(u)) return false;
  const idx = bookmarks.findIndex((b) => b.url === u);
  if (idx >= 0) bookmarks.splice(idx, 1);
  else bookmarks.unshift({ id: crypto.randomUUID(), url: u, title: title || u, favicon: favicon || '', added: Date.now() });
  saveLater('bookmarks.json', () => bookmarks);
  return idx < 0;
}

function listBookmarks() {
  loadAll();
  return bookmarks;
}

// Lesezeichen aus Chromium-Browsern übernehmen
const SOURCES = {
  chrome: { name: 'Google Chrome', file: () => path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks') },
  edge: { name: 'Microsoft Edge', file: () => path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks') },
  brave: { name: 'Brave', file: () => path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Bookmarks') },
  operagx: { name: 'Opera GX', file: () => path.join(process.env.APPDATA || '', 'Opera Software', 'Opera GX Stable', 'Bookmarks') },
  opera: { name: 'Opera', file: () => path.join(process.env.APPDATA || '', 'Opera Software', 'Opera Stable', 'Bookmarks') },
};

// Firefox: Lesezeichen stehen in places.sqlite des Standardprofils
function firefoxPlaces() {
  const dir = path.join(process.env.APPDATA || '', 'Mozilla', 'Firefox', 'Profiles');
  try {
    const profiles = fs.readdirSync(dir)
      .map((p) => path.join(dir, p, 'places.sqlite'))
      .filter((f) => fs.existsSync(f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs); // zuletzt benutztes Profil zuerst
    return profiles[0] || null;
  } catch { return null; }
}

function readFirefox() {
  const src = firefoxPlaces();
  if (!src) throw new Error('Firefox-Profil nicht gefunden');
  // Firefox sperrt die Datei, solange es läuft – deshalb eine Kopie lesen
  const tmp = path.join(app.getPath('temp'), `ghost-ff-${Date.now()}.sqlite`);
  fs.copyFileSync(src, tmp);
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(tmp, { readOnly: true });
    const rows = db.prepare(`SELECT p.url AS url, COALESCE(b.title, p.title, p.url) AS title
      FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk
      WHERE b.type = 1 AND p.url LIKE 'http%'`).all();
    db.close();
    return rows.map((r) => ({ url: normUrl(r.url), title: r.title }));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function importSources() {
  return [
    { id: 'firefox', name: 'Firefox', available: !!firefoxPlaces() },
    ...Object.entries(SOURCES).map(([id, s]) => ({ id, name: s.name, available: fs.existsSync(s.file()) })),
  ];
}

function importBookmarks(sourceId) {
  loadAll();
  const found = [];
  if (sourceId === 'firefox') {
    try { found.push(...readFirefox()); } catch (e) { return { added: 0, error: `Firefox: ${e.message}` }; }
  } else {
    const src = SOURCES[sourceId];
    if (!src) return { added: 0, error: 'Unbekannte Quelle' };
    let data;
    try { data = JSON.parse(fs.readFileSync(src.file(), 'utf8')); } catch (e) { return { added: 0, error: `${src.name}: Lesezeichen nicht lesbar` }; }
    const walk = (node) => {
      if (!node) return;
      if (node.type === 'url' && /^https?:/i.test(node.url || '')) found.push({ url: normUrl(node.url), title: node.name || node.url });
      (node.children || []).forEach(walk);
    };
    Object.values(data.roots || {}).forEach(walk);
  }
  const have = new Set(bookmarks.map((b) => b.url));
  let added = 0;
  for (const f of found) {
    if (have.has(f.url)) continue;
    have.add(f.url);
    bookmarks.push({ id: crypto.randomUUID(), url: f.url, title: f.title, favicon: '', added: Date.now() });
    added++;
  }
  saveLater('bookmarks.json', () => bookmarks);
  return { added, total: found.length };
}

// ---------------- Verlauf ----------------
function addVisit(url, title) {
  loadAll();
  const u = normUrl(url);
  if (!/^https?:/i.test(u)) return;
  const last = history[0];
  if (last && last.url === u && Date.now() - last.time < 30_000) { // gleiche Seite gerade eben: nur Titel nachtragen
    if (title) last.title = title;
  } else {
    history.unshift({ url: u, title: title || '', time: Date.now() });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    const s = stats.get(u) || { title: '', count: 0, last: 0 };
    s.count++;
    s.last = Date.now();
    stats.set(u, s);
  }
  if (title) { const s = stats.get(u); if (s) s.title = title; }
  saveLater('history.json', () => history);
}

function updateTitle(url, title) {
  loadAll();
  const u = normUrl(url);
  const h = history.find((x) => x.url === u);
  if (h && title && !h.title) { h.title = title; saveLater('history.json', () => history); }
  const s = stats.get(u);
  if (s && title) s.title = title;
}

function searchHistory(query = '', limit = 300) {
  loadAll();
  const q = query.trim().toLowerCase();
  const out = [];
  for (const h of history) {
    if (!q || h.url.toLowerCase().includes(q) || (h.title || '').toLowerCase().includes(q)) out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

function removeHistory(url, time) {
  loadAll();
  history = history.filter((h) => !(h.url === url && (time == null || h.time === time)));
  if (time == null) stats.delete(url);
  saveLater('history.json', () => history);
}

function clearHistory(sinceMs = null) {
  loadAll();
  if (sinceMs == null) { history = []; stats.clear(); }
  else {
    const cut = Date.now() - sinceMs;
    history = history.filter((h) => h.time < cut);
  }
  saveLater('history.json', () => history);
}

// ---------------- Vorschläge für die Adressleiste ----------------
function suggest(query, limit = 7) {
  loadAll();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const matches = (url, title) => {
    const hay = `${url} ${title || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const strip = (u) => u.replace(/^https?:\/\/(www\.)?/, '');
  const results = new Map();
  for (const b of bookmarks) {
    if (matches(b.url, b.title)) results.set(b.url, { url: b.url, title: b.title, type: 'bookmark', score: 1000 + (strip(b.url).startsWith(q) ? 500 : 0) });
  }
  const now = Date.now();
  for (const [url, s] of stats) {
    if (results.has(url) || !matches(url, s.title)) continue;
    const ageDays = (now - s.last) / 86_400_000;
    const score = s.count * 10 / (1 + ageDays / 7) + (strip(url).startsWith(q) ? 400 : 0);
    results.set(url, { url, title: s.title, type: 'history', score });
  }
  return [...results.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------- IPC für die Bibliothek-Seite ----------------
function isLibrary(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return !!url && url.startsWith('file:') && LIBRARY_PAGE.test(decodeURIComponent(new URL(url).pathname));
}

function setup() {
  const guard = (fn) => (event, ...args) => {
    if (!isLibrary(event)) throw new Error('nicht erlaubt');
    return fn(...args);
  };
  ipcMain.handle('ghost:lib-bookmarks', guard(() => listBookmarks()));
  ipcMain.handle('ghost:lib-bookmark-remove', guard((id) => {
    loadAll();
    bookmarks = bookmarks.filter((b) => b.id !== id);
    saveLater('bookmarks.json', () => bookmarks);
    return true;
  }));
  ipcMain.handle('ghost:lib-bookmark-update', guard(({ id, title, url }) => {
    loadAll();
    const b = bookmarks.find((x) => x.id === id);
    if (!b) return false;
    if (title != null) b.title = String(title);
    if (url != null && /^https?:/i.test(url)) b.url = normUrl(url);
    saveLater('bookmarks.json', () => bookmarks);
    return true;
  }));
  ipcMain.handle('ghost:lib-import-sources', guard(() => importSources()));
  ipcMain.handle('ghost:lib-import', guard((id) => importBookmarks(id)));
  ipcMain.handle('ghost:lib-history', guard((q) => searchHistory(q)));
  ipcMain.handle('ghost:lib-history-remove', guard(({ url, time }) => { removeHistory(url, time); return true; }));
  ipcMain.handle('ghost:lib-history-clear', guard((sinceMs) => { clearHistory(sinceMs); return true; }));

  app.on('before-quit', () => {
    // offene Speichervorgänge sofort ausführen
    for (const [name, t] of Object.entries(timers)) {
      clearTimeout(t);
      try { fs.writeFileSync(file(name), JSON.stringify(name === 'history.json' ? history : bookmarks)); } catch { /* egal */ }
    }
  });
}

// ---- Sicherung: Lesezeichen exportieren / zusammenführen ----
function exportBookmarks() {
  loadAll();
  return bookmarks.map(({ url, title, added }) => ({ url, title, added }));
}

function mergeBookmarks(list) {
  loadAll();
  let n = 0;
  for (const b of list || []) {
    const u = normUrl(String((b && b.url) || ''));
    if (!/^https?:/i.test(u) || bookmarks.some((y) => y.url === u)) continue;
    bookmarks.push({ id: crypto.randomUUID(), url: u, title: String(b.title || u).slice(0, 300), favicon: '', added: b.added || Date.now() });
    n++;
  }
  saveLater('bookmarks.json', () => bookmarks);
  return n;
}

module.exports = { setup, isBookmarked, toggleBookmark, listBookmarks, addVisit, updateTitle, searchHistory, suggest, exportBookmarks, mergeBookmarks };
