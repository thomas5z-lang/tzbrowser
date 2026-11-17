'use strict';
// Download-Verwaltung: normale Downloads und Video-Downloads in einer Liste.

const { shell } = require('electron');
const path = require('path');
const { downloadsDir, uniquePath } = require('./paths');

const entries = []; // neueste zuerst
let seq = 0;
let emit = () => {};
let lastEmit = 0;

function summary() {
  const active = entries.filter((e) => e.state === 'progressing');
  const known = active.filter((e) => e.progress != null);
  const progress = known.length ? known.reduce((s, e) => s + e.progress, 0) / known.length : null;
  return { active: active.length, progress, total: entries.length };
}

function changed(force = false) {
  const now = Date.now();
  if (!force && now - lastEmit < 250) return;
  lastEmit = now;
  emit(summary());
}

// Neuen Eintrag anlegen (auch für Video-Downloads genutzt)
function add({ name, kind = 'file', cancel = null }) {
  const entry = { id: ++seq, name, kind, path: '', progress: null, state: 'progressing', speed: '', cancel, started: Date.now() };
  entries.unshift(entry);
  if (entries.length > 50) entries.pop();
  changed(true);
  return entry;
}

function update(entry, fields, force = false) {
  Object.assign(entry, fields);
  changed(force || fields.state !== undefined);
}

function setup(session, emitFn) {
  emit = emitFn;
  session.on('will-download', (_e, item) => {
    const savePath = uniquePath(downloadsDir(), item.getFilename());
    item.setSavePath(savePath);
    const entry = add({ name: path.basename(savePath), cancel: () => item.cancel() });
    entry.path = savePath;

    item.on('updated', (_ev, state) => {
      const total = item.getTotalBytes();
      update(entry, {
        progress: total > 0 ? item.getReceivedBytes() / total : null,
        state: state === 'interrupted' ? 'progressing' : entry.state,
        speed: fmtBytes(item.getCurrentBytesPerSecond()) + '/s',
      });
    });
    item.once('done', (_ev, state) => {
      update(entry, {
        state: state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'failed',
        progress: state === 'completed' ? 1 : entry.progress,
        cancel: null,
      }, true);
    });
  });
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i];
}

const ICON = { progressing: '⬇', completed: '✓', cancelled: '✕', failed: '⚠' };

// Einträge für das native Download-Menü
function menuTemplate() {
  const items = [];
  if (!entries.length) items.push({ label: 'Noch keine Downloads', enabled: false });
  for (const e of entries.slice(0, 15)) {
    const pct = e.state === 'progressing' && e.progress != null ? ` ${Math.round(e.progress * 100)} %` : '';
    const name = e.name.length > 50 ? e.name.slice(0, 48) + '…' : e.name;
    const sub = [];
    if (e.state === 'completed' && e.path) {
      sub.push({ label: 'Öffnen', click: () => shell.openPath(e.path) });
      sub.push({ label: 'Im Ordner anzeigen', click: () => shell.showItemInFolder(e.path) });
    }
    if (e.state === 'progressing') {
      if (e.speed) sub.push({ label: e.speed, enabled: false });
      if (e.cancel) sub.push({ label: 'Abbrechen', click: () => e.cancel() });
    }
    if (e.state === 'failed' && e.error) sub.push({ label: e.error.slice(0, 80), enabled: false });
    if (!sub.length) sub.push({ label: 'Keine Aktion', enabled: false });
    items.push({ label: `${ICON[e.state] || ''} ${e.kind === 'video' ? '🎬 ' : ''}${name}${pct}`, submenu: sub });
  }
  items.push(
    { type: 'separator' },
    { label: 'Download-Ordner öffnen', click: () => shell.openPath(downloadsDir()) },
    {
      label: 'Fertige aus der Liste entfernen',
      enabled: entries.some((e) => e.state !== 'progressing'),
      click: () => {
        for (let i = entries.length - 1; i >= 0; i--) if (entries[i].state !== 'progressing') entries.splice(i, 1);
        changed(true);
      },
    },
  );
  return items;
}

module.exports = { setup, add, update, menuTemplate, summary, fmtBytes };
