'use strict';
// Lesemodus: Artikel ohne Werbung, Menüs und Seitenleisten (Mozilla Readability, wie in Firefox).
// Die Leseansicht ist eine eigenständige Seite ohne Skripte und ohne TZBrowser-Rechte.

const fs = require('fs');
const path = require('path');

let lib = null;
const libSrc = () => lib || (lib = fs.readFileSync(path.join(path.dirname(require.resolve('@mozilla/readability')), 'Readability.js'), 'utf8'));

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(a, accent, sourceUrl) {
  let host = '';
  try { host = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch { /* leer */ }
  const words = String(a.text || '').trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return `<!DOCTYPE html><html lang="${esc(a.lang || 'de')}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; media-src *; style-src 'unsafe-inline'; font-src data:">
<meta name="referrer" content="no-referrer">
<title>${esc(a.title)}</title>
<style>
:root{--a:${esc(accent)}}
html{background:#0b0a10;color:#e9e6f0}
body{max-width:740px;margin:0 auto;padding:56px 28px 120px;font:19px/1.72 Georgia,"Iowan Old Style","Segoe UI",serif}
header{border-bottom:1px solid #ffffff14;margin-bottom:34px;padding-bottom:18px}
.src{font:600 13px "Segoe UI",system-ui,sans-serif;letter-spacing:1px;text-transform:uppercase;color:var(--a)}
h1{font:700 36px/1.2 "Segoe UI",system-ui,sans-serif;margin:10px 0 12px;color:#fff}
.meta{font:14px "Segoe UI",system-ui,sans-serif;color:#8d88a0}
a{color:var(--a)}
img,video,figure{max-width:100%;height:auto;border-radius:6px}
figure{margin:28px 0}figcaption{font:14px "Segoe UI",sans-serif;color:#8d88a0;margin-top:6px}
h2,h3,h4{font-family:"Segoe UI",system-ui,sans-serif;color:#fff;line-height:1.3;margin-top:1.8em}
blockquote{margin:1.4em 0;padding:.2em 1.2em;border-left:3px solid var(--a);color:#cfcadb}
pre,code{font:15px Consolas,monospace;background:#15121d;border-radius:4px}pre{padding:14px;overflow:auto}
table{border-collapse:collapse;max-width:100%;font-size:16px}td,th{border:1px solid #ffffff1a;padding:6px 10px}
hr{border:0;border-top:1px solid #ffffff14}
::selection{background:color-mix(in srgb,var(--a) 45%,transparent)}
</style></head><body>
<header><div class="src">📖 Lesemodus · ${esc(a.site || host)}</div><h1>${esc(a.title)}</h1>
<div class="meta">${a.byline ? esc(a.byline) + ' · ' : ''}ca. ${minutes} Min. Lesezeit · F9 oder 📖 = zurück zur Seite</div></header>
<article>${a.html}</article></body></html>`;
}

// Liefert true, wenn die Leseansicht geöffnet wurde
async function open(wc, accent) {
  const sourceUrl = wc.getURL();
  const code = `(() => {
${libSrc()}
    const doc = document.cloneNode(true);
    const r = new Readability(doc, { charThreshold: 300, keepClasses: false });
    const a = r.parse();
    if (!a || !a.content) return null;
    return { title: a.title, byline: a.byline, site: a.siteName, html: a.content, text: a.textContent, lang: document.documentElement.lang || 'de' };
  })()`;
  let art = null;
  try { art = await wc.executeJavaScript(code, true); } catch (e) { console.error('[lesemodus] ' + e.message); }
  if (!art) return false;
  // Sicherheitsnetz: aktive Inhalte entfernen (die Seite hat ohnehin keine Skript-Erlaubnis)
  art.html = String(art.html)
    .replace(/<(script|iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  await wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page(art, accent, sourceUrl)));
  return sourceUrl;
}

module.exports = { open };
