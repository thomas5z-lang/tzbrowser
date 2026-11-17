'use strict';
// Eigenes Design: Farben, Schrift, Name, Logo, Startseiten-Hintergrund und Kacheln.
// Stufe 1: selbst einstellen (Einstellungen → Design)
// Stufe 2: „Von Webseite übernehmen“ – Logo, Farben und Schrift einer Firmen-Webseite auslesen
// Dazu: Design als Datei (.tzdesign) speichern und weitergeben.

const { app, ipcMain, dialog, BrowserWindow, WebContentsView, session } = require('electron');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const DEFAULT_TILES = [
  { name: 'YouTube', url: 'https://www.youtube.com/' },
  { name: 'Twitch', url: 'https://www.twitch.tv/' },
  { name: 'GitHub', url: 'https://github.com/' },
  { name: 'Claude', url: 'https://claude.ai/' },
  { name: 'Steam', url: 'https://store.steampowered.com/' },
  { name: 'Amazon', url: 'https://www.amazon.de/' },
  { name: 'Discord', url: 'https://discord.com/app' },
  { name: 'Wikipedia', url: 'https://de.wikipedia.org/' },
];
const FONTS = [
  ['', 'Standard (Segoe UI)'], ['Arial', 'Arial'], ['Verdana', 'Verdana'], ['Tahoma', 'Tahoma'], ['Trebuchet MS', 'Trebuchet MS'],
  ['Georgia', 'Georgia'], ['Calibri', 'Calibri'], ['Cambria', 'Cambria'], ['Consolas', 'Consolas'], ['Bahnschrift', 'Bahnschrift'],
];

const dir = () => path.join(app.getPath('userData'), 'design');
const HEX = /^#[0-9a-f]{6}$/i;
let onChange = () => {};

function current() {
  const d = settings.get('design') || {};
  return {
    custom: !!d.custom,
    name: String(d.name || 'TZBrowser').slice(0, 40),
    accent: HEX.test(d.accent || '') ? d.accent : (settings.get('accent') || '#fa1e4e'),
    bg: HEX.test(d.bg || '') ? d.bg : '#0b0a10',
    text: HEX.test(d.text || '') ? d.text : '#f1eff6',
    font: FONTS.some(([f]) => f === d.font) ? d.font : '',
    logo: d.logo && fs.existsSync(path.join(dir(), d.logo)) ? path.join(dir(), d.logo) : '',
    newtabBg: d.newtabBg && fs.existsSync(path.join(dir(), d.newtabBg)) ? path.join(dir(), d.newtabBg) : '',
    tiles: Array.isArray(d.tiles) && d.tiles.length ? d.tiles.slice(0, 16) : DEFAULT_TILES,
  };
}

function save(patch) {
  const d = { ...(settings.get('design') || {}), ...patch };
  settings.set('design', d);
  if (patch.accent) settings.set('accent', patch.accent);
  onChange(current());
  return current();
}

