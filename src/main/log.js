'use strict';
// Protokoll in eine Datei statt in ein Konsolenfenster:
// %APPDATA%\TZBrowser\ghost.log (wird beim Start ab 2 MB neu begonnen)

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const util = require('util');

function setupLog() {
  const file = path.join(app.getPath('userData'), 'ghost.log');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) fs.rmSync(file);
  } catch { /* egal */ }
  const write = (level, args) => {
    const line = `${new Date().toISOString()} [${level}] ${util.format(...args)}\n`;
    fs.appendFile(file, line, () => {});
  };
  for (const level of ['log', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => { write(level, args); orig(...args); };
  }
  process.on('uncaughtException', (err) => write('error', ['Unbehandelter Fehler:', err && err.stack || err]));
  process.on('unhandledRejection', (err) => write('error', ['Unbehandeltes Promise:', err && err.stack || err]));
  console.log(`TZBrowser ${app.getVersion()} startet (Electron ${process.versions.electron})`);
}

module.exports = { setupLog };
