'use strict';
// Live-Vorleser für Streamingdienste ohne Untertitel-Datei (Netflix, Prime Video, Disney+, YouTube …):
// liest den gerade angezeigten Untertitel vom Bildschirm bzw. aus der Video-Spur und spricht ihn
// mit der TZBrowser-Stimme. Läuft nur, wenn der Vorleser eingeschaltet ist und die Seite passt.

const { ipcRenderer } = require('electron');

let cfg = null;
if (window === window.top && /^https?:$/.test(location.protocol)) {
  try { cfg = ipcRenderer.sendSync('ghost:avlive-config', location.hostname); } catch { cfg = null; }
}

if (cfg) {
  let ctx = null;
  let gain = null;
  let video = null;
  let savedVolume = null;
  let lastSeen = '';
  let lastSpoken = '';
  let timer = null;
  let busyUntil = 0;
  const queue = [];
  let working = false;
  let toastEl = null;

  const toast = (text) => {
    const show = () => {
      if (!toastEl || !toastEl.isConnected) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = 'position:fixed;top:16px;left:16px;z-index:2147483647;padding:6px 12px;border-radius:8px;'
          + 'background:rgba(0,0,0,.78);color:#fff;font:600 14px system-ui,sans-serif;pointer-events:none;'
          + 'transition:opacity .4s;border-left:3px solid #fa1e4e';
        (document.fullscreenElement || document.documentElement).appendChild(toastEl);
      }
      toastEl.textContent = text;
      toastEl.style.opacity = '1';
      clearTimeout(toastEl._t);
      toastEl._t = setTimeout(() => { toastEl.style.opacity = '0'; }, 4000);
    };
    if (document.documentElement) show(); else addEventListener('DOMContentLoaded', show, { once: true });
  };

  const clean = (t) => String(t || '').replace(/\[[^\]]*\]|\([^)]*\)|♪/g, ' ').replace(/^[-–]\s*/gm, '').replace(/\s+/g, ' ').trim();

  function ensureAudio() {
    if (ctx) return;
    ctx = new AudioContext();
    gain = ctx.createGain();
    gain.gain.value = (cfg.lautstaerke || 100) / 100;
    gain.connect(ctx.destination);
  }

  function lowerOriginal() {
    if (!video) return;
    if (savedVolume === null) savedVolume = video.volume;
    video.volume = Math.max(0, Math.min(1, (cfg.original ?? 15) / 100));
  }

  async function work() {
    if (working) return;
    working = true;
    while (queue.length) {
      // zu weit hinterher? alte Sätze verwerfen
      while (queue.length > 2) queue.shift();
      const text = queue.shift();
      let r = null;
      try { r = await ipcRenderer.invoke('ghost:av', { typ: 'tts', text, stimme: cfg.stimme, tempo: cfg.tempo }); } catch { r = null; }
      if (!r || r.fehler || !r.audio) { toast('⚠️ Vorleser: ' + ((r && r.fehler) || 'keine Stimme')); continue; }
      try {
        ensureAudio();
        if (ctx.state === 'suspended') await ctx.resume();
        const bin = atob(r.audio);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const buf = await ctx.decodeAudioData(bytes.buffer);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const rate = (video && video.playbackRate) || 1;
        src.playbackRate.value = rate;
        src.connect(gain);
        const start = Math.max(ctx.currentTime, busyUntil);
        src.start(start);
        busyUntil = start + buf.duration / rate;
      } catch { /* Ton kaputt – nächster Satz */ }
    }
    working = false;
  }

  function say(text) {
    let t = clean(text);
    if (!t || t === lastSpoken) return;
    // rollende Untertitel (z. B. YouTube): nur den neuen Teil sprechen
    if (lastSpoken && t.startsWith(lastSpoken)) {
      const rest = t.slice(lastSpoken.length).trim();
      lastSpoken = t;
      t = rest;
    } else lastSpoken = t;
    if (!t || !/\p{L}/u.test(t)) return;
    lowerOriginal();
    queue.push(t);
    work();
  }

  function seen(text) {
    const t = clean(text);
    if (t === lastSeen) return;
    lastSeen = t;
    clearTimeout(timer);
    if (t) timer = setTimeout(() => say(t), 350); // erst sprechen, wenn der Untertitel kurz stehen bleibt
  }

  // Weg 1: Untertitel-Bereich der Seite (Netflix, Prime, Disney+, YouTube)
  // Weg 2: eingebaute Untertitel-Spuren des <video> (viele Mediatheken)
  const tracked = new WeakSet();
  setInterval(() => {
    const v = document.querySelector('video');
    if (v && v !== video) {
      video = v;
      savedVolume = null;
      v.addEventListener('pause', () => ctx && ctx.suspend());
      v.addEventListener('play', () => { if (ctx) ctx.resume(); });
      v.addEventListener('seeking', () => { queue.length = 0; lastSpoken = ''; });
      toast('🔊 Vorleser bereit – Untertitel im Player einschalten');
      ipcRenderer.invoke('ghost:av', { typ: 'warmup' }).catch(() => {});
    }
    if (!video || video.paused || cfg.aus) return;
    if (cfg.selector) {
      const box = document.querySelector(cfg.selector);
      seen(box ? box.innerText : '');
    }
    for (const tr of video.textTracks || []) {
      if (tracked.has(tr)) continue;
      tracked.add(tr);
      tr.addEventListener('cuechange', () => {
        if (tr.mode !== 'showing' && tr.mode !== 'hidden') return;
        const txt = [...(tr.activeCues || [])].map((c) => c.text || '').join(' ');
        if (txt) seen(txt.replace(/<[^>]+>/g, ''));
      });
    }
  }, 200);

  ipcRenderer.on('ghost:av-changed', (_e, c) => {
    for (const k of Object.keys(c)) cfg[k] = c[k].newValue;
    if (gain) gain.gain.value = (cfg.lautstaerke || 100) / 100;
    if (c.an && !c.an.newValue) {
      cfg = { ...cfg, aus: true };
      queue.length = 0;
      if (ctx) ctx.suspend();
      if (video && savedVolume !== null) video.volume = savedVolume;
      toast('🔇 Vorleser aus');
    } else if (video && savedVolume !== null) lowerOriginal();
  });
}