// ---- Farben ----
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (hex) => { const [r, g, b] = toRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function sat(hex) { const [r, g, b] = toRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
function cssToHex(c) {
  const m = String(c || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
  if (m) { if (m[4] !== undefined && Number(m[4]) < 0.5) return null; return toHex([+m[1], +m[2], +m[3]]); }
  const h = String(c || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(h)) return '#' + h.slice(1).split('').map((x) => x + x).join('');
  return HEX.test(h) ? h.toLowerCase() : null;
}

// ---- Stufe 2: Webseite auslesen ----
const EXTRACT = `(() => {
  const q = (s) => document.querySelector(s);
  const theme = (q('meta[name="theme-color"]') || {}).content || '';
  const site = (q('meta[property="og:site_name"]') || {}).content || document.title || location.hostname;
  const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')]
    .map((l) => ({ href: l.href, size: parseInt((l.sizes && l.sizes.value) || '0', 10) || (/apple/.test(l.rel) ? 180 : 16) }));
  const logos = [];
  for (const el of document.querySelectorAll('header img, nav img, a[href="/"] img, img[alt*="logo" i], img[class*="logo" i], [class*="logo" i] img, header svg, [class*="logo" i] svg')) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12 || r.top > 400) continue;
    if (el.tagName === 'IMG') logos.push({ src: el.currentSrc || el.src, w: r.width, h: r.height });
    else logos.push({ svg: el.outerHTML.slice(0, 60000), w: r.width, h: r.height, color: getComputedStyle(el).color });
    if (logos.length >= 4) break;
  }
  const count = {};
  const add = (c, w) => { if (c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) count[c] = (count[c] || 0) + w; };
  for (const el of [...document.querySelectorAll('header, nav, button, [role=button], a, [class*="btn" i], [class*="button" i], h1, h2')].slice(0, 600)) {
    const s = getComputedStyle(el);
    add(s.backgroundColor, 3); add(s.color, 1); add(s.borderTopColor, 0.5);
  }
  const bs = getComputedStyle(document.body);
  const hs = q('header') ? getComputedStyle(q('header')) : null;
  return { theme, site, icons, logos, colors: Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 20),
    bodyBg: bs.backgroundColor, htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    headerBg: hs ? hs.backgroundColor : '', text: bs.color, font: bs.fontFamily };
})()`;

async function download(ses, url, base) {
  const r = await ses.fetch(url);
  if (!r.ok) throw new Error('Logo nicht ladbar');
  const type = r.headers.get('content-type') || '';
  const ext = /svg/.test(type) || /\.svg(\?|$)/i.test(url) ? 'svg' : /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpg' : /webp/.test(type) ? 'webp' : /icon|ico/.test(type) ? 'ico' : 'png';
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 3 * 1024 * 1024) throw new Error('Logo zu groß');
  let data = buf;
  if (ext === 'svg') data = Buffer.from(cleanSvg(buf.toString('utf8')));
  fs.mkdirSync(dir(), { recursive: true });
  const name = `${base}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir(), name), data);
  return name;
}

// SVG ohne Skripte/Ereignisse speichern
const cleanSvg = (s) => String(s).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/javascript:/gi, '');

async function fromWebsite(rawUrl) {
  let url;
  try { url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl).href; } catch { throw new Error('Ungültige Adresse'); }
  const ses = session.fromPartition('ghost-design-probe'); // eigene, flüchtige Sitzung
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, partition: 'ghost-design-probe', javascript: true } });
  const wc = view.webContents;
  wc.setAudioMuted(true);
  try {
    await Promise.race([wc.loadURL(url), new Promise((_, rej) => setTimeout(() => rej(new Error('Seite lädt zu lange')), 20000))]);
    await new Promise((r) => setTimeout(r, 1500)); // nachladende Inhalte abwarten
    const x = await wc.executeJavaScript(EXTRACT, true);
    // Farben auswählen
    const bg = cssToHex(x.bodyBg) || cssToHex(x.htmlBg) || '#ffffff';
    let text = cssToHex(x.text) || (lum(bg) > 0.5 ? '#1a1a1a' : '#f1f1f1');
    if (contrast(text, bg) < 4) text = lum(bg) > 0.5 ? '#1a1a1a' : '#f1f1f1';
    const candidates = [cssToHex(x.theme), ...x.colors.map(([c]) => cssToHex(c))].filter(Boolean);
    let accent = candidates.find((c) => sat(c) > 0.35 && contrast(c, bg) > 1.8 && lum(c) > 0.03 && lum(c) < 0.9);
    if (!accent) accent = candidates.find((c) => contrast(c, bg) > 2) || '#fa1e4e';
    const font = String(x.font || '').split(',')[0].replace(/["']/g, '').trim();
    // Logo: sichtbares Logo der Seite, sonst größtes Symbol
    let logo = '';
    const best = x.logos.sort((a, b) => b.w * b.h - a.w * a.h)[0];
    try {
      if (best && best.src) logo = await download(ses, best.src, 'logo');
      else if (best && best.svg) {
        fs.mkdirSync(dir(), { recursive: true });
        logo = `logo-${Date.now()}.svg`;
        let svg = cleanSvg(best.svg);
        if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        // Logo-Farbe: auf dem neuen Hintergrund sichtbar halten (weißes Logo auf weißem Grund → Akzentfarbe)
        let fill = cssToHex(best.color) || text;
        if (contrast(fill, bg) < 1.6) fill = contrast(accent, bg) >= 1.6 ? accent : text;
        if (!/fill=/.test(svg.slice(0, 300))) svg = svg.replace('<svg', `<svg fill="${fill}"`);
        fs.writeFileSync(path.join(dir(), logo), svg);
      } else if (x.icons.length) {
        const icon = x.icons.sort((a, b) => b.size - a.size)[0];
        logo = await download(ses, icon.href, 'logo');
      }
    } catch { logo = ''; }
    const name = String(x.site || '').split(/\s[|–\-:]\s/)[0].replace(/[_.](de|com|at|ch|net|org|eu)$/i, '').trim().slice(0, 40) || new URL(url).hostname;
    return { name, accent, bg, text, font: FONTS.some(([f]) => f.toLowerCase() === font.toLowerCase()) ? FONTS.find(([f]) => f.toLowerCase() === font.toLowerCase())[0] : '', fontFound: font, logo, home: url };
  } finally {
    try { wc.close(); } catch { /* egal */ }
    ses.clearStorageData().catch(() => {});
  }
}

// ---- Design-Datei (.tzdesign) ----
function fileToData(p) {
  if (!p) return '';
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', gif: 'image/gif' }[ext] || 'image/png';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}
function dataToFile(data, base) {
  const m = /^data:image\/(svg\+xml|png|jpeg|webp|x-icon|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) return '';
  const ext = { 'svg+xml': 'svg', png: 'png', jpeg: 'jpg', webp: 'webp', 'x-icon': 'ico', gif: 'gif' }[m[1]];
  let buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) return '';
  if (ext === 'svg') buf = Buffer.from(cleanSvg(buf.toString('utf8')));
  fs.mkdirSync(dir(), { recursive: true });
  const name = `${base}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir(), name), buf);
  return name;
}

