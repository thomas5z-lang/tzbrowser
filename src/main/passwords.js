'use strict';
// Passwortmanager von TZBrowser.
//  - Passwörter werden mit der Windows-Verschlüsselung (DPAPI über safeStorage) gespeichert:
//    nur dein Windows-Konto auf diesem PC kann sie entschlüsseln.
//  - Ausgefüllt wird nur auf genau der Seite (Origin), für die das Passwort gespeichert wurde.
//    Die Herkunft prüft der Hauptprozess selbst – eine Seite kann nicht nach fremden Passwörtern fragen.

const { app, safeStorage, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANAGER_PAGE = /\/src\/ui\/passwords\.html$/;
let data = null; // { entries: [...], never: [...] }
let getWin = () => null;
const pendingAsk = new Map(); // origin|user -> Zeitpunkt (doppelte Abfragen vermeiden)

const file = () => path.join(app.getPath('userData'), 'passwords.json');

function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { data = { entries: [], never: [] }; }
  data.entries ||= [];
  data.never ||= [];
  return data;
}

function save() {
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file());
}

// Neue asynchrone safeStorage-Schnittstelle (die synchrone ist in Electron veraltet)
const enc = async (plain) => (await safeStorage.encryptStringAsync(plain)).toString('base64');
const dec = async (b64) => (await safeStorage.decryptStringAsync(Buffer.from(b64, 'base64'))).result;

function originOf(frame) {
  try {
    const o = frame && (frame.origin || new URL(frame.url).origin);
    return /^https?:\/\//.test(o) ? o : null;
  } catch { return null; }
}

const pretty = (origin) => origin.replace(/^https?:\/\/(www\.)?/, '');

function isManager(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return !!url && url.startsWith('file:') && MANAGER_PAGE.test(decodeURIComponent(new URL(url).pathname));
}

