'use strict';
// Einstellungsseite: baut die Liste aus dem Aufbau, den der Hauptprozess liefert.
const $ = (id) => document.getElementById(id);
const accent = new URLSearchParams(location.search).get('accent');
if (accent) document.documentElement.style.setProperty('--accent', accent);

function backupControl(flash) {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%';
  const pass = document.createElement('input');
  pass.type = 'password';
  pass.placeholder = 'Sicherungs-Passwort (mind. 8 Zeichen)';
  pass.autocomplete = 'new-password';
  const withSettings = document.createElement('label');
  withSettings.style.cssText = 'font-weight:400;font-size:12.5px;color:var(--muted);display:flex;gap:6px;align-items:center';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  withSettings.append(cb, 'Beim Einlesen auch Einstellungen übernehmen');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px';
  const run = async (name) => {
    try {
      const msg = await window.ghostSettings.action(name, { pass: pass.value, settings: cb.checked });
      if (msg) { flash(true); alert(msg); pass.value = ''; }
    } catch (e) { flash(false, String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  };
  for (const [name, label] of [['backupExport', 'Sichern …'], ['backupImport', 'Einlesen …']]) {
    const b = document.createElement('button');
    b.className = 'ghost-btn';
    b.textContent = label;
    b.onclick = () => run(name);
    row.append(b);
  }
  box.append(pass, withSettings, row);
  return box;
}

function control(item, flash) {
  if (item.type === 'backup') return backupControl(flash);
  if (item.type === 'design') return designControl(flash);
  const save = async (value) => {
    try {
      const r = await window.ghostSettings.save(item.key, value);
      flash(true);
      if (r.restart) $('restart').classList.remove('hidden');
      if (item.key === 'accent') document.documentElement.style.setProperty('--accent', r.value);
    } catch (e) {
      flash(false, String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };
  if (item.type === 'bool') {
    const wrap = document.createElement('label');
    wrap.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.value;
    cb.onchange = () => save(cb.checked);
    wrap.append(cb, document.createElement('span'));
    return wrap;
  }
  if (item.type === 'select') {
    const sel = document.createElement('select');
    for (const [v, label] of item.options || []) {
      const o = new Option(label, String(v), false, String(v) === String(item.value));
      sel.add(o);
    }
    if (item.value !== undefined && ![...sel.options].some((o) => o.selected)) sel.add(new Option(String(item.value), String(item.value), true, true));
    sel.onchange = () => save(sel.value);
    return sel;
  }
  if (item.type === 'list') {
    const ta = document.createElement('textarea');
    ta.value = (item.value || []).join('\n');
    ta.spellcheck = false;
    ta.onchange = () => save(ta.value.split('\n'));
    return ta;
  }
  const inp = document.createElement('input');
  inp.type = item.type === 'number' ? 'number' : 'text';
  inp.value = item.value ?? '';
  inp.spellcheck = false;
  inp.onchange = () => save(inp.value);
  return inp;
}

async function render() {
  const { version, items } = await window.ghostSettings.schema();
  $('ver').textContent = `TZBrowser ${version} · von ZeroCool`;
  const list = $('list');
  list.textContent = '';
  let card = null;
  let section = '';
  for (const item of items) {
    if (item.section !== section) {
      section = item.section;
      const h = document.createElement('h2');
      h.textContent = section;
      card = document.createElement('div');
      card.className = 'card';
      list.append(h, card);
    }
    const row = document.createElement('div');
    row.className = 'opt' + (item.type === 'design' ? ' wide' : '');
    row.dataset.search = `${section} ${item.label} ${item.note || ''}`.toLowerCase();
    const label = document.createElement('label');
    label.textContent = item.label;
    if (item.note || item.restart) {
      const s = document.createElement('small');
      s.textContent = [item.note, item.restart ? 'Wirkt nach Neustart.' : ''].filter(Boolean).join(' ');
      label.append(s);
    }
    const ctrl = document.createElement('div');
    ctrl.className = 'ctrl';
    const ok = document.createElement('span');
    ok.className = 'saved';
    let t = null;
    const flash = (good, msg) => {
      ok.textContent = good ? '✓ gespeichert' : '✗ ' + (msg || 'Fehler');
      ok.classList.toggle('err', !good);
      ok.classList.add('show');
      clearTimeout(t);
      t = setTimeout(() => ok.classList.remove('show'), good ? 1500 : 4000);
    };
    const c = control(item, flash);
    ctrl.append(ok, c);
    if (item.action) {
      const b = document.createElement('button');
      b.className = 'ghost-btn';
      b.textContent = item.action[1];
      b.onclick = async () => {
        const v = await window.ghostSettings.action(item.action[0]);
        if (typeof v === 'string' && c.tagName === 'INPUT') { c.value = v; flash(true); }
      };
      ctrl.append(b);
    }
    row.append(label, ctrl);
    card.append(row);
  }
}

$('search').addEventListener('input', () => {
  const q = $('search').value.trim().toLowerCase();
  for (const row of document.querySelectorAll('.opt')) row.classList.toggle('hidden', !!q && !row.dataset.search.includes(q));
  for (const h of document.querySelectorAll('h2')) {
    const card = h.nextElementSibling;
    const any = [...card.querySelectorAll('.opt')].some((r) => !r.classList.contains('hidden'));
    h.classList.toggle('hidden', !any);
    card.classList.toggle('hidden', !any);
  }
});
$('restart-btn').addEventListener('click', () => window.ghostSettings.action('restart'));
$('data-btn').addEventListener('click', () => window.ghostSettings.action('openData'));
render();

// ---------- Design-Editor (Einstellungen → Design) ----------
function designControl(flash) {
  const box = document.createElement('div');
  box.className = 'design';
  const err = (e) => flash(false, String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  const field = (label, input, extra) => {
    const l = document.createElement('label');
    l.className = 'd-field';
    const s = document.createElement('span');
    s.textContent = label;
    l.append(s, input);
    if (extra) l.append(extra);
    return l;
  };
  const btn = (text, fn, cls = 'ghost-btn') => { const b = document.createElement('button'); b.className = cls; b.textContent = text; b.onclick = fn; return b; };

  async function build() {
    const d = await window.ghostSettings.design.get();
    box.textContent = '';

    // Stufe 2: von Webseite übernehmen
    const site = document.createElement('div');
    site.className = 'd-site';
    const url = document.createElement('input');
    url.type = 'text';
    url.placeholder = 'Adresse der Firmen-Webseite, z. B. www.beispiel.de';
    const go = btn('Von Webseite übernehmen', async () => {
      if (!url.value.trim()) return;
      go.disabled = true;
      go.textContent = 'Lese Webseite …';
      try {
        const r = await window.ghostSettings.design.site(url.value.trim());
        flash(true);
        alert(`Übernommen von ${r.home}:\n• Name: ${r.name}\n• Akzentfarbe: ${r.accent}\n• Hintergrund: ${r.bg} · Text: ${r.text}\n• Schrift: ${r.font || (r.fontFound ? r.fontFound + ' (nicht verfügbar – Standard)' : 'Standard')}\n• Logo: ${r.logo ? 'gefunden' : 'nicht gefunden'}\n\nDu kannst alles unten noch anpassen.`);
        build();
      } catch (e) { err(e); }
      go.disabled = false;
      go.textContent = 'Von Webseite übernehmen';
    }, 'ghost-btn accent');
    site.append(url, go);
    box.append(site);

    // Stufe 1: selbst einstellen
    const grid = document.createElement('div');
    grid.className = 'd-grid';
    const name = document.createElement('input');
    name.type = 'text';
    name.value = d.name;
    name.maxLength = 40;
    const colors = {};
    for (const k of ['accent', 'bg', 'text']) {
      colors[k] = document.createElement('input');
      colors[k].type = 'color';
      colors[k].value = d[k];
    }
    const font = document.createElement('select');
    for (const [v, l] of d.fonts) font.add(new Option(l, v, false, v === d.font));
    grid.append(
      field('Name (Startseite)', name),
      field('Akzentfarbe', colors.accent),
      field('Hintergrund', colors.bg),
      field('Schrift­farbe', colors.text),
      field('Schriftart', font),
    );
    box.append(grid);

    // Logo und Hintergrundbild
    const media = document.createElement('div');
    media.className = 'd-media';
    const logo = document.createElement('div');
    logo.className = 'd-logo';
    if (d.logo) { const img = document.createElement('img'); img.src = d.logo; logo.append(img); } else logo.textContent = 'Kein eigenes Logo (TZBrowser-Geist)';
    media.append(
      logo,
      btn('Logo wählen …', async () => { try { if (await window.ghostSettings.design.pick('logo')) { flash(true); build(); } } catch (e) { err(e); } }),
      btn('Logo entfernen', async () => { await window.ghostSettings.design.clear('logo'); flash(true); build(); }),
      btn(d.newtabBg ? 'Hintergrundbild ändern …' : 'Hintergrundbild (Startseite) …', async () => { try { if (await window.ghostSettings.design.pick('bg')) { flash(true); build(); } } catch (e) { err(e); } }),
    );
    if (d.newtabBg) media.append(btn('Hintergrundbild entfernen', async () => { await window.ghostSettings.design.clear('bg'); flash(true); build(); }));
    box.append(media);

    // Kacheln
    const tiles = document.createElement('textarea');
    tiles.value = d.tiles.map((t) => `${t.name} | ${t.url}`).join('\n');
    tiles.spellcheck = false;
    box.append(field('Kacheln auf der Startseite (eine pro Zeile: Name | Adresse, max. 16)', tiles));

    const actions = document.createElement('div');
    actions.className = 'd-actions';
    actions.append(
      btn('Design anwenden', async () => {
        const list = tiles.value.split('\n').map((l) => l.split('|')).filter((p) => p[1] || p[0]).map((p) => ({ name: (p[1] ? p[0] : '').trim(), url: (p[1] || p[0]).trim() }));
        try {
          await window.ghostSettings.design.set({ name: name.value, accent: colors.accent.value, bg: colors.bg.value, text: colors.text.value, font: font.value, tiles: list });
          document.documentElement.style.setProperty('--accent', colors.accent.value);
          flash(true);
        } catch (e) { err(e); }
      }, 'ghost-btn accent'),
      btn('Als Datei speichern …', async () => { try { const f = await window.ghostSettings.design.export(); if (f) { flash(true); alert('Design gespeichert:\n' + f); } } catch (e) { err(e); } }),
      btn('Design-Datei laden …', async () => { try { if (await window.ghostSettings.design.import()) { flash(true); build(); } } catch (e) { err(e); } }),
      btn('Auf TZBrowser-Standard zurücksetzen', async () => { if (confirm('Eigenes Design löschen und zum TZBrowser-Standard zurückkehren?')) { await window.ghostSettings.design.reset(); flash(true); build(); } }, 'ghost-btn danger'),
    );
    box.append(actions);
  }
  build();
  return box;
}
