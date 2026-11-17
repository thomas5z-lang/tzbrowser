'use strict';
// Fremdsprachige Seiten automatisch auf Deutsch übersetzen.
// Standard: Google (schnell, wie in Chrome). Umschaltbar auf Ollama (lokal).
// Private Tabs gehen nie an Google – dort nur Ollama.

const { ipcMain, session } = require('electron');
const path = require('path');
const settings = require('./settings');
const ai = require('./ai');
const containers = require('./containers');

const PRELOAD = path.join(__dirname, '..', 'preload', 'translate-page.js');
const GOOGLE = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=de&dj=1&format=text';

const LANGS = {
  en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', pt: 'Portugiesisch', nl: 'Niederländisch',
  pl: 'Polnisch', ru: 'Russisch', uk: 'Ukrainisch', tr: 'Türkisch', ja: 'Japanisch', ko: 'Koreanisch', zh: 'Chinesisch',
  'zh-CN': 'Chinesisch', 'zh-TW': 'Chinesisch', ar: 'Arabisch', cs: 'Tschechisch', sv: 'Schwedisch', da: 'Dänisch',
  no: 'Norwegisch', fi: 'Finnisch', hu: 'Ungarisch', ro: 'Rumänisch', el: 'Griechisch', vi: 'Vietnamesisch', th: 'Thai', id: 'Indonesisch',
};
const langName = (l) => LANGS[l] || LANGS[String(l || '').split('-')[0]] || String(l || '?').toUpperCase();

const cache = new Map(); // Originaltext -> Deutsch
const states = new Map(); // webContentsId -> { from, active, engine }
let onChange = () => {};
let isTab = () => true;

const engine = () => settings.get('translateEngine') || 'google';
const neverHosts = () => settings.get('translateNeverHosts') || [];
const neverLangs = () => settings.get('translateNeverLangs') || [];
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function remember(src, de) {
  if (cache.size > 8000) cache.delete(cache.keys().next().value);
  cache.set(src, de);
}

function isPrivate(wc) {
  try { return wc.session === session.fromPartition(containers.PRIVATE.partition || 'ghost-privat'); } catch { return false; }
}

// ---------- Google ----------
async function viaGoogle(ses, texts) {
  const body = new URLSearchParams();
  for (const t of texts) body.append('q', t);
  const r = await ses.fetch(GOOGLE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString(),
  });
  if (!r.ok) throw new Error('Google-Übersetzer: ' + r.status);
  let data = await r.json();
  // Bei einem einzelnen Text kommt kein verschachteltes Feld zurück
  if (texts.length === 1 && !Array.isArray(data[0])) data = [data];
  return data.map((d) => (Array.isArray(d) ? { text: d[0], lang: d[1] } : { text: String(d), lang: '' }));
}

