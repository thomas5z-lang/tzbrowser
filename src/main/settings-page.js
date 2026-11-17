'use strict';
// Einstellungsseite (tzbrowser://einstellungen): alle Optionen an einem Ort.
// Nur die interne Seite src/ui/settings.html darf diese Schnittstelle benutzen.

const { app, ipcMain, dialog, shell, BrowserWindow } = require('electron');
const path = require('path');
const settings = require('./settings');
const tts = require('./tts');
const vorleser = require('./vorleser');
const privacy = require('./privacy');
const api = require('./api');
const backup = require('./backup');

const PAGE = /[\\/]src[\\/]ui[\\/]settings\.html$/i;
let hooks = {};

const voices = () => [...tts.voices().map((v) => [v, tts.voiceName(v)])];
const tempi = (list) => list.map((v) => [v, `${v.toFixed(1)}×`]);

// Aufbau der Seite. type: bool | select | text | number | list
const SCHEMA = () => [
  { section: 'Design', key: '@design', label: 'Aussehen von TZBrowser', type: 'design' },
  { section: 'Allgemein', key: 'restoreSession', label: 'Tabs vom letzten Mal wiederherstellen', type: 'bool', def: true, note: 'Private Tabs werden nie gespeichert. Tabs laden erst beim Anklicken.' },
  { section: 'Allgemein', key: 'tabSleepMin', label: 'Unbenutzte Tabs schlafen legen nach', type: 'select', def: 30, options: [[0, 'Nie'], [15, '15 Minuten'], [30, '30 Minuten'], [60, '1 Stunde'], [120, '2 Stunden']], note: 'Spart Arbeitsspeicher. Tabs mit Ton oder getipptem Text bleiben wach.' },

  { section: 'Datenschutz', key: 'dns', label: 'Verschlüsseltes DNS', type: 'select', def: 'cloudflare', options: Object.entries(privacy.DNS).map(([k, d]) => [k, d.label]), note: 'Dein Internetanbieter sieht nicht mehr, welche Seiten du aufrufst.', apply: () => privacy.applyDns() },
  { section: 'Datenschutz', key: 'dnsStrict', label: 'Streng: nie unverschlüsselt zurückfallen', type: 'bool', apply: () => privacy.applyDns() },
  { section: 'Datenschutz', key: 'forceDark', label: 'Alle Seiten dunkel darstellen (Dark Mode erzwingen)', type: 'bool', restart: true },

  { section: 'YouTube & Twitch', key: 'youtubeAds', label: 'YouTube: Videowerbung überspringen', type: 'bool' },
  { section: 'YouTube & Twitch', key: 'sponsorblock', label: 'YouTube: Sponsoren überspringen (SponsorBlock)', type: 'bool' },
  { section: 'YouTube & Twitch', key: 'dislikes', label: 'YouTube: Dislikes anzeigen', type: 'bool' },
  { section: 'YouTube & Twitch', key: 'twitchAds', label: 'Twitch: Werbung blockieren (Purple AdBlock)', type: 'bool' },
  { section: 'YouTube & Twitch', key: 'twitchPoints', label: 'Twitch: Kanalpunkte automatisch abholen', type: 'bool' },

  { section: 'Vorlesen', key: 'readVoice', label: 'Stimme für „Vorlesen“', type: 'select', def: 'windows', options: [['windows', 'Windows-Stimme (sofort, ohne KI)'], ...voices()] },
  { section: 'Vorlesen', key: 'readTempo', label: 'Tempo', type: 'select', def: 1, options: tempi([0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6]) },
  { section: 'Vorlesen', key: 'vorleserDir', label: 'Ordner des Sprach-Add-ons („Stimme“)', type: 'text', def: tts.DEFAULT_DIR, action: ['pickVorleserDir', 'Ordner wählen …'] },

  { section: 'Untertitel-Vorleser', key: 'animeVorleser.an', label: 'Untertitel vorlesen (Crunchyroll, Netflix, Prime, Disney+, YouTube …)', type: 'bool' },
  { section: 'Untertitel-Vorleser', key: 'animeVorleser.stimme', label: 'Erzähler-Stimme', type: 'select', options: voices() },
  { section: 'Untertitel-Vorleser', key: 'animeVorleser.geschlecht', label: 'Männer und Frauen unterschiedlich (Crunchyroll)', type: 'bool' },
  { section: 'Untertitel-Vorleser', key: 'animeVorleser.stimmeM', label: 'Männerstimme', type: 'select', options: voices() },
  { section: 'Untertitel-Vorleser', key: 'animeVorleser.stimmeW', label: 'Frauenstimme', type: 'select', options: voices() },
  { section: 'Untertitel-Vorleser', key: 'animeVorleser.tempo', label: 'Sprechtempo', type: 'select', options: tempi([0.8, 0.9, 1, 1.1, 1.2, 1.4]) },
  { section: 'Untertitel-Vorleser', key: 'animeVorleser.original', label: 'Lautstärke Originalton', type: 'select', options: [0, 10, 15, 25, 40, 60].map((v) => [v, `${v} %`]) },
  { section: 'Untertitel-Vorleser', key: 'animeVorleser.lautstaerke', label: 'Lautstärke Vorleser', type: 'select', options: [60, 80, 100, 130, 160].map((v) => [v, `${v} %`]) },
  { section: 'Untertitel-Vorleser', key: 'animeVorleser.schilder', label: 'Schilder und Einblendungen mitlesen (Crunchyroll)', type: 'bool' },

  { section: 'Übersetzen', key: 'translateAuto', label: 'Fremdsprachige Seiten automatisch auf Deutsch', type: 'bool', def: false, note: 'Seitentext wird dafür an den gewählten Übersetzer geschickt (Google oder lokal Ollama).' },
  { section: 'Übersetzen', key: 'translateEngine', label: 'Übersetzer', type: 'select', def: 'google', options: [['google', 'Google (schnell)'], ['ollama', 'Ollama (lokal, privat, langsamer)']], note: 'Private Tabs nutzen immer Ollama, nie Google.' },
  { section: 'Übersetzen', key: 'translateModel', label: 'Ollama-Modell für Übersetzungen', type: 'text', def: 'qwen2.5:7b' },
  { section: 'Übersetzen', key: 'translateNeverHosts', label: 'Diese Seiten nie übersetzen (eine pro Zeile)', type: 'list' },
  { section: 'Übersetzen', key: 'translateNeverLangs', label: 'Diese Sprachen nie übersetzen (Kürzel, z. B. en)', type: 'list' },

  { section: 'Sicherung', key: '@backup', label: 'Lesezeichen, Passwörter und Einstellungen in eine verschlüsselte Datei sichern – z. B. für einen neuen PC oder das Notebook', type: 'backup' },
  { section: 'KI', key: 'ollamaUrl', label: 'Ollama-Adresse (TZBrowser KI)', type: 'text', def: 'http://localhost:11434' },
  { section: 'KI', key: 'aiModel', label: 'Standard-Modell für TZBrowser KI', type: 'text' },
  { section: 'KI', key: 'apiEnabled', label: 'KI-Schnittstelle für KI-Assistenten wie Claude (nur 127.0.0.1)', type: 'bool', apply: (v) => api.setEnabled(v) },
  { section: 'KI', key: 'apiPort', label: 'Port der KI-Schnittstelle', type: 'number', def: 47800, apply: () => { if (api.enabled()) { api.setEnabled(false); api.setEnabled(true); } } },
];

