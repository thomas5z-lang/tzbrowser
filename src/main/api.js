'use strict';
// KI-Schnittstelle: kleine HTTP-API nur auf 127.0.0.1, damit Claude & Co.
// TZBrowser steuern können. Standardmäßig AUS. Schutz:
//  - nur Anfragen mit geheimem Schlüssel (%APPDATA%\TZBrowser\api-token.txt)
//  - Anfragen von Webseiten (mit Origin-Kopfzeile) werden abgewiesen
//  - private Tabs sind für die KI unsichtbar
//  - keine Passwörter, kein Absenden von Formularen, kein Skript-Ausführen

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const settings = require('./settings');

const DEFAULT_PORT = 47800;
let server = null;
let h = null; // Hooks aus main.js

const port = () => Number(settings.get('apiPort')) || DEFAULT_PORT;
const tokenFile = () => path.join(app.getPath('userData'), 'api-token.txt');

function token() {
  let t = '';
  try { t = fs.readFileSync(tokenFile(), 'utf8').trim(); } catch { /* neu */ }
  if (t.length < 20) {
    t = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(tokenFile(), t);
  }
  return t;
}

function newToken() {
  fs.writeFileSync(tokenFile(), crypto.randomBytes(24).toString('hex'));
  return token();
}

function sameToken(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const webUrl = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

function send(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (d) => { size += d.length; if (size > 1e6) { reject(new Error('zu groß')); req.destroy(); } else parts.push(d); });
    req.on('end', () => {
      const s = Buffer.concat(parts).toString('utf8').trim();
      if (!s) return resolve({});
      try { resolve(JSON.parse(s)); } catch { reject(new Error('kein gültiges JSON')); }
    });
    req.on('error', reject);
  });
}

const ROUTES = [
  ['GET', /^\/v1\/status$/, () => h.status()],
  ['GET', /^\/v1\/tabs$/, () => ({ tabs: h.listTabs() })],
  ['GET', /^\/v1\/tabs\/(\d+)\/text$/, (m, b, q) => h.tabText(Number(m[1]), Math.min(Number(q.get('max')) || 20000, 200000))],
  ['POST', /^\/v1\/open$/, (m, b) => {
    const url = webUrl(b.url);
    if (!url) throw Object.assign(new Error('url muss mit http:// oder https:// beginnen'), { code: 400 });
    return h.open(url, b.background !== true);
  }],
  ['POST', /^\/v1\/search$/, (m, b) => h.open('https://duckduckgo.com/?q=' + encodeURIComponent(String(b.q || '')), b.background !== true)],
  ['POST', /^\/v1\/tabs\/(\d+)\/navigate$/, (m, b) => {
    const url = webUrl(b.url);
    if (!url) throw Object.assign(new Error('url muss mit http:// oder https:// beginnen'), { code: 400 });
    return h.navigate(Number(m[1]), url);
  }],
  ['POST', /^\/v1\/tabs\/(\d+)\/activate$/, (m) => h.activate(Number(m[1]))],
  ['POST', /^\/v1\/tabs\/(\d+)\/close$/, (m) => h.close(Number(m[1]))],
  ['POST', /^\/v1\/tabs\/(\d+)\/translate$/, (m, b) => h.translate(Number(m[1]), b.mode === 'original' ? 'original' : 'translate')],
  ['POST', /^\/v1\/tabs\/(\d+)\/video$/, (m, b) => h.video(Number(m[1]), String(b.format || 'best'))],
  ['POST', /^\/v1\/speak$/, (m, b) => h.speak(b)],
  ['POST', /^\/v1\/speak\/stop$/, () => h.speakStop()],
];

async function handler(req, res) {
  try {
    // Webseiten dürfen die Schnittstelle nie benutzen (Browser senden immer Origin mit)
    if (req.headers.origin) return send(res, 403, { error: 'Zugriff von Webseiten nicht erlaubt' });
    const host = String(req.headers.host || '');
    if (!new RegExp(`^(127\\.0\\.0\\.1|localhost):${port()}$`).test(host)) return send(res, 403, { error: 'falscher Host' });
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!sameToken(auth, token())) return send(res, 401, { error: 'Schlüssel fehlt oder falsch (Authorization: Bearer …)' });

    const u = new URL(req.url, 'http://127.0.0.1');
    for (const [method, re, fn] of ROUTES) {
      const m = re.exec(u.pathname);
      if (!m) continue;
      if (req.method !== method) return send(res, 405, { error: 'falsche Methode' });
      const body = method === 'POST' ? await readBody(req) : {};
      const result = await fn(m, body, u.searchParams);
      if (result === null || result === undefined) return send(res, 404, { error: 'Tab nicht gefunden' });
      console.log(`[api] ${method} ${u.pathname}`);
      return send(res, 200, result);
    }
    return send(res, 404, { error: 'unbekannt', hilfe: 'siehe docs/KI-SCHNITTSTELLE.md' });
  } catch (e) {
    return send(res, e.code || 500, { error: e.message });
  }
}

function start() {
  if (server) return;
  token();
  server = http.createServer(handler);
  server.on('error', (e) => { console.error('[api] ' + e.message); server = null; });
  server.listen(port(), '127.0.0.1', () => console.log(`[api] KI-Schnittstelle läuft auf http://127.0.0.1:${port()}`));
}

function stop() {
  if (server) { server.close(); server = null; console.log('[api] KI-Schnittstelle aus'); }
}

function setup(hooks) {
  h = hooks;
  if (settings.get('apiEnabled')) start();
}

function setEnabled(on) {
  settings.set('apiEnabled', !!on);
  if (on) start(); else stop();
}

const enabled = () => !!server;

module.exports = { setup, setEnabled, enabled, newToken, tokenFile, port };
