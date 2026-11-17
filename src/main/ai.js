'use strict';
// TZBrowser KI: Chat mit einem Ollama-Server (lokal oder im Heimnetz, z. B. dem Notebook).
// Alle Anfragen laufen über den Hauptprozess – die KI-Seite selbst hat keinen Netzzugriff auf Ollama.

const { ipcMain, net } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const AI_PAGE = /\/src\/ui\/ai\.html$/;
const SYSTEM = 'Du bist "TZBrowser KI", der eingebaute Assistent im TZBrowser von ZeroCool. '
  + 'Antworte ausschließlich auf Deutsch (keine chinesischen oder anderen fremden Schriftzeichen), klar und hilfreich. '
  + 'Nutze Markdown sparsam (Listen, **fett**, `Code`). '
  + 'Wenn dir Seiteninhalt mitgegeben wird, beziehe dich darauf und erfinde nichts dazu.';

const running = new Map(); // Anfrage-ID -> AbortController
let resolveTab = () => null;

const baseUrl = () => String(settings.get('ollamaUrl') || 'http://localhost:11434').replace(/\/+$/, '');

function isAiPage(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return !!url && url.startsWith('file:') && AI_PAGE.test(decodeURIComponent(new URL(url).pathname));
}

// Läuft Ollama lokal noch nicht? Dann selbst starten (unsichtbar im Hintergrund).
const OLLAMA_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
let starting = null;

async function reachable() {
  try {
    const r = await net.fetch(`${baseUrl()}/api/version`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

async function ensureOllama() {
  if (await reachable()) return true;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl()) || !fs.existsSync(OLLAMA_EXE)) return false;
  if (!starting) {
    starting = (async () => {
      console.log('[ai] Starte Ollama …');
      const p = spawn(OLLAMA_EXE, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
      p.unref();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (await reachable()) { console.log('[ai] Ollama läuft'); return true; }
      }
      return false;
    })().finally(() => { starting = null; });
  }
  return starting;
}

async function listModels() {
  await ensureOllama();
  const res = await net.fetch(`${baseUrl()}/api/tags`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Ollama antwortet mit HTTP ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => ({ name: m.name, size: m.size }));
}

async function chat(sender, { id, model, messages, think = false }) {
  const ctrl = new AbortController();
  running.set(id, ctrl);
  try {
    await ensureOllama();
    const res = await net.fetch(`${baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // think:false = Denkmodelle (z. B. qwen3) antworten direkt statt erst lange "nachzudenken"
      body: JSON.stringify({ model, stream: true, think: !!think, keep_alive: '15m', messages: [{ role: 'system', content: SYSTEM }, ...messages] }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama antwortet mit HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const j = JSON.parse(line);
        if (j.error) throw new Error(j.error);
        if (j.message && j.message.thinking && !sender.isDestroyed()) sender.send('ai:thinking', { id, text: j.message.thinking });
        if (j.message && j.message.content && !sender.isDestroyed()) sender.send('ai:chunk', { id, text: j.message.content });
      }
    }
    if (!sender.isDestroyed()) sender.send('ai:done', { id });
  } catch (err) {
    if (!sender.isDestroyed()) sender.send(ctrl.signal.aborted ? 'ai:done' : 'ai:error', { id, error: err.message });
  } finally {
    running.delete(id);
  }
}

// Text der aktuell offenen Seite im selben Fenster
async function pageContent(sender) {
  const wc = resolveTab(sender);
  if (!wc || !/^https?:/i.test(wc.getURL())) return null;
  const text = await wc.executeJavaScript(`(() => {
    const sel = String(window.getSelection() || '').trim();
    const main = document.querySelector('article, main, [role="main"]') || document.body;
    return { selection: sel.slice(0, 6000), text: (main ? main.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 14000) };
  })()`, true).catch(() => null);
  return text ? { title: wc.getTitle(), url: wc.getURL(), ...text } : null;
}

function setup({ getActiveTabFor }) {
  resolveTab = getActiveTabFor;
  const guard = (fn) => (event, ...args) => {
    if (!isAiPage(event)) throw new Error('nicht erlaubt');
    return fn(event, ...args);
  };
  ipcMain.handle('ai:config', guard(() => ({ url: baseUrl(), model: settings.get('aiModel') || '', think: !!settings.get('aiThink') })));
  ipcMain.handle('ai:set-config', guard((_e, { url, model, think } = {}) => {
    if (typeof url === 'string' && /^https?:\/\/[^\s]+$/i.test(url.trim())) settings.set('ollamaUrl', url.trim());
    if (typeof model === 'string') settings.set('aiModel', model);
    if (typeof think === 'boolean') settings.set('aiThink', think);
    return { url: baseUrl(), model: settings.get('aiModel') || '', think: !!settings.get('aiThink') };
  }));
  ipcMain.handle('ai:models', guard(() => listModels()));
  ipcMain.handle('ai:page', guard((event) => pageContent(event.sender)));
  ipcMain.on('ai:chat', (event, req) => { if (isAiPage(event)) chat(event.sender, req); });
  ipcMain.on('ai:stop', (event, id) => { if (isAiPage(event) && running.has(id)) running.get(id).abort(); });
}

module.exports = { setup, ensureOllama, baseUrl };
