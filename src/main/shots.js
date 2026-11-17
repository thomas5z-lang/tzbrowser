'use strict';
// Bildschirmfotos von Seiten: sichtbarer Bereich, ganze Seite (lang) oder als PDF.
// Gespeichert in Downloads\TZBrowser\Screenshots und in der Download-Liste angezeigt.

const { clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const downloads = require('./downloads');
const { videoDir, uniquePath } = require('./paths');

const safe = (t) => String(t || 'Seite').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Seite';

async function fullPage(wc) {
  const dbg = wc.debugger;
  try { dbg.attach('1.3'); } catch { throw new Error('Bitte zuerst die Entwicklerwerkzeuge (F12) schließen'); }
  try {
    const m = await dbg.sendCommand('Page.getLayoutMetrics');
    const cs = m.cssContentSize || m.contentSize;
    const width = Math.ceil(cs.width);
    const height = Math.min(Math.ceil(cs.height), 20000); // sehr lange Seiten begrenzen
    const r = await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, fromSurface: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return Buffer.from(r.data, 'base64');
  } finally {
    try { dbg.detach(); } catch { /* egal */ }
  }
}

// mode: visible | full | pdf
async function capture(wc, mode) {
  const dir = path.join(videoDir(), 'Screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toLocaleString('sv').replace(/[: ]/g, '-').slice(0, 16);
  const base = `${safe(wc.getTitle())} ${stamp}`;
  let buf;
  let file;
  if (mode === 'pdf') {
    buf = await wc.printToPDF({ printBackground: true });
    file = uniquePath(dir, base + '.pdf');
  } else if (mode === 'visible') {
    const img = await wc.capturePage();
    clipboard.writeImage(img); // zusätzlich in die Zwischenablage
    buf = img.toPNG();
    file = uniquePath(dir, base + '.png');
  } else {
    buf = await fullPage(wc);
    file = uniquePath(dir, base + ' (ganze Seite).png');
  }
  fs.writeFileSync(file, buf);
  const e = downloads.add({ name: path.basename(file), kind: 'file' });
  downloads.update(e, { state: 'completed', progress: 1, path: file }, true);
  return file;
}

module.exports = { capture };
