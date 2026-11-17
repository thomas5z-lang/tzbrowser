'use strict';
// TZBrowser KI – Chat-Oberfläche im Seitenleisten-Panel

const $ = (id) => document.getElementById(id);
const accent = new URLSearchParams(location.search).get('accent');
if (/^#[0-9a-f]{6}$/i.test(accent || '')) document.documentElement.style.setProperty('--accent', accent);

let messages = []; // Chatverlauf für Ollama
let currentId = null;
let currentEl = null;
let currentText = '';

const QUICK = {
  sum: 'Fasse die Seite in 5–8 Stichpunkten zusammen. Beginne mit einem Satz, worum es geht.',
  simple: 'Erkläre den Inhalt der Seite so einfach, dass ihn ein 12-Jähriger versteht.',
  points: 'Was sind die wichtigsten Kernaussagen und Fakten der Seite? Nenne sie als nummerierte Liste.',
  translate: 'Übersetze den markierten Text (oder, falls nichts markiert ist, den Hauptinhalt der Seite) ins Deutsche.',
};

// ---------- kleine, sichere Markdown-Darstellung ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function md(src) {
  const blocks = [];
  let text = esc(src).replace(/```[\w-]*\n?([\s\S]*?)(```|$)/g, (_m, code) => { blocks.push(code); return `\u0000${blocks.length - 1}\u0000`; });
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  const out = [];
  let list = null;
  for (const line of text.split('\n')) {
    if (!line.trim() && list) continue; // Leerzeilen zwischen Listenpunkten beenden die Liste nicht
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (list !== type) { if (list) out.push(`</${list}>`); out.push(`<${type}>`); list = type; }
      out.push(`<li>${(ul || ol)[1]}</li>`);
      continue;
    }
    if (list) { out.push(`</${list}>`); list = null; }
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) out.push(`<p><b>${h[1]}</b></p>`);
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_m, i) => `<pre>${blocks[Number(i)]}</pre>`);
}

function add(cls, html) {
  $('welcome').classList.add('hidden');
  const d = document.createElement('div');
  d.className = `msg ${cls}`;
  d.innerHTML = html;
  $('log').append(d);
  $('log').scrollTop = $('log').scrollHeight;
  return d;
}

function setBusy(busy) {
  const b = $('send');
  b.classList.toggle('stop', busy);
  b.title = busy ? 'Stoppen' : 'Senden';
  b.innerHTML = busy
    ? '<svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1"/></svg>'
    : '<svg viewBox="0 0 16 16"><path d="M2.5 8h11M9 3.5 13.5 8 9 12.5"/></svg>';
}

async function send(text, { withPage = $('usepage').checked } = {}) {
  if (currentId) return;
  const model = $('model').value;
  if (!model) { add('err', 'Kein Modell verfügbar. Prüfe die Ollama-Adresse in den Einstellungen (Zahnrad).'); return; }
  let content = text;
  if (withPage) {
    const page = await ai.page();
    if (!page) { add('err', 'Auf dieser Seite gibt es keinen lesbaren Inhalt (z. B. Startseite oder interne TZBrowser-Seite).'); return; }
    content = `Seite: ${page.title}\nAdresse: ${page.url}\n`
      + (page.selection ? `\nMarkierter Text:\n"""${page.selection}"""\n` : '')
      + `\nSeiteninhalt (gekürzt):\n"""${page.text}"""\n\nAufgabe: ${text}`;
    add('user', `${esc(text)}<br><small style="opacity:.6">📄 ${esc(page.title)}</small>`);
  } else {
    add('user', esc(text));
  }
  messages.push({ role: 'user', content });
  currentId = `${Date.now()}`;
  currentText = '';
  currentEl = add('bot cursor', '');
  setBusy(true);
  ai.chat({ id: currentId, model, messages, think: $('think').checked });
}

// Beim Nachdenken eine kleine Anzeige statt des ganzen Gedankengangs
ai.onThinking(({ id }) => {
  if (id !== currentId || currentText) return;
  currentEl.innerHTML = '<span style="color:var(--muted)">💭 denkt nach …</span>';
});

ai.on('ai:chunk', ({ id, text }) => {
  if (id !== currentId) return;
  currentText += text;
  // Falls ein Modell seine Gedanken doch im Text liefert: ausblenden
  currentEl.innerHTML = md(currentText.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart());
  $('log').scrollTop = $('log').scrollHeight;
});
ai.on('ai:done', ({ id }) => {
  if (id !== currentId) return;
  currentEl.classList.remove('cursor');
  if (currentText) messages.push({ role: 'assistant', content: currentText });
  else currentEl.remove();
  currentId = null;
  setBusy(false);
});
ai.on('ai:error', ({ id, error }) => {
  if (id !== currentId) return;
  currentEl.remove();
  messages.pop();
  add('err', `Ollama-Fehler: ${esc(error)}`);
  currentId = null;
  setBusy(false);
});

// ---------- Modelle & Einstellungen ----------
async function loadModels() {
  const sel = $('model');
  sel.textContent = '';
  sel.append(new Option('verbinde mit Ollama …', ''));
  try {
    const list = await ai.models();
    sel.textContent = '';
    const cfg = await ai.config();
    if (!list.length) {
      sel.append(new Option('keine Modelle installiert', ''));
      add('info', 'Ollama läuft, aber es ist kein Modell installiert (z. B. „ollama pull qwen3“).');
      return;
    }
    for (const m of list) sel.append(new Option(`${m.name} (${(m.size / 1e9).toFixed(1)} GB)`, m.name));
    if (list.some((m) => m.name === cfg.model)) sel.value = cfg.model;
  } catch (e) {
    sel.textContent = '';
    sel.append(new Option('Ollama nicht erreichbar', ''));
    const cfg = await ai.config().catch(() => ({ url: '?' }));
    add('err', `Ollama unter <code>${esc(cfg.url)}</code> nicht erreichbar. Läuft Ollama? Adresse im Zahnrad prüfen.`);
  }
}

$('model').addEventListener('change', () => ai.setConfig({ model: $('model').value }));
$('think').addEventListener('change', () => ai.setConfig({ think: $('think').checked }));
ai.config().then((c) => { $('think').checked = !!c.think; });
$('gear').addEventListener('click', async () => {
  const s = $('settings');
  s.classList.toggle('hidden');
  if (!s.classList.contains('hidden')) $('url').value = (await ai.config()).url;
});
$('url').addEventListener('change', async () => {
  await ai.setConfig({ url: $('url').value });
  add('info', `Ollama-Adresse gespeichert: ${esc($('url').value)}`);
  loadModels();
});
$('new').addEventListener('click', () => {
  if (currentId) ai.stop(currentId);
  messages = [];
  $('log').querySelectorAll('.msg').forEach((m) => m.remove());
  $('welcome').classList.remove('hidden');
});

// ---------- Eingabe ----------
const input = $('input');
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
});
function submit() {
  const t = input.value.trim();
  if (!t) return;
  input.value = '';
  input.style.height = 'auto';
  send(t);
}
$('send').addEventListener('click', () => (currentId ? ai.stop(currentId) : submit()));
document.querySelectorAll('#quick button').forEach((b) => b.addEventListener('click', () => send(QUICK[b.dataset.q], { withPage: true })));

loadModels();
