'use strict';
// Oberfläche: Tableiste, Adressleiste, Werbeblocker-Anzeige, Menüs, Suche

const $ = (id) => document.getElementById(id);
const tabsEl = $('tabs');
const address = $('address');
const shield = $('shield');
const find = $('find');
let state = { tabs: [], activeId: null, canGoBack: false, canGoForward: false, blocked: 0, paused: false, video: false };
let adblockStatus = 'loading';
let editing = false; // Nutzer tippt gerade in der Adressleiste

const svgClose = '<svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
const svgSound = '<svg viewBox="0 0 16 16"><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9"/></svg>';
const svgMuted = '<svg viewBox="0 0 16 16"><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5zM11 6l3.5 4M14.5 6 11 10"/></svg>';

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function renderTabs() {
  tabsEl.textContent = '';
  for (const t of state.tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === state.activeId ? ' active' : '') + (t.sleeping ? ' sleeping' : '') + (t.pinned ? ' pinned' : '');
    el.title = t.title + (t.url ? '\n' + t.url : '') + (t.sleeping ? '\n💤 schläft – wird beim Anklicken neu geladen' : '');

    let icon;
    if (t.loading) {
      icon = document.createElement('div');
      icon.className = 'spinner';
    } else if (t.favicon) {
      icon = document.createElement('img');
      icon.className = 'fav';
      icon.src = t.favicon;
      icon.onerror = () => icon.classList.add('placeholder');
    } else {
      icon = document.createElement('div');
      icon.className = 'fav placeholder';
    }

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = t.title || hostOf(t.url) || 'Neuer Tab';

    const close = document.createElement('button');
    close.className = 'close';
    close.title = 'Tab schließen (Strg+W)';
    close.innerHTML = svgClose;
    // Wichtig: mousedown nicht an den Tab weitergeben – sonst wird die Leiste neu gezeichnet,
    // bevor der Klick auf das X ankommt.
    close.addEventListener('mousedown', (e) => e.stopPropagation());
    close.addEventListener('click', (e) => { e.stopPropagation(); ghost.send('close-tab', t.id); });

    el.append(icon, title);
    if (t.audible || t.muted) {
      const audio = document.createElement('button');
      audio.className = 'audio' + (t.muted ? ' muted' : '');
      audio.title = t.muted ? 'Ton einschalten' : 'Tab stummschalten';
      audio.innerHTML = t.muted ? svgMuted : svgSound;
      audio.addEventListener('mousedown', (e) => e.stopPropagation());
      audio.addEventListener('click', (e) => { e.stopPropagation(); ghost.send('mute-tab', t.id); });
      el.append(audio);
    }
    el.append(close);
    if (t.container) {
      const bar = document.createElement('span');
      bar.className = 'cbar';
      bar.style.background = t.container.color;
      el.append(bar);
      el.title = `[${t.container.name}] ` + el.title;
    }
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ghost.send('menu', { which: 'tab', id: t.id, x: e.clientX, y: e.clientY });
    });
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.close, .audio')) return;
      if (e.button === 1) { e.preventDefault(); ghost.send('close-tab', t.id); } // Mittelklick
      else if (e.button === 0 && t.id !== state.activeId) ghost.send('activate-tab', t.id);
    });
    tabsEl.append(el);
  }
}

function renderShield() {
  const paused = adblockStatus === 'on' && state.paused;
  shield.className = paused ? 'paused' : adblockStatus === 'on' ? '' : adblockStatus;
  $('blocked').textContent = paused ? 'aus' : state.blocked;
  shield.title = paused
    ? 'Werbeblocker auf dieser Seite AUS – klicken zum Einschalten'
    : adblockStatus === 'on' ? `Werbeblocker aktiv – ${state.blocked} blockiert. Klicken: für diese Seite ausschalten`
      : adblockStatus === 'loading' ? 'Werbeblocker lädt Filterlisten …' : 'Werbeblocker konnte nicht starten';
}

