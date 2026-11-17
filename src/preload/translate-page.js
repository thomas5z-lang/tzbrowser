'use strict';
// Übersetzt fremdsprachige Seiten automatisch ins Deutsche (nur Hauptseite, keine Frames).
// Ersetzt nur Textknoten – Layout, Links und Skripte der Seite bleiben unberührt.

const { ipcRenderer } = require('electron');

if (window === window.top && /^https?:$/.test(location.protocol)) {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'TEXTAREA', 'INPUT', 'SELECT', 'SVG', 'MATH', 'CANVAS', 'IFRAME', 'TEMPLATE']);
  const original = new Map(); // Textknoten -> Originaltext
  let done = new WeakSet();
  let mine = new WeakMap(); // Textknoten -> von uns gesetzter Text (um Änderungen der Seite zu erkennen)
  let active = false;
  let stopped = false;
  let from = '';
  let pending = [];
  let timer = null;
  let observer = null;
  let batches = 0;

  // grobe Erkennung, ob ein Text schon Deutsch ist
  const DE = /\b(der|die|das|und|ist|nicht|mit|sich|auf|für|eine?n?|auch|werden|wird|sind|oder|bei|nach|wie|über|noch|kann|dass)\b/gi;
  const EN = /\b(the|and|is|are|with|for|this|that|you|your|of|to|was|were|have|has|from|will|can|not|be)\b/gi;
  const langNow = () => (document.documentElement.lang || '').toLowerCase();
  // deutsche Seitenversion erkennbar an Adresse (.de, /de/, /de-de/, ?hl=de …)
  const germanUrl = () => /\.de$/i.test(location.hostname) || /(^|[/_-])de([-_]de)?(\/|$)/i.test(location.pathname) || /[?&](hl|lang|locale)=de/i.test(location.search);
  let forced = false;
  function looksForeign(text) {
    const de = (text.match(DE) || []).length;
    const en = (text.match(EN) || []).length;
    return en >= 12 && en > de * 2;
  }
  function looksGerman(text) {
    const de = (text.match(DE) || []).length;
    const en = (text.match(EN) || []).length;
    return de >= 8 && de > en * 1.5;
  }

  function skipNode(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (SKIP.has(e.tagName) || e.isContentEditable) return true;
      if (e.getAttribute && (e.getAttribute('translate') === 'no' || e.classList.contains('notranslate'))) return true;
      if (e.id === 'ghost-tr-chip') return true;
    }
    return false;
  }

  function collect(root, out) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (done.has(n)) return NodeFilter.FILTER_REJECT;
        const t = n.nodeValue;
        if (!t || t.trim().length < 2 || !/\p{L}/u.test(t)) return NodeFilter.FILTER_REJECT;
        if (!n.parentElement || skipNode(n.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  function report(busy = false) {
    ipcRenderer.send('ghost:tr-state', { active, busy, from });
  }

  async function run(nodes) {
    // sichtbare Teile zuerst
    const vh = innerHeight * 1.5;
    const inView = (n) => { const r = n.parentElement.getBoundingClientRect(); return r.bottom > 0 && r.top < vh; };
    nodes.sort((a, b) => inView(b) - inView(a));
    for (let i = 0; i < nodes.length && !stopped;) {
      const part = [];
      let len = 0;
      while (i < nodes.length && part.length < 120 && len < 4500) { part.push(nodes[i]); len += nodes[i].nodeValue.length; i++; }
      if (++batches > 400) return; // Schutz vor endlosen Seiten
      report(true);
      const texts = part.map((n) => n.nodeValue.trim());
      let res;
      try { res = await ipcRenderer.invoke('ghost:translate', { texts }); } catch { res = null; }
      if (!res || res.error || stopped) { report(false); return; }
      // Seite hat sich inzwischen als Deutsch zu erkennen gegeben (z. B. lang erst nach dem Laden gesetzt)
      if (!forced && /^de/.test(langNow())) { stopped = true; report(false); return; }
      if (!from && res.detected) {
        from = res.detected;
        if (/^de/i.test(from)) { stopped = true; from = ''; report(false); return; } // war schon Deutsch
      }
      part.forEach((n, k) => {
        const de = res.texts[k];
        if (!de || !n.isConnected) return;
        const t = n.nodeValue;
        const lead = t.match(/^\s*/)[0];
        const trail = t.match(/\s*$/)[0];
        if (!original.has(n)) original.set(n, t);
        done.add(n);
        n.nodeValue = lead + de + trail;
        mine.set(n, n.nodeValue);
      });
      active = true;
      report(false);
    }
  }

  function watch() {
    if (observer) return;
    observer = new MutationObserver((list) => {
      if (stopped) return;
      for (const m of list) {
        // Seite hat einen schon übersetzten Text geändert (z. B. Uhrzeit, Zähler)
        if (m.type === 'characterData') {
          const n = m.target;
          if (mine.has(n) && mine.get(n) !== n.nodeValue && /\p{L}/u.test(n.nodeValue)) { done.delete(n); original.delete(n); mine.delete(n); pending.push(n); }
          continue;
        }
        for (const n of m.addedNodes) {
        if (n.nodeType === 3) { if (!done.has(n) && n.parentElement && !skipNode(n.parentElement) && /\p{L}/u.test(n.nodeValue)) pending.push(n); } else if (n.nodeType === 1) collect(n, pending);
        }
      }
      if (pending.length) {
        clearTimeout(timer);
        timer = setTimeout(() => { const p = pending; pending = []; run(p); }, 500);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  async function start(force = false) {
    stopped = false;
    forced = force;
    if (!force) {
      if (/^de/.test(langNow()) || germanUrl()) return;
      const sample = (document.body.innerText || '').slice(0, 4000);
      if (sample.trim().length < 40 || looksGerman(sample)) return;
      // ohne Sprachangabe nur übersetzen, wenn der Text eindeutig fremdsprachig ist
      if (!langNow() && !looksForeign(sample)) return;
    }
    let cfg;
    try { cfg = await ipcRenderer.invoke('ghost:tr-config', { lang: document.documentElement.lang || '' }); } catch { return; }
    if (!cfg || !cfg.go) return;
    await run(collect(document.body, []));
    if (stopped) return;
    watch();
    // Tab-Titel mit übersetzen
    const title = document.title;
    if (title && /\p{L}/u.test(title)) {
      try {
        const r = await ipcRenderer.invoke('ghost:translate', { texts: [title] });
        if (r && r.texts && r.texts[0] && document.title === title && !stopped) { original.set('title', title); document.title = r.texts[0]; }
      } catch { /* egal */ }
    }
  }

  function restore() {
    stopped = true;
    if (observer) { observer.disconnect(); observer = null; }
    for (const [n, t] of original) {
      if (n === 'title') document.title = t;
      else if (n.isConnected) n.nodeValue = t;
    }
    original.clear();
    done = new WeakSet();
    mine = new WeakMap();
    active = false;
    ipcRenderer.send('ghost:tr-state', { active: false, busy: false, from, original: true });
  }

  ipcRenderer.on('ghost:tr-cmd', (_e, cmd) => {
    if (cmd === 'original') restore();
    if (cmd === 'translate') { batches = 0; start(true); }
  });

  const go = () => setTimeout(() => start(false), 300);
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', go, { once: true }); else go();
}
