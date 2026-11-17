'use strict';
// VPN über Cloudflare WARP – nur für TZBrowser, ohne Systemeingriff und ohne Admin-Rechte.
//  1. wgcf legt einmalig ein kostenloses WARP-Konto an (nach Zustimmung des Nutzers)
//  2. wireproxy baut daraus einen WireGuard-Tunnel und bietet ihn als SOCKS5-Proxy an
//  3. Alle TZBrowser-Sitzungen nutzen diesen Proxy; DNS läuft ebenfalls durch den Tunnel

const { app, dialog, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { binDir } = require('./paths');

const PORT = 40123;
const PROXY = `socks5://127.0.0.1:${PORT}`;
const TOS_URL = 'https://www.cloudflare.com/application/terms/';

const sessions = new Set();
let proc = null;
let state = 'off'; // off | starting | on | error
let info = null; // { ip, loc, warp }
let onChange = () => {};

const warpDir = () => path.join(app.getPath('userData'), 'warp');
const exe = (name) => path.join(binDir(), name);

function setState(s, extra = {}) {
  state = s;
  if ('info' in extra) info = extra.info;
  onChange(status());
}

function status() {
  return { state, info };
}

// Neue Sitzung (z. B. Container) registrieren
async function attach(ses) {
  sessions.add(ses);
  if (state === 'on') await ses.setProxy({ proxyRules: PROXY, proxyBypassRules: '<local>' });
}

async function applyProxy(on) {
  for (const ses of sessions) {
    await ses.setProxy(on ? { proxyRules: PROXY, proxyBypassRules: '<local>' } : { mode: 'system' });
    await ses.closeAllConnections();
  }
}

function run(file, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd, windowsHide: true, timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || stdout || err.message).toString().trim().split('\n').pop()));
      else resolve(stdout.toString());
    });
  });
}

// Einmalig: WARP-Konto anlegen und WireGuard-Profil erzeugen
async function ensureProfile(parentWin) {
  const dir = warpDir();
  const profile = path.join(dir, 'wgcf-profile.conf');
  if (fs.existsSync(profile)) return profile;
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(path.join(dir, 'wgcf-account.toml'))) {
    const { response } = await dialog.showMessageBox(parentWin, {
      type: 'question',
      buttons: ['Zustimmen und verbinden', 'Bedingungen ansehen', 'Abbrechen'],
      defaultId: 0,
      cancelId: 2,
      title: 'TZBrowser – VPN einrichten',
      message: 'TZBrowser nutzt für das VPN den kostenlosen Dienst Cloudflare WARP.',
      detail: 'Dafür wird einmalig ein anonymes WARP-Gerät registriert (ohne E-Mail, ohne Konto-Daten von dir). '
        + 'Es gelten die Nutzungsbedingungen von Cloudflare.\n\n'
        + 'Hinweis: WARP verschlüsselt und verbirgt deine IP-Adresse vor Webseiten, ist aber kein Anonymisierungsdienst wie Tor.',
    });
    if (response === 1) { shell.openExternal(TOS_URL); return null; }
    if (response !== 0) return null;
    await run(exe('wgcf.exe'), ['register', '--accept-tos', '--name', 'TZBrowser', '--model', 'TZBrowser Browser'], dir);
  }
  await run(exe('wgcf.exe'), ['generate'], dir);
  return profile;
}

function writeWireproxyConfig(profile) {
  const cfg = path.join(warpDir(), 'wireproxy.conf');
  fs.writeFileSync(cfg, `WGConfig = ${profile}\n\n[Socks5]\nBindAddress = 127.0.0.1:${PORT}\n`);
  return cfg;
}

function waitForPort(ms = 15_000) {
  const until = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect(PORT, '127.0.0.1');
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > until) reject(new Error('wireproxy startet nicht'));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

// Prüfen, ob der Verkehr wirklich über WARP läuft
async function checkTrace() {
  const ses = [...sessions][0];
  const res = await ses.fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' });
  const text = await res.text();
  const get = (k) => (new RegExp(`^${k}=(.*)$`, 'm').exec(text) || [])[1] || '';
  return { ip: get('ip'), loc: get('loc'), warp: get('warp') };
}

async function start(parentWin) {
  if (state === 'on' || state === 'starting') return;
  setState('starting');
  try {
    const profile = await ensureProfile(parentWin);
    if (!profile) return setState('off');
    const cfg = writeWireproxyConfig(profile);
    proc = spawn(exe('wireproxy.exe'), ['-s', '-c', cfg], { windowsHide: true });
    proc.on('exit', () => {
      proc = null;
      if (state === 'on' || state === 'starting') {
        applyProxy(false);
        setState('error', { info: null });
      }
    });
    await waitForPort();
    await applyProxy(true);
    const trace = await checkTrace();
    if (trace.warp !== 'on' && trace.warp !== 'plus') throw new Error('Verbindung läuft nicht über WARP');
    setState('on', { info: trace });
  } catch (err) {
    console.warn('[vpn]', err.message);
    await stop();
    setState('error', { info: null });
    dialog.showMessageBox(parentWin, { type: 'warning', title: 'TZBrowser – VPN', message: 'Das VPN konnte nicht verbunden werden.', detail: err.message });
  }
}

async function stop() {
  const p = proc;
  proc = null;
  if (p) p.kill();
  await applyProxy(false);
  setState('off', { info: null });
}

function toggle(parentWin) {
  return state === 'on' || state === 'starting' ? stop() : start(parentWin);
}

function setup(changeCallback) {
  onChange = changeCallback;
  app.on('will-quit', () => { if (proc) proc.kill(); });
}

const isOn = () => state === 'on';

module.exports = { setup, attach, toggle, start, stop, status, isOn };
