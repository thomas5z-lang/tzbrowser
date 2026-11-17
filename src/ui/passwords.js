'use strict';
// Verwaltungsseite für gespeicherte Passwörter

const $ = (id) => document.getElementById(id);
const accentParam = new URLSearchParams(location.search).get('accent');
if (/^#[0-9a-f]{6}$/i.test(accentParam || '')) document.documentElement.style.setProperty('--accent', accentParam);
let entries = [];

const fav = (origin) => `https://icons.duckduckgo.com/ip3/${new URL(origin).hostname}.ico`;
const date = (t) => (t ? new Date(t).toLocaleDateString('de-DE') : '–');

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 1800);
}

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

function render() {
  const q = $('search').value.trim().toLowerCase();
  const list = $('list');
  list.textContent = '';
  const shown = entries.filter((e) => !q || e.site.toLowerCase().includes(q) || e.username.toLowerCase().includes(q));
  $('empty').classList.toggle('hidden', entries.length > 0);

  for (const e of shown) {
    const row = el('div', 'row');
    const icon = el('img', 'fav');
    icon.src = fav(e.origin);
    icon.onerror = () => { icon.style.visibility = 'hidden'; };

    const site = el('div', 'site');
    const a = el('a', null, e.site);
    a.href = e.origin;
    a.target = '_blank';
    site.append(a, el('small', null, `geändert ${date(e.updated)} · zuletzt genutzt ${date(e.used)}`));

    const user = el('input', 'field');
    user.value = e.username;
    user.placeholder = '(ohne Benutzername)';
    user.spellcheck = false;

    const pass = el('input', 'field pw');
    pass.type = 'password';
    pass.value = '••••••••••';
    pass.readOnly = true;
    let revealed = false;

    const show = button('Anzeigen', 'ghost-btn', async () => {
      if (!revealed) {
        pass.value = (await pwm.reveal(e.id)) || '';
        pass.type = 'text';
        pass.readOnly = false;
        revealed = true;
        show.textContent = 'Verbergen';
      } else {
        pass.type = 'password';
        pass.value = '••••••••••';
        pass.readOnly = true;
        revealed = false;
        show.textContent = 'Anzeigen';
      }
    });
    const copy = button('Kopieren', 'ghost-btn', async () => {
      await navigator.clipboard.writeText((await pwm.reveal(e.id)) || '');
      toast('Passwort kopiert – wird in 30 s aus der Zwischenablage gelöscht');
      setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30_000);
    });
    const saveBtn = button('Speichern', 'ghost-btn accent hidden', async () => {
      await pwm.update({ id: e.id, username: user.value, password: revealed ? pass.value : undefined });
      saveBtn.classList.add('hidden');
      toast('Gespeichert');
      load();
    });
    const markDirty = () => saveBtn.classList.remove('hidden');
    user.addEventListener('input', markDirty);
    pass.addEventListener('input', markDirty);

    const del = button('Löschen', 'ghost-btn danger', async () => {
      if (!confirm(`Passwort für ${e.site}${e.username ? ` (${e.username})` : ''} wirklich löschen?`)) return;
      await pwm.remove(e.id);
      toast('Gelöscht');
      load();
    });

    const actions = el('div', 'actions');
    actions.append(saveBtn, show, copy, del);
    row.append(icon, site, user, pass, actions);
    list.append(row);
  }
}

async function load() {
  entries = await pwm.list();
  const info = await pwm.info();
  $('sub').textContent = `${info.count} gespeichert · verschlüsselt mit deinem Windows-Konto · nur auf diesem PC`
    + (info.encryption ? '' : ' · ⚠ Windows-Verschlüsselung nicht verfügbar');
  render();

  const never = await pwm.never();
  const box = $('never');
  box.textContent = '';
  $('never-empty').classList.toggle('hidden', never.length > 0);
  for (const n of never) {
    const chip = el('div', 'chip', n.site);
    chip.append(button('✕', 'chip-x', async () => { await pwm.neverRemove(n.origin); load(); }));
    box.append(chip);
  }
}

$('search').addEventListener('input', render);
load();