function renderToolbar() {
  const active = state.tabs.find((t) => t.id === state.activeId);
  $('back').disabled = !state.canGoBack;
  $('forward').disabled = !state.canGoForward;
  $('reload').classList.toggle('loading', !!(active && active.loading));
  $('reload').title = active && active.loading ? 'Laden stoppen' : 'Neu laden (F5)';

  const url = active ? active.url : '';
  if (!editing) address.value = url;
  const lock = $('lock');
  lock.className = url.startsWith('https:') ? 'secure' : url.startsWith('http:') ? 'insecure' : '';
  lock.title = url.startsWith('https:') ? 'Verschlüsselte Verbindung' : url.startsWith('http:') ? 'Unverschlüsselte Verbindung' : '';

  $('video').classList.toggle('hidden', !state.video);
  const rd = $('reader');
  rd.classList.toggle('hidden', !state.reader);
  rd.classList.toggle('on', state.reader === 'on');
  rd.title = state.reader === 'on' ? 'Lesemodus beenden (F9)' : 'Lesemodus (F9)';
  const av = $('av');
  av.classList.toggle('hidden', !state.vorleser);
  av.classList.toggle('on', !!(state.vorleser && state.vorleser.on));
  av.title = state.vorleser && state.vorleser.on ? 'Untertitel-Vorleser AN – klicken zum Ausschalten' : 'Untertitel-Vorleser einschalten (liest die Untertitel vor)';
  const tr = $('translate');
  tr.classList.toggle('hidden', !state.translated);
  tr.classList.toggle('on', !!(state.translated && state.translated.active));
  tr.classList.toggle('busy', !!(state.translated && state.translated.busy));
  tr.title = state.translated ? (state.translated.active ? `Aus ${state.translated.from} übersetzt – klicken für Optionen` : state.translated.busy ? 'Wird übersetzt …' : 'Original wird angezeigt') : '';
  const star = $('star');
  star.classList.toggle('hidden', !/^https?:/.test(url));
  star.classList.toggle('on', !!state.bookmarked);
  star.title = state.bookmarked ? 'Lesezeichen entfernen (Strg+D)' : 'Lesezeichen setzen (Strg+D)';
  const form = $('addressform');
  form.classList.toggle('container', !!state.container);
  if (state.container) {
    form.style.setProperty('--ccolor', state.container.color);
    $('ctag').textContent = state.container.name;
  }
  renderShield();
}

ghost.on('state', (s) => {
  state = s;
  renderTabs();
  renderToolbar();
});

ghost.on('blocked', (n) => {
  state.blocked = n;
  renderShield();
});

ghost.on('adblock', (status) => {
  adblockStatus = status;
  renderShield();
});

ghost.on('focus-address', () => {
  address.focus();
  address.select();
});

// Downloads: Ring zeigt Gesamtfortschritt, Zahl = laufende Downloads
let doneTimer = null;
let lastActive = 0;
ghost.on('downloads', (s) => {
  const btn = $('downloads');
  btn.classList.toggle('active', s.active > 0);
  $('dl-ring').style.setProperty('--p', s.progress == null ? 25 : Math.round(s.progress * 100));
  const badge = $('dl-badge');
  badge.textContent = s.active;
  badge.classList.toggle('hidden', s.active === 0);
  if (lastActive > 0 && s.active < lastActive) {
    btn.classList.add('done');
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => btn.classList.remove('done'), 4000);
  }
  lastActive = s.active;
});

// Native Menüs unterhalb des Knopfes öffnen
function openMenu(which, el, alignRight = true) {
  const r = el.getBoundingClientRect();
  ghost.send('menu', { which, x: alignRight ? r.right - 260 : r.left, y: r.bottom + 4 });
}
$('menu').addEventListener('click', () => { closeQuick(); if (gm.open && gm.side !== 'left') closeMenu(); else ghost.send('menu-html', 'right'); });

