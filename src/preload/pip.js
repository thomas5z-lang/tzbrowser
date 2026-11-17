'use strict';
// Bild-in-Bild-Knopf: erscheint oben rechts auf Videos, wenn die Maus darüber ist.
// Ein Klick holt das Video in ein kleines Fenster, das über allen Programmen schwebt.

if (/^https?:$/.test(location.protocol) && document.pictureInPictureEnabled !== false) {
  let host = null;
  let btn = null;
  let target = null;
  let hideTimer = null;

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('ghost-pip');
    host.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0;';
    const root = host.attachShadow({ mode: 'closed' });
    // ohne innerHTML bauen: Seiten wie YouTube erzwingen „Trusted Types“
    const style = document.createElement('style');
    style.textContent = `
      button{position:fixed;display:none;align-items:center;gap:6px;padding:6px 10px;border:0;border-radius:6px;cursor:pointer;
        background:rgba(12,10,18,.82);color:#fff;font:600 12px "Segoe UI",system-ui,sans-serif;box-shadow:0 4px 16px #0008;
        border-left:3px solid #fa1e4e;opacity:.85;transition:opacity .15s}
      button:hover{opacity:1}
      svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:1.6}`;
    btn = document.createElement('button');
    btn.title = 'Bild-in-Bild (Video in eigenem kleinen Fenster)';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    for (const [x, y, w, h, fill] of [[1.5, 2.5, 13, 10, 'none'], [8, 7.5, 5, 3.5, '#fff']]) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('rx', 1); r.setAttribute('fill', fill);
      svg.append(r);
    }
    btn.append(svg, document.createTextNode('Bild-in-Bild'));
    root.append(style, btn);
    btn.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!target) return;
      try {
        if (document.pictureInPictureElement === target) await document.exitPictureInPicture();
        else {
          target.disablePictureInPicture = false;
          await target.requestPictureInPicture();
        }
      } catch { /* Seite verbietet es */ }
      btn.style.display = 'none';
    });
    (document.body || document.documentElement).appendChild(host);
  }

  function show(v) {
    const r = v.getBoundingClientRect();
    if (r.width < 240 || r.height < 135) return;
    ensure();
    target = v;
    btn.style.left = Math.max(4, r.right - 128) + 'px';
    btn.style.top = Math.max(4, r.top + 10) + 'px';
    btn.style.display = 'flex';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (btn) btn.style.display = 'none'; }, 2500);
  }

  // Videos liegen oft unter Bedien-Ebenen: Video unter der Maus über die Koordinaten finden
  let last = 0;
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - last < 120) return;
    last = now;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { show(v); return; }
    }
  }, { passive: true, capture: true });
}