// Nach einem Login: speichern / aktualisieren / nie fragen
async function onCapture(event, { username = '', password = '' } = {}) {
  const origin = originOf(event.senderFrame);
  if (!origin || !password || password.length > 512) return;
  username = String(username).trim().slice(0, 256);
  const d = load();
  console.log(`[pw] Login erkannt auf ${origin}${username ? '' : ' (ohne Benutzername)'}`);
  if (d.never.includes(origin)) { console.log('[pw] Seite steht auf der Nie-Liste'); return; }

  const existing = d.entries.find((e) => e.origin === origin && e.username === username);
  if (existing) {
    let same = false;
    try { same = (await dec(existing.pw)) === password; } catch { /* nicht lesbar */ }
    if (same) { existing.used = Date.now(); save(); return; }
  }
  const key = `${origin}|${username}`;
  if (Date.now() - (pendingAsk.get(key) || 0) < 15_000) return;
  pendingAsk.set(key, Date.now());

  const { response } = await dialog.showMessageBox(getWin(), {
    type: 'question',
    title: 'TZBrowser – Passwort',
    message: existing ? `Passwort für ${pretty(origin)} aktualisieren?` : `Passwort für ${pretty(origin)} speichern?`,
    detail: `${username ? `Benutzer: ${username}\n` : ''}TZBrowser verschlüsselt es mit deinem Windows-Konto. Es bleibt nur auf diesem PC.`,
    buttons: [existing ? 'Aktualisieren' : 'Speichern', 'Nicht jetzt', 'Nie für diese Seite'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 2) { d.never.push(origin); save(); return; }
  if (response !== 0) return;
  const now = Date.now();
  const pw = await enc(password);
  if (existing) Object.assign(existing, { pw, updated: now });
  else d.entries.push({ id: crypto.randomUUID(), origin, username, pw, created: now, updated: now, used: now });
  save();
}

function setup(winGetter) {
  getWin = winGetter;

  ipcMain.on('ghost:pw-capture', (event, payload) => { onCapture(event, payload).catch((e) => console.warn('[pw]', e.message)); });

  // Welche Konten gibt es für DIESE Seite? (nur Namen, keine Passwörter)
  ipcMain.handle('ghost:pw-query', (event) => {
    const origin = originOf(event.senderFrame);
    if (!origin) return [];
    return load().entries.filter((e) => e.origin === origin)
      .sort((a, b) => (b.used || 0) - (a.used || 0))
      .map((e) => ({ username: e.username }));
  });

  // Zugangsdaten für DIESE Seite herausgeben
  ipcMain.handle('ghost:pw-fill', async (event, username) => {
    const origin = originOf(event.senderFrame);
    const entry = origin && load().entries.find((e) => e.origin === origin && e.username === username);
    if (!entry) return null;
    try {
      entry.used = Date.now();
      save();
      return { username: entry.username, password: await dec(entry.pw) };
    } catch { return null; }
  });

  // Bei mehreren Konten: Auswahlmenü an der Mausposition
  ipcMain.handle('ghost:pw-choose', (event) => new Promise((resolve) => {
    const origin = originOf(event.senderFrame);
    const list = origin ? load().entries.filter((e) => e.origin === origin) : [];
    if (!list.length) return resolve(null);
    let chosen = null;
    const menu = Menu.buildFromTemplate([
      { label: `🔑 Gespeicherte Konten für ${pretty(origin)}`, enabled: false },
      ...list.map((e) => ({ label: e.username || '(ohne Benutzername)', click: () => { chosen = e.username; } })),
    ]);
    menu.popup({ window: getWin(), callback: () => setTimeout(() => resolve(chosen), 0) });
  }));

  // ---- Verwaltungsseite (nur src/ui/passwords.html darf das) ----
  const guard = (fn) => (event, ...args) => {
    if (!isManager(event)) throw new Error('nicht erlaubt');
    return fn(...args);
  };
  ipcMain.handle('ghost:pwm-list', guard(() => load().entries
    .map(({ id, origin, username, updated, used }) => ({ id, origin, site: pretty(origin), username, updated, used }))
    .sort((a, b) => a.site.localeCompare(b.site))));
  ipcMain.handle('ghost:pwm-reveal', guard(async (id) => {
    const e = load().entries.find((x) => x.id === id);
    return e ? dec(e.pw) : null;
  }));
  ipcMain.handle('ghost:pwm-update', guard(async ({ id, username, password }) => {
    const e = load().entries.find((x) => x.id === id);
    if (!e) return false;
    if (typeof username === 'string') e.username = username.trim();
    if (typeof password === 'string' && password) e.pw = await enc(password);
    e.updated = Date.now();
    save();
    return true;
  }));
  ipcMain.handle('ghost:pwm-delete', guard((id) => {
    const d = load();
    d.entries = d.entries.filter((x) => x.id !== id);
    save();
    return true;
  }));
  ipcMain.handle('ghost:pwm-never', guard(() => load().never.map((o) => ({ origin: o, site: pretty(o) }))));
  ipcMain.handle('ghost:pwm-never-remove', guard((origin) => {
    const d = load();
    d.never = d.never.filter((o) => o !== origin);
    save();
    return true;
  }));
  ipcMain.handle('ghost:pwm-info', guard(async () => ({ encryption: await safeStorage.isAsyncEncryptionAvailable(), count: load().entries.length })));
}

// ---- Sicherung (Export/Import, verschlüsselt durch src/main/backup.js) ----
async function exportAll() {
  const d = load();
  const entries = [];
  for (const e of d.entries) {
    let password = '';
    try { password = await dec(e.pw); } catch { continue; }
    entries.push({ origin: e.origin, username: e.username, password, created: e.created, updated: e.updated });
  }
  return { entries, never: [...d.never] };
}

async function importAll(x) {
  const d = load();
  let n = 0;
  for (const e of (x && x.entries) || []) {
    if (!/^https?:\/\//.test(e.origin || '') || !e.password) continue;
    const username = String(e.username || '').slice(0, 256);
    const pw = await enc(String(e.password).slice(0, 512));
    const ex = d.entries.find((y) => y.origin === e.origin && y.username === username);
    if (ex) Object.assign(ex, { pw, updated: Date.now() });
    else d.entries.push({ id: crypto.randomUUID(), origin: e.origin, username, pw, created: e.created || Date.now(), updated: Date.now(), used: 0 });
    n++;
  }
  for (const o of (x && x.never) || []) if (/^https?:\/\//.test(o) && !d.never.includes(o)) d.never.push(o);
  save();
  return n;
}

module.exports = { setup, exportAll, importAll };