// ---- Schnelleinstellungen: Panel bleibt offen, man kann mehrere Dinge nacheinander ändern ----
const quick = $('quick');
function quickSize() { ghost.send('suggest-size', quick.classList.contains('hidden') ? 0 : Math.ceil(quick.getBoundingClientRect().bottom + 12)); }
function closeQuick() {
  if (quick.classList.contains('hidden')) return;
  quick.classList.add('hidden');
  $('quick-btn').classList.remove('on');
  quickSize();
}
function renderQuick(items) {
  const list = $('quick-list');
  list.textContent = '';
  let section = '';
  for (const it of items) {
    if (it.section !== section) {
      section = it.section;
      const h = document.createElement('div');
      h.className = 'q-sec';
      h.textContent = section;
      list.append(h);
    }
    const row = document.createElement('label');
    row.className = 'q-row';
    const text = document.createElement('span');
    text.className = 'q-label';
    text.textContent = it.label;
    if (it.note && it.type === 'bool' && it.key === '@vpn') { const s = document.createElement('small'); s.textContent = it.note; text.append(s); }
    let ctrl;
    if (it.type === 'bool') {
      ctrl = document.createElement('span');
      ctrl.className = 'q-switch' + (it.value ? ' on' : '');
      row.addEventListener('click', (e) => { e.preventDefault(); setQuick(it.key, !it.value); });
    } else {
      ctrl = document.createElement('select');
      for (const [v, l] of it.options || []) ctrl.add(new Option(l, String(v), false, String(v) === String(it.value)));
      ctrl.addEventListener('change', () => setQuick(it.key, ctrl.value));
    }
    row.append(text, ctrl);
    list.append(row);
  }
  quickSize();
}
async function setQuick(key, value) {
  try {
    const r = await ghost.invoke('quick-set', { key, value });
    if (r && r.items) renderQuick(r.items);
    if (r && r.restart) $('quick-restart').classList.remove('hidden');
  } catch { /* egal */ }
}
async function openQuick() {
  closeMenu();
  // Oberfläche ist nur so hoch wie die Werkzeugleiste – Höhe am Fenster ausrichten
  quick.style.setProperty('--qmax', Math.max(260, Math.min(680, window.outerHeight - 140)) + 'px');
  quick.classList.remove('hidden');
  $('quick-btn').classList.add('on');
  renderQuick(await ghost.invoke('quick'));
}
$('quick-btn').addEventListener('click', () => (quick.classList.contains('hidden') ? openQuick() : closeQuick()));
$('quick-close').addEventListener('click', closeQuick);
$('quick-all').addEventListener('click', () => { closeQuick(); ghost.send('open-settings'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQuick(); });
// Klick auf die Seite (Oberfläche verliert den Fokus) schließt das Panel
window.addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) closeQuick(); }, 150));
ghost.on('vpn', () => { if (!quick.classList.contains('hidden')) ghost.invoke('quick').then(renderQuick); });
$('logo').addEventListener('click', () => { closeQuick(); if (gm.open && gm.side === 'left') closeMenu(); else ghost.send('menu-html', 'left'); });

// Akzentfarbe (Einstellungen)
ghost.on('theme', applyTheme);
$('downloads').addEventListener('click', (e) => openMenu('downloads', e.currentTarget));
$('video').addEventListener('click', (e) => openMenu('video', e.currentTarget));
$('translate').addEventListener('click', (e) => openMenu('translate', e.currentTarget));
$('av').addEventListener('click', () => ghost.send('av-toggle'));
$('reader').addEventListener('click', () => ghost.send('reader-toggle'));

