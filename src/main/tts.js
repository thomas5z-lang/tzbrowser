'use strict';
// Sprachausgabe über den lokalen Sprach-Server des Anime-Vorlesers
// (OmniVoice / Piper, nur auf 127.0.0.1:5577). TZBrowser startet ihn bei Bedarf
// selbst und beendet ihn wieder, wenn TZBrowser ihn gestartet hat.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const SERVER = 'http://127.0.0.1:5577';
const DEFAULT_DIR = require('path').join(require('os').homedir(), 'TZBrowser-Stimme'); // Add-on „Stimme“ (addons/stimme)

// Anzeigenamen der Stimmen (wie im Anime-Vorleser)
const NAMES = {
  omni_erzaehler: 'KI: Erzähler (Mann, tief)',
  omni_mann: 'KI: Mann (jung)',
  omni_frau: 'KI: Frau (jung)',
  omni_frau_tief: 'KI: Frau (tief)',
  'de_DE-thorsten-high': 'Piper: Thorsten (schnell)',
  'de_DE-thorsten_emotional-medium': 'Piper: Thorsten emotional',
  'de_DE-kerstin-low': 'Piper: Kerstin',
  'de_DE-ramona-low': 'Piper: Ramona',
};

let proc = null; // von TZBrowser gestarteter Server
let starting = null;
let lastStatus = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = () => settings.get('vorleserDir') || DEFAULT_DIR;

function installed() {
  return fs.existsSync(path.join(dir(), 'server.py'));
}

function python() {
  for (const v of ['venv_omni', 'venv']) {
    const p = path.join(dir(), v, 'Scripts', 'python.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function voiceName(id) {
  return NAMES[id] || String(id).replace(/^eigen_/, 'Eigene: ');
}

// Node-fetch statt Electron-net: geht nie über den VPN-Proxy
async function request(p, opts = {}, timeoutMs = 120000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(SERVER + p, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function status() {
  try {
    const r = await request('/status', {}, 2500);
    if (r.ok) { lastStatus = await r.json(); return lastStatus; }
  } catch { /* läuft nicht */ }
  return null;
}

// Server sicherstellen (startet ihn bei Bedarf, dauert beim ersten Mal ca. 20 s)
async function ensure(onWait) {
  const s = await status();
  if (s && s.ok) return s;
  if (!starting) {
    starting = (async () => {
      const py = python();
      if (!installed() || !py) throw new Error(`Sprach-Server nicht gefunden (${dir()})`);
      if (onWait) onWait();
      console.log('[tts] starte Sprach-Server');
      proc = spawn(py, ['-u', path.join(dir(), 'server.py')], { cwd: dir(), windowsHide: true, stdio: 'ignore' });
      proc.on('exit', () => { proc = null; });
      for (let i = 0; i < 120; i++) {
        await sleep(1000);
        const s2 = await status();
        if (s2 && s2.ok) { console.log(`[tts] Sprach-Server bereit nach ${i + 1} s`); return s2; }
        if (!proc) break;
      }
      throw new Error('Sprach-Server startet nicht');
    })().finally(() => { starting = null; });
  } else if (onWait) onWait();
  return starting;
}

// Text -> WAV (Buffer)
async function speak(text, voice, tempo = 1, maxSek = null) {
  await ensure();
  const r = await request('/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, stimme: voice, tempo, max_sek: maxSek }),
  });
  if (!r.ok) throw new Error(`Sprach-Server meldet Fehler ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Rohzugriff für den Anime-Vorleser (Sprecher-Erkennung usw.)
async function raw(p, body) {
  await ensure();
  const r = await request(p, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

function voices() {
  return (lastStatus && lastStatus.stimmen) || Object.keys(NAMES);
}

function running() {
  return !!(lastStatus && lastStatus.ok);
}

// Nur einen selbst gestarteten Server beenden
function shutdown() {
  if (!proc) return;
  // venv-python startet einen zweiten Prozess – den ganzen Baum beenden
  try { spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }); } catch { /* egal */ }
  proc = null;
}

module.exports = { ensure, speak, raw, status, voices, voiceName, running, installed, shutdown, dir, DEFAULT_DIR };
