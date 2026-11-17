'use strict';
// Pfade für Entwicklung und installierte Version

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// bin\ mit ffmpeg/ffprobe/wgcf/wireproxy: im Projekt bzw. in resources\bin der installierten App
function binDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(__dirname, '..', '..', 'bin');
}

function downloadsDir() {
  return app.getPath('downloads');
}

function videoDir() {
  const dir = path.join(app.getPath('downloads'), 'TZBrowser');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Freien Dateinamen finden: datei.zip -> datei (1).zip
function uniquePath(dir, name) {
  const safe = String(name || 'download').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'download';
  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length);
  let candidate = path.join(dir, safe);
  for (let i = 1; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`);
  return candidate;
}

module.exports = { binDir, downloadsDir, videoDir, uniquePath };
