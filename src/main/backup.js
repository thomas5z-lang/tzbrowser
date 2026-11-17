'use strict';
// Sicherung: Lesezeichen, Passwörter und Einstellungen in EINE verschlüsselte Datei
// (AES-256-GCM, Schlüssel aus deinem Sicherungs-Passwort über scrypt). Ohne das Passwort
// ist die Datei wertlos – auch für dich. Damit kannst du TZBrowser auf einen anderen PC umziehen.

const { app, dialog } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');
const passwords = require('./passwords');
const library = require('./library');

const MAGIC = Buffer.from('GHOSTBAK1');
const deriveKey = (pass, salt) => crypto.scryptSync(String(pass), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 });

async function exportTo(win, pass) {
  if (!pass || String(pass).length < 8) throw new Error('Bitte ein Sicherungs-Passwort mit mindestens 8 Zeichen eingeben');
  const date = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'TZBrowser-Sicherung speichern',
    defaultPath: path.join(app.getPath('documents'), `TZBrowser-Sicherung-${date}.ghostbackup`),
    filters: [{ name: 'TZBrowser-Sicherung', extensions: ['ghostbackup'] }],
  });
  if (canceled || !filePath) return null;
  const pw = await passwords.exportAll();
  const bookmarks = library.exportBookmarks();
  const payload = JSON.stringify({ v: 1, created: new Date().toISOString(), ghost: app.getVersion(), settings: settings.all(), bookmarks, passwords: pw });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', deriveKey(pass, salt), iv);
  const enc = Buffer.concat([c.update(payload, 'utf8'), c.final()]);
  fs.writeFileSync(filePath, Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), enc]));
  return { file: filePath, bookmarks: bookmarks.length, passwords: pw.entries.length };
}

async function importFrom(win, pass, withSettings) {
  if (!pass) throw new Error('Bitte das Sicherungs-Passwort eingeben');
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'TZBrowser-Sicherung einlesen',
    defaultPath: app.getPath('documents'),
    filters: [{ name: 'TZBrowser-Sicherung', extensions: ['ghostbackup'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  const buf = fs.readFileSync(filePaths[0]);
  if (buf.length < 60 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Das ist keine TZBrowser-Sicherung');
  let o = MAGIC.length;
  const salt = buf.subarray(o, o += 16);
  const iv = buf.subarray(o, o += 12);
  const tag = buf.subarray(o, o += 16);
  let data;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(pass, salt), iv);
    d.setAuthTag(tag);
    data = JSON.parse(Buffer.concat([d.update(buf.subarray(o)), d.final()]).toString('utf8'));
  } catch {
    throw new Error('Falsches Passwort oder beschädigte Datei');
  }
  const nb = library.mergeBookmarks(data.bookmarks);
  const np = await passwords.importAll(data.passwords);
  let ns = 0;
  if (withSettings && data.settings && typeof data.settings === 'object') {
    for (const [k, v] of Object.entries(data.settings)) { settings.set(k, v); ns++; }
  }
  return { bookmarks: nb, passwords: np, settings: ns, from: data.created };
}

module.exports = { exportTo, importFrom };