function getValue(item) {
  if (item.key.startsWith('@')) return null;
  if (item.key.startsWith('animeVorleser.')) return vorleser.einst()[item.key.split('.')[1]];
  const v = settings.get(item.key);
  return v === undefined ? item.def : v;
}

function setValue(item, value) {
  if (item.type === 'bool') value = !!value;
  else if (item.type === 'number') value = Math.max(1024, Math.min(65535, Math.round(Number(value) || item.def)));
  else if (item.type === 'list') value = (Array.isArray(value) ? value : String(value).split(/[\n,]/)).map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 500);
  else if (item.type === 'select') {
    const opt = (item.options || []).find(([v]) => String(v) === String(value));
    if (!opt) throw new Error('ungültige Auswahl');
    value = opt[0];
  } else value = String(value || '').trim().slice(0, 500);
  if (item.key === 'ollamaUrl' && value && !/^https?:\/\/[^\s]+$/i.test(value)) throw new Error('Adresse muss mit http:// beginnen');
  if (item.key.startsWith('animeVorleser.')) vorleser.setEinst({ [item.key.split('.')[1]]: value });
  else settings.set(item.key, value);
  if (item.apply) item.apply(value);
  return value;
}

function isPage(event) {
  const url = event.senderFrame && event.senderFrame.url;
  try { return !!url && url.startsWith('file:') && PAGE.test(decodeURIComponent(new URL(url).pathname)); } catch { return false; }
}

