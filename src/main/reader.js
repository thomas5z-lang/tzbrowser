'use strict';
// Vorlesen: markierten Text oder die ganze Seite mit der KI-Stimme vorlesen
// und auf Wunsch als MP3 speichern. Abgespielt wird in der TZBrowser-Oberfläche.

const { dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tts = require('./tts');
const settings = require('./settings');
const downloads = require('./downloads');
const { binDir, videoDir, uniquePath } = require('./paths');

let session = 0;
let player = null; // Fenster, in dem gerade vorgelesen wird
let speaking = false;

const voice = () => settings.get('readVoice') || 'windows';
const tempo = () => Number(settings.get('readTempo')) || 1;

// Text in gut sprechbare Stücke teilen (Sätze, höchstens ca. 300 Zeichen)
function chunks(text) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ').trim();
  const parts = clean.split(/(?<=[.!?…:;])\s+|\n+/);
  const out = [];
  let cur = '';
  const limit = () => (out.length === 0 ? 140 : 300); // erstes Stück kurz: schneller Start
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    if (cur && (cur + ' ' + s).length > limit()) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
    while (cur.length > 420) {
      let cut = cur.lastIndexOf(', ', 360);
      if (cut < 120) cut = cur.lastIndexOf(' ', 360);
      if (cut < 60) cut = 360;
      out.push(cur.slice(0, cut + 1).trim());
      cur = cur.slice(cut + 1).trim();
    }
  }
  if (cur) out.push(cur);
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s));
}

function setState(state) {
  speaking = !!state.on;
  if (player) player.send('tts-state', state);
}

function stop() {
  session++;
  if (player) player.send('tts-stop');
  setState({ on: false });
}

async function read(w, text) {
  stop();
  const my = ++session;
  player = w;
  const parts = chunks(text);
  if (!parts.length) return;
  if (voice() === 'windows') {
    setState({ on: true });
    w.send('tts-local', { session: my, text: parts.join(' '), rate: tempo() });
    return;
  }
  setState({ on: true, loading: true });
  let i = 0;
  try {
    await tts.ensure(() => w.send('tts-state', { on: true, loading: true, note: 'KI-Stimme wird geladen …' }));
    for (; i < parts.length; i++) {
      if (my !== session) return;
      const wav = await tts.speak(parts[i], voice(), tempo());
      if (my !== session) return;
      w.send('tts-chunk', { session: my, audio: wav.toString('base64'), last: i === parts.length - 1 });
    }
  } catch (e) {
    if (my !== session) return;
    console.error('[tts] ' + e.message);
    // Notlösung: Rest mit der Windows-Stimme
    w.send('tts-local', { session: my, text: parts.slice(i).join(' '), rate: tempo(), note: e.message, append: i > 0 });
  }
}

async function pageText(wc) {
  try {
    return await wc.executeJavaScript(`(() => {
      const root = document.querySelector('article, main, [role=main]') || document.body;
      return root ? root.innerText : '';
    })()`, true);
  } catch { return ''; }
}

async function selectionText(wc, p) {
  try {
    const frame = p.frame || wc.mainFrame;
    const t = await frame.executeJavaScript('String(getSelection())', true);
    if (t && t.trim()) return t;
  } catch { /* Frame weg */ }
  return p.selectionText || '';
}

function safeName(t) {
  return String(t || 'Vorlesen').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Vorlesen';
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(path.join(binDir(), 'ffmpeg.exe'), args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-800); });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg: ' + err.split('\n').filter(Boolean).pop()))));
    p.on('error', reject);
  });
}

// Text vertonen und als MP3 speichern (Fortschritt in der Download-Liste)
async function saveMp3(win, text, title) {
  if (voice() === 'windows') {
    dialog.showMessageBox(win, { type: 'info', message: 'Für MP3 bitte eine KI-Stimme wählen', detail: '☰ → Vorlesen → Stimme. Die Windows-Stimme kann TZBrowser nur abspielen, nicht speichern.' });
    return;
  }
  const parts = chunks(text);
  if (!parts.length) return;
  const folder = path.join(videoDir(), 'Vorlesen');
  fs.mkdirSync(folder, { recursive: true });
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Vorlesen als MP3 speichern',
    defaultPath: uniquePath(folder, safeName(title) + '.mp3'),
    filters: [{ name: 'MP3-Audio', extensions: ['mp3'] }],
  });
  if (canceled || !filePath) return;
  let cancelled = false;
  const entry = downloads.add({ name: path.basename(filePath), kind: 'audio', cancel: () => { cancelled = true; } });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-tts-'));
  try {
    await tts.ensure();
    const list = [];
    for (let i = 0; i < parts.length; i++) {
      if (cancelled) throw new Error('abgebrochen');
      const f = path.join(tmp, `${String(i).padStart(5, '0')}.wav`);
      fs.writeFileSync(f, await tts.speak(parts[i], voice(), tempo()));
      list.push(`file '${f.replace(/\\/g, '/')}'`);
      downloads.update(entry, { progress: (i + 1) / (parts.length + 1), speed: `${i + 1}/${parts.length} Sätze` });
    }
    const listFile = path.join(tmp, 'liste.txt');
    fs.writeFileSync(listFile, list.join('\n'));
    await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-codec:a', 'libmp3lame', '-q:a', '2',
      '-metadata', `title=${title || 'Vorlesen'}`, '-metadata', 'artist=TZBrowser Vorleser', filePath]);
    downloads.update(entry, { state: 'completed', progress: 1, path: filePath, speed: '', cancel: null }, true);
  } catch (e) {
    downloads.update(entry, { state: cancelled ? 'cancelled' : 'failed', error: e.message, cancel: null }, true);
  } finally {
    fs.rm(tmp, { recursive: true, force: true }, () => {});
  }
}

async function readPage(w, wc, asMp3 = false) {
  const text = await pageText(wc);
  if (asMp3) return saveMp3(w.win, text, wc.getTitle());
  return read(w, text);
}

// Einträge für das Rechtsklick-Menü einer Seite
function contextItems(w, wc, p) {
  const items = [];
  if (speaking && player === w) items.push({ label: '⏹ Vorlesen stoppen', click: stop });
  if (p.isEditable) return items;
  if (p.selectionText && p.selectionText.trim()) {
    items.push(
      { label: '🔊 Vorlesen', click: async () => read(w, await selectionText(wc, p)) },
      { label: 'Als MP3 speichern …', click: async () => saveMp3(w.win, await selectionText(wc, p), wc.getTitle()) },
    );
  } else if (!p.linkURL && p.mediaType === 'none' && /^https?:/i.test(wc.getURL())) {
    items.push(
      { label: '🔊 Seite vorlesen', click: () => readPage(w, wc) },
      { label: 'Seite als MP3 speichern …', click: () => readPage(w, wc, true) },
    );
  }
  return items;
}

function isSpeaking() {
  return speaking;
}

// Rückmeldung aus der Oberfläche: alles abgespielt
function ended(w, s) {
  if (s === session && player === w) setState({ on: false });
}

module.exports = { read, readPage, saveMp3, stop, contextItems, isSpeaking, ended, chunks, voice, tempo };