// ---- Vorlesen: Sätze kommen als WAV vom Hauptprozess und werden nacheinander abgespielt ----
const tts = { session: 0, queue: [], audio: null, last: false };
const speakBtn = $('speak');
function ttsReset() {
  tts.queue = [];
  tts.last = false;
  if (tts.audio) { tts.audio.pause(); tts.audio = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
}
function ttsDone(session) {
  speakBtn.classList.add('hidden');
  ghost.send('tts-ended', session);
}
function ttsNext() {
  const b64 = tts.queue.shift();
  if (!b64) { tts.audio = null; if (tts.last) ttsDone(tts.session); return; }
  speakBtn.classList.remove('loading');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  const a = new Audio(url);
  tts.audio = a;
  a.onended = () => { URL.revokeObjectURL(url); if (tts.audio === a) ttsNext(); };
  a.onerror = a.onended;
  a.play().catch(() => a.onended());
}
ghost.on('tts-chunk', ({ session, audio, last }) => {
  if (session !== tts.session) { ttsReset(); tts.session = session; }
  tts.queue.push(audio);
  if (last) tts.last = true;
  if (!tts.audio) ttsNext();
});
ghost.on('tts-local', ({ session, text, rate, append }) => {
  if (!window.speechSynthesis) return;
  const play = () => {
    if (!append) ttsReset();
    tts.session = session;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = rate || 1;
    const de = speechSynthesis.getVoices().find((v) => /^de/i.test(v.lang));
    if (de) u.voice = de;
    u.onend = () => { if (tts.session === session) ttsDone(session); };
    speechSynthesis.speak(u);
  };
  // erst die laufenden KI-Sätze zu Ende spielen
  if (append && tts.audio) { tts.last = false; const wait = setInterval(() => { if (!tts.audio) { clearInterval(wait); play(); } }, 200); } else play();
  speakBtn.classList.remove('hidden', 'loading');
});
ghost.on('tts-state', ({ on, loading, note }) => {
  speakBtn.classList.toggle('hidden', !on);
  speakBtn.classList.toggle('loading', !!loading);
  speakBtn.title = note || (loading ? 'Stimme wird vorbereitet … (klicken zum Stoppen)' : 'Vorlesen stoppen');
});
ghost.on('tts-stop', () => { ttsReset(); speakBtn.classList.add('hidden'); });
speakBtn.addEventListener('click', () => ghost.send('tts-stop'));

// ---- Vorschläge beim Tippen (Lesezeichen + Verlauf) ----
const sgBox = $('suggest');
let sgItems = [];
let sgSel = -1;
let sgTimer = null;
let sgTyped = '';
const svgSearch = '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/></svg>';

function hideSuggest() {
  if (sgBox.classList.contains('hidden')) return;
  sgBox.classList.add('hidden');
  sgSel = -1;
  ghost.send('suggest-size', 0);
}

function renderSuggest() {
  sgBox.textContent = '';
  sgItems.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'sg' + (i === sgSel ? ' sel' : '');
    if (it.type === 'search') {
      const ic = document.createElement('span');
      ic.className = 'ic';
      ic.innerHTML = svgSearch;
      row.append(ic);
    } else {
      const img = document.createElement('img');
      img.src = `https://icons.duckduckgo.com/ip3/${hostOf(it.url)}.ico`;
      img.onerror = () => { img.style.visibility = 'hidden'; };
      row.append(img);
    }
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = it.title;
    row.append(t);
    if (it.url) {
      const u = document.createElement('span');
      u.className = 'u';
      u.textContent = '– ' + it.url.replace(/^https?:\/\/(www\.)?/, '');
      row.append(u);
    }
    if (it.type === 'bookmark') {
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = '★';
      row.append(k);
    }
    row.addEventListener('mousedown', (e) => { e.preventDefault(); go(it.value); });
    sgBox.append(row);
  });
}

async function updateSuggest() {
  const q = address.value.trim();
  sgTyped = address.value;
  if (!q || !editing) { hideSuggest(); return; }
  let res = [];
  try { res = await ghost.invoke('suggest', q); } catch { /* egal */ }
  if (address.value.trim() !== q || !editing) return;
  sgItems = [{ type: 'search', title: `„${q}“ suchen`, value: q }, ...res.map((r) => ({ type: r.type, title: r.title || r.url, url: r.url, value: r.url }))];
  sgSel = -1;
  renderSuggest();
  const r = $('addressform').getBoundingClientRect();
  sgBox.style.setProperty('--sx', `${r.left}px`);
  sgBox.style.setProperty('--sw', `${r.width}px`);
  sgBox.classList.remove('hidden');
  ghost.send('suggest-size', Math.ceil(sgBox.getBoundingClientRect().bottom + 24));
}

function go(value) {
  hideSuggest();
  editing = false;
  address.blur();
  ghost.send('navigate', value);
}

// Adressleiste
address.addEventListener('focus', () => { editing = true; setTimeout(() => address.select(), 0); });
address.addEventListener('blur', () => { editing = false; setTimeout(hideSuggest, 120); renderToolbar(); });
address.addEventListener('input', () => { clearTimeout(sgTimer); sgTimer = setTimeout(updateSuggest, 60); });
address.addEventListener('keydown', (e) => {
  const open = !sgBox.classList.contains('hidden');
  if (e.key === 'Escape') {
    if (open) { hideSuggest(); address.value = sgTyped; } else { address.blur(); ghost.send('focus-page'); }
  } else if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    sgSel = (sgSel + (e.key === 'ArrowDown' ? 1 : -1) + sgItems.length + 1) % (sgItems.length + 1) - 0;
    if (sgSel >= sgItems.length) sgSel = -1;
    renderSuggest();
    address.value = sgSel >= 0 && sgItems[sgSel].url ? sgItems[sgSel].url : sgTyped;
  }
});
$('addressform').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = sgSel >= 0 ? sgItems[sgSel].value : address.value.trim();
  if (!value) return;
  go(value);
});
$('star').addEventListener('click', () => ghost.send('bookmark-toggle'));