function setup(h) {
  hooks = h || {};
  const guard = (fn) => (event, ...args) => {
    if (!isPage(event)) throw new Error('nicht erlaubt');
    return fn(event, ...args);
  };
  ipcMain.handle('ghost:set-schema', guard(async () => {
    await tts.status(); // Stimmenliste auffrischen, falls der Sprach-Server läuft
    return {
      version: app.getVersion(),
      items: SCHEMA().map(({ apply, ...s }) => ({ ...s, value: getValue(s) })),
    };
  }));
  ipcMain.handle('ghost:set-save', guard((_e, { key, value }) => {
    const item = SCHEMA().find((s) => s.key === key);
    if (!item) throw new Error('unbekannte Einstellung');
    return { value: setValue(item, value), restart: !!item.restart };
  }));
  ipcMain.handle('ghost:set-action', guard(async (event, name, arg) => {
    if (name === 'backupExport') {
      const r = await backup.exportTo(BrowserWindow.fromWebContents(event.sender) || undefined, arg && arg.pass);
      return r ? `✓ Gesichert: ${r.bookmarks} Lesezeichen, ${r.passwords} Passwörter → ${r.file}` : '';
    }
    if (name === 'backupImport') {
      const r = await backup.importFrom(BrowserWindow.fromWebContents(event.sender) || undefined, arg && arg.pass, !!(arg && arg.settings));
      return r ? `✓ Übernommen: ${r.bookmarks} neue Lesezeichen, ${r.passwords} Passwörter${r.settings ? `, ${r.settings} Einstellungen (Neustart empfohlen)` : ''}` : '';
    }
    const win = BrowserWindow.fromWebContents(event.sender) || undefined;
    if (name === 'pickVorleserDir') {
      const r = await dialog.showOpenDialog(win, { title: 'Ordner des Sprach-Add-ons (mit server.py)', defaultPath: tts.dir(), properties: ['openDirectory'] });
      if (!r.canceled && r.filePaths[0]) settings.set('vorleserDir', r.filePaths[0]);
      return tts.dir();
    }
    if (name === 'openData') { shell.openPath(app.getPath('userData')); return true; }
    if (name === 'restart') { app.relaunch(); app.quit(); return true; }
    return false;
  }));
}

// Für das Schnellmenü in der Werkzeugleiste: ausgewählte Einstellungen lesen/ändern
function quickItems(keys) {
  const all = SCHEMA();
  return keys.map((k) => all.find((s) => s.key === k)).filter(Boolean).map(({ apply, action, ...s }) => ({ ...s, value: getValue(s) }));
}

function setKey(key, value) {
  const item = SCHEMA().find((s) => s.key === key);
  if (!item) throw new Error('unbekannte Einstellung');
  return { value: setValue(item, value), restart: !!item.restart };
}

module.exports = { setup, quickItems, setKey, isPage, PAGE_FILE: path.join(__dirname, '..', 'ui', 'settings.html') };