// ---------- Ollama ----------
async function viaOllama(texts) {
  await ai.ensureOllama();
  const model = settings.get('translateModel') || 'qwen2.5:7b';
  const prompt = `Übersetze jeden der ${texts.length} Einträge dieses JSON-Arrays ins Deutsche. HTML-Tags unverändert lassen. `
    + `Antworte als JSON-Objekt {"t": [...]} mit genau ${texts.length} Übersetzungen in derselben Reihenfolge.\n` + JSON.stringify(texts);
  const r = await fetch(ai.baseUrl() + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // strukturierte Ausgabe: Ollama muss genau dieses Format liefern
    body: JSON.stringify({ model, stream: false, think: false, keep_alive: '15m', options: { temperature: 0.1 },
      format: { type: 'object', properties: { t: { type: 'array', items: { type: 'string' } } }, required: ['t'] },
      messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error('Ollama: ' + r.status);
  const out = (await r.json()).message?.content || '';
  const parsed = JSON.parse(out);
  let arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.t) ? parsed.t : [];
  if (arr.length !== texts.length) console.warn(`[translate] Ollama lieferte ${arr.length} statt ${texts.length} Einträge`);
  return texts.map((t, i) => ({ text: typeof arr[i] === 'string' ? arr[i] : t, lang: '' }));
}

async function translate(wc, texts) {
  const result = new Array(texts.length);
  const todo = [];
  texts.forEach((t, i) => { if (cache.has(t)) result[i] = { text: cache.get(t), lang: '' }; else todo.push(i); });
  let detected = '';
  if (todo.length) {
    const priv = isPrivate(wc);
    const useOllama = engine() === 'ollama' || priv;
    const src = todo.map((i) => texts[i]);
    const out = [];
    // in handliche Pakete teilen
    for (let a = 0; a < src.length;) {
      let b = a;
      let len = 0;
      while (b < src.length && (b === a || (len + src[b].length < (useOllama ? 1500 : 4500) && b - a < (useOllama ? 25 : 120)))) { len += src[b].length; b++; }
      const part = src.slice(a, b);
      out.push(...(useOllama ? await viaOllama(part) : await viaGoogle(wc.session, part)));
      a = b;
    }
    out.forEach((o, k) => {
      const i = todo[k];
      result[i] = o;
      if (o.lang && !detected) detected = o.lang;
      if (o.text && o.lang !== 'de') remember(texts[i], o.text);
    });
  }
  return { texts: result.map((r, i) => (r && r.text) || texts[i]), detected };
}

function setup(changeCallback, isTabFn) {
  onChange = changeCallback;
  if (isTabFn) isTab = isTabFn;
  ipcMain.handle('ghost:tr-config', (event, { lang }) => {
    const wc = event.sender;
    if (!isTab(wc)) return { go: false }; // keine Panels (WhatsApp, Discord …)
    const host = hostOf(wc.getURL());
    const base = String(lang || '').split('-')[0].toLowerCase();
    const forced = states.get(wc.id) && states.get(wc.id).forced;
    const auto = settings.get('translateAuto') === true;
    if (!forced && (!auto || neverHosts().includes(host) || (base && neverLangs().includes(base)))) return { go: false };
    return { go: true, engine: isPrivate(wc) ? 'ollama' : engine() };
  });
  ipcMain.handle('ghost:translate', async (event, { texts }) => {
    if (!Array.isArray(texts) || !texts.length) return { texts: [], detected: '' };
    try {
      return await translate(event.sender, texts.map((t) => String(t).slice(0, 5000)).slice(0, 400));
    } catch (e) {
      console.error('[translate] ' + e.message);
      return { error: e.message };
    }
  });
  ipcMain.on('ghost:tr-state', (event, st) => {
    const wc = event.sender;
    const prev = states.get(wc.id) || {};
    states.set(wc.id, { ...prev, from: st.from || prev.from || '', active: !!st.active, busy: !!st.busy, original: !!st.original || (!!prev.original && !st.active) });
    onChange(wc.id);
  });
}

function prepareSession(ses) {
  ses.registerPreloadScript({ type: 'frame', id: 'ghost-translate', filePath: PRELOAD });
}

function reset(wcId) {
  const s = states.get(wcId);
  states.delete(wcId);
  if (s && s.forced) states.set(wcId, { forced: true }); // „Trotzdem übersetzen“ gilt bis zum Neuladen
}

function stateFor(wcId) {
  const s = states.get(wcId);
  if (!s || !(s.active || s.busy || s.original)) return null;
  return { from: langName(s.from), active: !!s.active, busy: !!s.busy && !s.active };
}

function command(wc, cmd) {
  const s = states.get(wc.id) || {};
  if (cmd === 'translate') s.forced = true;
  states.set(wc.id, s);
  wc.send('ghost:tr-cmd', cmd);
}

// Untermenü (☰ und Übersetzen-Knopf)
function menuTemplate(wc, rebuild) {
  const s = (wc && states.get(wc.id)) || {};
  const host = wc ? hostOf(wc.getURL()) : '';
  const lang = String(s.from || '').split('-')[0];
  const toggleList = (key, value) => {
    const list = settings.get(key) || [];
    settings.set(key, list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };
  const items = [];
  if (wc && s.active) items.push({ label: 'Original anzeigen', click: () => command(wc, 'original') });
  else if (wc) items.push({ label: 'Diese Seite auf Deutsch übersetzen', click: () => command(wc, 'translate') });
  items.push({ type: 'separator' },
    { label: 'Fremdsprachige Seiten automatisch übersetzen', type: 'checkbox', checked: settings.get('translateAuto') === true, click: (i) => settings.set('translateAuto', i.checked) });
  if (host) items.push({ label: `${host} nie übersetzen`, type: 'checkbox', checked: neverHosts().includes(host), click: () => { toggleList('translateNeverHosts', host); if (rebuild) rebuild(); } });
  if (lang && lang !== 'de') items.push({ label: `${langName(lang)} nie übersetzen`, type: 'checkbox', checked: neverLangs().includes(lang), click: () => toggleList('translateNeverLangs', lang) });
  items.push({ type: 'separator' }, { label: 'Übersetzer', enabled: false },
    { label: 'Google (schnell)', type: 'radio', checked: engine() === 'google', click: () => settings.set('translateEngine', 'google') },
    { label: 'Ollama (lokal, privat, langsamer)', type: 'radio', checked: engine() === 'ollama', click: () => settings.set('translateEngine', 'ollama') },
    { label: 'Private Tabs: immer Ollama, nie Google', enabled: false });
  return items;
}

module.exports = { setup, prepareSession, reset, stateFor, command, menuTemplate, langName };