// Knöpfe
$('newtab').addEventListener('click', () => ghost.send('new-tab'));
$('newtab').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const r = e.currentTarget.getBoundingClientRect();
  ghost.send('menu', { which: 'newtab', x: r.left, y: r.bottom + 4 });
});
$('newtab').title = 'Neuer Tab (Strg+T) – Rechtsklick: privater Tab & Container';

// ---- VPN ----
const vpnBtn = $('vpn');
vpnBtn.addEventListener('click', () => ghost.send('vpn-toggle'));
ghost.on('vpn', ({ state: s, info }) => {
  vpnBtn.className = s;
  $('vpn-label').textContent = s === 'on' && info && info.loc ? `VPN · ${info.loc}` : s === 'starting' ? 'Verbinde …' : 'VPN';
  vpnBtn.title = s === 'on'
    ? `VPN aktiv über Cloudflare WARP\nSichtbare IP: ${info ? info.ip : '?'} (${info ? info.loc : '?'})\nKlicken zum Ausschalten – Strg+Umschalt+V`
    : s === 'starting' ? 'VPN verbindet …'
      : s === 'error' ? 'VPN-Fehler – klicken für neuen Versuch' : 'VPN (Cloudflare WARP) einschalten – Strg+Umschalt+V';
});
$('back').addEventListener('click', () => ghost.send('back'));
$('forward').addEventListener('click', () => ghost.send('forward'));
$('reload').addEventListener('click', () => {
  const active = state.tabs.find((t) => t.id === state.activeId);
  ghost.send(active && active.loading ? 'stop' : 'reload');
});
// Klick auf das Schild: Werbeblocker für diese Seite aus-/einschalten (Seite lädt neu)
shield.addEventListener('click', () => { if (adblockStatus === 'on') ghost.send('adblock-toggle'); });

// Doppelklick auf freie Tableiste = neuer Tab
$('tabbar').addEventListener('dblclick', (e) => {
  if (e.target.id === 'tabbar' || e.target.id === 'tabs') ghost.send('new-tab');
});

// ---- Suche auf der Seite ----
function runFind(forward = true, findNext = false) {
  ghost.send('find', { text: find.value, forward, findNext });
}
ghost.on('find-open', () => {
  document.body.classList.add('find-open');
  find.focus();
  find.select();
  if (find.value) runFind();
});
ghost.on('find-close', () => document.body.classList.remove('find-open'));
ghost.on('find-reset', () => { if (find.value) runFind(); });
ghost.on('find-next', (forward) => runFind(forward, true));
ghost.on('find-result', ({ active, total }) => {
  $('find-count').textContent = find.value ? (total ? `${active} von ${total}` : 'Keine Treffer') : '';
  find.classList.toggle('nomatch', !!find.value && total === 0);
});
find.addEventListener('input', () => runFind());
find.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ghost.send('find-close');
});
$('findbar').addEventListener('submit', (e) => { e.preventDefault(); runFind(true, true); });
$('find-next').addEventListener('click', () => runFind(true, true));
$('find-prev').addEventListener('click', () => runFind(false, true));
$('find-close').addEventListener('click', () => ghost.send('find-close'));

// ---- Hauptmenü (TZBrowser-eigen, HTML): bleibt bei Schaltern offen, schließt bei Klick daneben oder Esc ----
const gm = { root: document.createElement('div'), open: false, side: 'right', items: [], path: [], scroll: [] };
gm.root.id = 'gmenu';
document.body.append(gm.root);
const GM_W = 310;

