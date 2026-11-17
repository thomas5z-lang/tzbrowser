'use strict';
// Sitzung: offene Fenster und Tabs merken und beim nächsten Start wiederherstellen.
// Private Tabs und interne TZBrowser-Seiten werden nie gespeichert.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'session.json');

function snapshot(windows) {
  return {
    saved: Date.now(),
    windows: [...windows].map((w) => ({
      bounds: w.win.isMaximized() || w.win.isFullScreen() ? w.normalBounds || w.win.getBounds() : w.win.getBounds(),
      maximized: w.win.isMaximized(),
      ...w.tabs.snapshot(),
    })).filter((x) => x.tabs.length),
  };
}

function save(windows) {
  if (!windows.size) return;
  try {
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot(windows)));
    fs.renameSync(tmp, file());
  } catch (e) { console.error('[sitzung] ' + e.message); }
}

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return Array.isArray(s.windows) ? s.windows.filter((w) => Array.isArray(w.tabs) && w.tabs.length) : [];
  } catch { return []; }
}

module.exports = { save, load };