function sanitizeTiles(list) {
  return (Array.isArray(list) ? list : []).map((t) => {
    let url = String((t && t.url) || '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { url = new URL(url).href; } catch { return null; }
    if (!/^https?:/i.test(url)) return null;
    return { name: String(t.name || new URL(url).hostname).slice(0, 24), url };
  }).filter(Boolean).slice(0, 16);
}

// Für die Seiten (Oberfläche, Seitenleiste, Startseite)
function forUi() {
  const d = current();
  const fileUrl = (p) => (p ? 'file:///' + p.replace(/\\/g, '/') : '');
  return { custom: d.custom, name: d.name, accent: d.accent, bg: d.bg, text: d.text, font: d.font, logo: fileUrl(d.logo), newtabBg: fileUrl(d.newtabBg), tiles: d.tiles };
}

function setup(changeCallback, isSettingsPage) {
  onChange = changeCallback;
  const guard = (fn) => (event, ...args) => {
    if (!isSettingsPage(event)) throw new Error('nicht erlaubt');
    return fn(event, ...args);
  };
  const win = (event) => BrowserWindow.fromWebContents(event.sender) || undefined;
  ipcMain.handle('ghost:design-get', guard(() => ({ ...current(), logo: fileToData(current().logo), newtabBg: current().newtabBg ? 'gesetzt' : '', fonts: FONTS })));
  ipcMain.handle('ghost:design-set', guard((_e, p = {}) => {
    const patch = { custom: true };
    if (typeof p.name === 'string') patch.name = p.name.trim().slice(0, 40) || 'TZBrowser';
    for (const k of ['accent', 'bg', 'text']) if (HEX.test(p[k] || '')) patch[k] = p[k].toLowerCase();
    if (typeof p.font === 'string' && FONTS.some(([f]) => f === p.font)) patch.font = p.font;
    if (p.tiles) patch.tiles = sanitizeTiles(p.tiles);
    save(patch);
    return true;
  }));
  ipcMain.handle('ghost:design-pick', guard(async (event, what) => {
    const r = await dialog.showOpenDialog(win(event), { title: what === 'logo' ? 'Logo wählen' : 'Hintergrundbild wählen', properties: ['openFile'], filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'ico', 'gif'] }] });
    if (r.canceled || !r.filePaths[0]) return false;
    const name = dataToFile(fileToData(r.filePaths[0]), what === 'logo' ? 'logo' : 'hintergrund');
    if (!name) throw new Error('Bild nicht lesbar oder zu groß (max. 6 MB)');
    save(what === 'logo' ? { logo: name, custom: true } : { newtabBg: name, custom: true });
    return true;
  }));
  ipcMain.handle('ghost:design-clear', guard((_e, what) => { save(what === 'logo' ? { logo: '' } : { newtabBg: '' }); return true; }));
  ipcMain.handle('ghost:design-site', guard(async (_e, url) => {
    const r = await fromWebsite(String(url || ''));
    save({ custom: true, name: r.name, accent: r.accent, bg: r.bg, text: r.text, font: r.font, ...(r.logo ? { logo: r.logo } : {}) });
    return r;
  }));
  ipcMain.handle('ghost:design-reset', guard(() => { settings.set('design', {}); settings.set('accent', '#fa1e4e'); onChange(current()); return true; }));
  ipcMain.handle('ghost:design-export', guard(async (event) => {
    const d = current();
    const { canceled, filePath } = await dialog.showSaveDialog(win(event), { title: 'Design speichern', defaultPath: path.join(app.getPath('documents'), `${d.name.replace(/[<>:"/\\|?*]/g, '_')}.tzdesign`), filters: [{ name: 'TZBrowser-Design', extensions: ['tzdesign'] }] });
    if (canceled || !filePath) return '';
    fs.writeFileSync(filePath, JSON.stringify({ ghostDesign: 1, name: d.name, accent: d.accent, bg: d.bg, text: d.text, font: d.font, tiles: d.tiles, logo: fileToData(d.logo), newtabBg: fileToData(d.newtabBg) }, null, 1));
    return filePath;
  }));
  ipcMain.handle('ghost:design-import', guard(async (event) => {
    const r = await dialog.showOpenDialog(win(event), { title: 'Design laden', properties: ['openFile'], filters: [{ name: 'TZBrowser-Design', extensions: ['tzdesign'] }] });
    if (r.canceled || !r.filePaths[0]) return false;
    let x;
    try { x = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { throw new Error('Keine gültige Design-Datei'); }
    if (!x || x.ghostDesign !== 1) throw new Error('Keine gültige Design-Datei');
    const patch = { custom: true, name: String(x.name || 'TZBrowser').slice(0, 40), tiles: sanitizeTiles(x.tiles) };
    for (const k of ['accent', 'bg', 'text']) if (HEX.test(x[k] || '')) patch[k] = x[k];
    if (FONTS.some(([f]) => f === x.font)) patch.font = x.font;
    patch.logo = dataToFile(x.logo, 'logo');
    patch.newtabBg = dataToFile(x.newtabBg, 'hintergrund');
    save(patch);
    return true;
  }));
}

// Akzentfarbe aus dem Menü / der Seitenleiste
function setAccent(color) {
  if (HEX.test(color || '')) save({ accent: color.toLowerCase() });
}

module.exports = { setup, current, forUi, setAccent, DEFAULT_TILES };