function gmBottom() {
  let b = 0;
  gm.root.querySelectorAll('.gm-panel').forEach((p) => { b = Math.max(b, p.getBoundingClientRect().bottom); });
  return Math.ceil(b + 12);
}
function closeMenu() {
  if (!gm.open) return;
  gm.open = false;
  gm.root.textContent = '';
  $('menu').classList.remove('on');
  ghost.send('suggest-size', 0);
}
function renderMenu() {
  gm.root.querySelectorAll('.gm-panel').forEach((p, i) => { gm.scroll[i] = p.scrollTop; });
  gm.root.textContent = '';
  const limit = Math.max(320, window.outerHeight - 70);
  const btn = gm.side === 'left' ? $('logo') : $('menu');
  const r = btn.getBoundingClientRect();
  let x = gm.side === 'left' ? r.left : r.right - GM_W;
  let y = r.bottom + 4;
  let items = gm.items;
  let level = 0;
  while (items) {
    const panel = document.createElement('div');
    panel.className = 'gm-panel';
    panel.style.left = Math.max(4, x) + 'px';
    panel.style.top = y + 'px';
    panel.style.maxHeight = Math.max(200, limit - y) + 'px';
    let next = null;
    let anchor = null;
    const lvl = level;
    for (const it of items) {
      if (it.type === 'separator') {
        const s = document.createElement('div');
        s.className = 'gm-sep';
        panel.append(s);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'gm-row' + (it.enabled ? '' : ' off') + (gm.path[lvl] === it.id ? ' open' : '');
      const chk = document.createElement('span');
      chk.className = 'gm-chk';
      if ((it.type === 'checkbox' || it.type === 'radio') && it.checked) chk.textContent = it.type === 'radio' ? '●' : '✓';
      const lab = document.createElement('span');
      lab.className = 'gm-label';
      lab.textContent = it.label;
      if (it.sublabel) { const sm = document.createElement('small'); sm.textContent = it.sublabel; lab.append(sm); }
      const acc = document.createElement('span');
      acc.className = 'gm-acc';
      acc.textContent = it.submenu ? '›' : it.accel;
      row.append(chk, lab, acc);
      if (it.enabled) {
        row.addEventListener('mouseenter', () => {
          if (it.submenu) {
            if (gm.path[lvl] !== it.id) { gm.path = gm.path.slice(0, lvl); gm.path[lvl] = it.id; renderMenu(); }
          } else if (gm.path.length > lvl) { gm.path = gm.path.slice(0, lvl); renderMenu(); }
        });
        row.addEventListener('click', () => {
          if (it.submenu) { gm.path = gm.path.slice(0, lvl); gm.path[lvl] = it.id; renderMenu(); return; }
          ghost.send('menu-click', it.id);
        });
      }
      panel.append(row);
      if (gm.path[lvl] === it.id && it.submenu) { next = it.submenu; anchor = row; }
    }
    gm.root.append(panel);
    if (gm.scroll[lvl]) panel.scrollTop = gm.scroll[lvl];
    // Untermenü passt nicht mehr nach unten? Dann nach oben schieben
    const pr = panel.getBoundingClientRect();
    if (pr.bottom > limit) panel.style.top = Math.max(r.bottom + 4, limit - pr.height) + 'px';
    if (!next) break;
    const p2 = panel.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    x = gm.side === 'left' ? p2.right - 2 : p2.left - GM_W + 2;
    if (x < 4) x = p2.right - 2;
    if (x + GM_W > window.innerWidth) x = p2.left - GM_W + 2;
    y = ar.top - 7;
    items = next;
    level++;
  }
  gm.path = gm.path.slice(0, level + 1);
  ghost.send('suggest-size', gmBottom());
}
ghost.on('menu-open', ({ items, side }) => {
  closeQuick();
  gm.items = items;
  gm.side = side;
  gm.path = [];
  gm.scroll = [];
  gm.open = true;
  $('menu').classList.toggle('on', side !== 'left');
  renderMenu();
});
ghost.on('menu-update', ({ items }) => { if (!gm.open) return; gm.items = items; renderMenu(); });
ghost.on('menu-close', closeMenu);
document.addEventListener('mousedown', (e) => {
  if (!gm.open) return;
  if (e.target.closest('.gm-panel') || e.target.closest('#menu') || e.target.closest('#logo')) return;
  closeMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) closeMenu(); }, 150));
