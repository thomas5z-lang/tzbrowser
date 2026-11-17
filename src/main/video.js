'use strict';
// Medien-Downloader (öffentliche Version):
// erkennt frei abrufbare Mediendateien und Streams auf Webseiten und speichert sie.
// - direkte Dateien (MP4, WebM, MP3 …) über den normalen Download
// - HLS/DASH-Streams werden mit ffmpeg ohne Neukodierung zu MP4 zusammengesetzt
// Ein Downloader für Videoplattformen (YouTube & Co.) ist bewusst NICHT enthalten,
// weil deren Nutzungsbedingungen das Herunterladen meist untersagen.
// Kopiergeschützte Inhalte (DRM, z. B. Netflix) können grundsätzlich nicht gespeichert werden.

const { shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { binDir, videoDir, uniquePath } = require('./paths');
const downloads = require('./downloads');

// Plattformen, deren Medien-Schnipsel wir nicht anzeigen
const SKIP_HOSTS = /(googlevideo\.com|youtube\.com|ytimg\.com|ttvnw\.net|twitch\.tv|tiktokcdn|fbcdn\.net|cdninstagram|twimg\.com|nflxvideo\.net|crunchyroll|vrv\.co|disney|primevideo|aiv-cdn)/i;
const MEDIA_TYPE = /^(video\/|audio\/|application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i;
const SEGMENT = /\.(ts|m4s|aac|m4a)(\?|$)|\/seg[-_]?\d|\/chunk[-_]?\d|init\.mp4/i;

const detected = new Map(); // webContentsId -> [{url, type, size}]
let onChange = () => {};

function header(headers, name) {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name);
  return key ? String(headers[key][0] || '') : '';
}

function setup(session, changeCallback) {
  onChange = changeCallback;
  session.webRequest.onResponseStarted({ urls: ['http://*/*', 'https://*/*'] }, (d) => {
    if (!d.webContentsId || d.resourceType === 'mainFrame') return;
    const type = header(d.responseHeaders, 'content-type');
    if (!MEDIA_TYPE.test(type)) return;
    let host = '';
    try { host = new URL(d.url).hostname; } catch { return; }
    if (SKIP_HOSTS.test(host) || SEGMENT.test(d.url)) return;
    const size = Number(header(d.responseHeaders, 'content-length')) || 0;
    if (/^(video|audio)\//i.test(type) && size > 0 && size < 300 * 1024) return; // Schnipsel/Töne ignorieren
    const list = detected.get(d.webContentsId) || [];
    const clean = d.url.split('#')[0];
    if (list.some((m) => m.url === clean)) return;
    const dir = clean.split('?')[0].replace(/[^/]*$/, '');
    if (/mpegurl/i.test(type) && list.some((m) => /mpegurl/i.test(m.type) && m.dir === dir)) return;
    list.push({ url: clean, type: type.split(';')[0], size, dir });
    if (list.length > 15) list.shift();
    detected.set(d.webContentsId, list);
    onChange(d.webContentsId);
  });
}

function reset(wcId) { detected.delete(wcId); }
function available(wc) { return (detected.get(wc.id) || []).length > 0; }
function isSupported() { return false; }
function selfUpdate() { /* nichts zu aktualisieren */ }

function safeName(t) {
  return String(t || 'Video').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Video';
}

async function cookieHeader(ses, urls) {
  const parts = new Map();
  for (const u of urls) {
    try { for (const c of await ses.cookies.get({ url: u })) parts.set(c.name, c.value); } catch { /* egal */ }
  }
  return [...parts].map(([k, v]) => `${k}=${v}`).join('; ');
}

// HLS/DASH-Stream mit ffmpeg zu MP4 zusammensetzen (Kopie, keine Neukodierung)
async function saveStream(wc, url) {
  const ffmpeg = path.join(binDir(), 'ffmpeg.exe');
  const title = safeName(wc.getTitle());
  const entry = downloads.add({ name: `${title} (Stream → MP4)`, kind: 'video' });
  if (!fs.existsSync(ffmpeg)) return downloads.update(entry, { state: 'failed', error: 'ffmpeg.exe fehlt' }, true);
  const page = wc.getURL();
  const cookies = await cookieHeader(wc.session, [url, page]);
  let headers = `Referer: ${page}\r\n`;
  try { headers += `Origin: ${new URL(page).origin}\r\n`; } catch { /* egal */ }
  if (cookies) headers += `Cookie: ${cookies}\r\n`;
  const out = uniquePath(videoDir(), `${title}.mp4`);
  const args = ['-hide_banner', '-nostdin', '-y', '-user_agent', wc.getUserAgent(), '-headers', headers,
    '-i', url, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', out];
  const proc = spawn(ffmpeg, args, { windowsHide: true });
  let duration = 0;
  let lastErr = '';
  entry.cancel = () => { entry.state = 'cancelled'; proc.kill(); };
  proc.stderr.on('data', (d) => {
    const s = d.toString();
    const dm = /Duration: (\d+):(\d+):([\d.]+)/.exec(s);
    if (dm) duration = +dm[1] * 3600 + +dm[2] * 60 + +dm[3];
    const tm = /time=(\d+):(\d+):([\d.]+).*?speed=\s*([\d.]+x)/.exec(s);
    if (tm) {
      const t = +tm[1] * 3600 + +tm[2] * 60 + +tm[3];
      downloads.update(entry, { progress: duration ? Math.min(0.99, t / duration) : 0, speed: tm[4] });
    }
    const line = s.trim().split('\n').pop();
    if (/error|denied|forbidden|invalid/i.test(line)) lastErr = line.slice(0, 200);
  });
  proc.on('close', (code) => {
    if (entry.state === 'cancelled') { fs.rm(out, { force: true }, () => {}); return downloads.update(entry, { state: 'cancelled', cancel: null }, true); }
    downloads.update(entry, code === 0
      ? { state: 'completed', progress: 1, path: out, name: path.basename(out), cancel: null }
      : { state: 'failed', error: lastErr || `ffmpeg beendet mit Code ${code} (Stream evtl. geschützt)`, cancel: null }, true);
  });
  proc.on('error', (e) => downloads.update(entry, { state: 'failed', error: e.message, cancel: null }, true));
}

function shortName(url) {
  try {
    const u = new URL(url);
    const file = decodeURIComponent(u.pathname.split('/').pop() || u.hostname);
    return file.length > 45 ? file.slice(0, 43) + '…' : file;
  } catch { return url.slice(0, 45); }
}

function menuTemplate(wc) {
  const items = [];
  const media = detected.get(wc.id) || [];
  if (media.length) {
    items.push({ label: 'Erkannte Mediendateien', enabled: false });
    for (const m of media.slice().reverse()) {
      const size = m.size ? ` (${downloads.fmtBytes(m.size)})` : '';
      const isStream = /mpegurl|dash/i.test(m.type);
      items.push({ label: `${isStream ? '📡' : '🎞'} ${shortName(m.url)}${size}`, click: () => (isStream ? saveStream(wc, m.url) : wc.downloadURL(m.url)) });
    }
  } else {
    items.push({ label: 'Auf dieser Seite wurde keine Mediendatei erkannt', enabled: false });
  }
  items.push({ type: 'separator' }, { label: 'Hinweis: Videoplattformen wie YouTube werden nicht unterstützt', enabled: false });
  items.push({ type: 'separator' }, { label: 'Video-Ordner öffnen', click: () => shell.openPath(videoDir()) });
  return items;
}

function startDownload() {
  return { error: 'In dieser Version nicht enthalten' };
}

module.exports = { setup, reset, available, menuTemplate, selfUpdate, isSupported, startDownload, FORMATS: {} };
