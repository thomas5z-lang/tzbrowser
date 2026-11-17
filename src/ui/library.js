'use strict';
// Bibliothek: Lesezeichen und Verlauf verwalten

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (/^#[0-9a-f]{6}$/i.test(params.get('accent') || '')) document.documentElement.style.setProperty('--accent', params.get('accent'));
let view = params.get('tab') === 'verlauf' ? 'hist' : 'bm';

const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const fav = (u) => `https://icons.duckduckgo.com/ip3/${host(u)}.ico`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(label, cls, onClick) {
  const b = el('button', cls, label);
  b.addEventListener('click', onClick);
  return b;
}
function icon(u) {
  const i = el('img', 'fav');
  i.src = fav(u);
  i.onerror = () => { i.style.visibility = 'hidden'; };
  return i;
}
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Lesezeichen ----------
async function renderBookmarks() {
  const q = $('search').value.trim().toLowerCase();
  const all = await lib.bookmarks();
  const list = $('bm-list');
  list.textContent = '';
  $('bm-empty').classList.toggle('hidden', all.length > 0);
  $('sub').textContent = `${all.length} Lesezeichen · nur auf diesem PC`;
  for (const b of all.filter((x) => !q || x.title.toLowerCase().includes(q) || x.url.toLowerCase().includes(q))) {
    const row = el('div', 'row lib');
    // Titel ist ein Link (Klick öffnet die Seite); umbenennen geht über den Knopf
    const titleLink = el('a', 'bm-title', b.title);
    titleLink.href = b.url;
    titleLink.target = '_blank';
    titleLink.title = 'Öffnen: ' + b.url;
    const title = el('input', 'field hidden');
    title.value = b.title;
    const titleBox = el('div', 'bm-titlebox');
    titleBox.append(titleLink, title);
    const link = el('div', 'site');
    const a = el('a', null, host(b.url));
    a.href = b.url;
    a.target = '_blank';
    link.append(a, el('small', 'url', b.url));
    const save = button('Speichern', 'ghost-btn accent hidden', async () => {
      await lib.updateBookmark({ id: b.id, title: title.value });
      toast('Gespeichert');
      renderBookmarks();
    });
    const rename = button('Umbenennen', 'ghost-btn', () => {
      titleLink.classList.add('hidden');
      title.classList.remove('hidden');
      rename.classList.add('hidden');
      save.classList.remove('hidden');
      title.focus();
      title.select();
    });
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); if (e.key === 'Escape') renderBookmarks(); });
    const actions = el('div', 'actions');
    actions.append(rename, save, button('Löschen', 'ghost-btn danger', async () => { await lib.removeBookmark(b.id); renderBookmarks(); }));
    const ic = icon(b.url);
    ic.style.cursor = 'pointer';
    ic.addEventListener('click', () => titleLink.click());
    row.append(ic, titleBox, link, actions);
    list.append(row);
  }
}

async function renderImport() {
  const box = $('import');
  for (const s of await lib.importSources()) {
    if (!s.available) continue;
    box.append(button(s.name, 'ghost-btn', async () => {
      const r = await lib.importFrom(s.id);
      toast(r.error ? r.error : `${r.added} neue Lesezeichen aus ${s.name} übernommen`);
      renderBookmarks();
    }));
  }
  if (box.children.length === 1) box.append(el('span', 'label', 'kein anderer Browser gefunden'));
}

// ---------- Verlauf ----------
const dayLabel = (t) => {
  const d = new Date(t);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000);
  if (diff <= 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

async function renderHistory() {
  const items = await lib.history($('search').value);
  const list = $('hist-list');
  list.textContent = '';
  $('hist-empty').classList.toggle('hidden', items.length > 0);
  let lastDay = '';
  for (const h of items) {
    const day = dayLabel(h.time);
    if (day !== lastDay) { list.append(el('div', 'day', day)); lastDay = day; }
    const row = el('div', 'row hist');
    const site = el('div', 'site');
    const a = el('a', null, h.title || host(h.url));
    a.href = h.url;
    a.target = '_blank';
    site.append(a);
    const actions = el('div', 'actions');
    actions.append(button('Entfernen', 'ghost-btn', async () => { await lib.removeHistory({ url: h.url, time: h.time }); row.remove(); }));
    row.append(el('span', 'time', new Date(h.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })), icon(h.url), site, el('span', 'url', h.url), actions);
    list.append(row);
  }
  $('sub').textContent = `${items.length >= 300 ? '300+' : items.length} Einträge angezeigt · private Tabs werden nie gespeichert`;
}

document.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', async () => {
  const v = b.dataset.clear;
  if (!confirm(v === 'all' ? 'Den gesamten Verlauf löschen?' : `Verlauf für „${b.textContent}“ löschen?`)) return;
  await lib.clearHistory(v === 'all' ? null : Number(v));
  toast('Verlauf gelöscht');
  renderHistory();
}));

// ---------- Umschalten ----------
function show(v) {
  view = v;
  $('tab-bm').classList.toggle('active', v === 'bm');
  $('tab-hist').classList.toggle('active', v === 'hist');
  $('sec-bm').classList.toggle('hidden', v !== 'bm');
  $('sec-hist').classList.toggle('hidden', v !== 'hist');
  $('h').textContent = v === 'bm' ? 'Lesezeichen' : 'Verlauf';
  document.title = v === 'bm' ? 'Lesezeichen' : 'Verlauf';
  (v === 'bm' ? renderBookmarks : renderHistory)();
}
$('tab-bm').addEventListener('click', () => show('bm'));
$('tab-hist').addEventListener('click', () => show('hist'));
let t;
$('search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => (view === 'bm' ? renderBookmarks : renderHistory)(), 150); });

renderImport();
show(view);
