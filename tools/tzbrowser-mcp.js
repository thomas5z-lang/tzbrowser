#!/usr/bin/env node
'use strict';
// TZBrowser-MCP-Brücke: macht die TZBrowser-KI-Schnittstelle (127.0.0.1:47800) für Claude & andere
// MCP-fähige KIs nutzbar. Keine Abhängigkeiten – nur Node 18+.
// TZBrowser: ☰ → KI-Schnittstelle → „KI-Schnittstelle aktiv“ muss eingeschaltet sein.
//
// Claude Desktop (claude_desktop_config.json):
//   "tzbrowser": { "command": "node", "args": ["C:\\Pfad\\zu\\tzbrowser\\tools\\tzbrowser-mcp.js"] }

const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.GHOST_API_PORT) || 47800;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN_FILE = path.join(process.env.APPDATA || '', 'TZBrowser', 'api-token.txt');

function token() {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
}

async function api(method, p, body) {
  let r;
  try {
    r = await fetch(BASE + p, {
      method,
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('TZBrowser ist nicht erreichbar. Läuft TZBrowser und ist ☰ → KI-Schnittstelle eingeschaltet?');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `TZBrowser meldet ${r.status}`);
  return data;
}

const id = { type: 'integer', description: 'Tab-ID aus tzbrowser_tabs' };
const TOOLS = [
  { name: 'tzbrowser_status', description: 'Zustand von TZBrowser: Version, Fenster, Tabs, VPN, Vorlesen.', inputSchema: { type: 'object', properties: {} }, run: () => api('GET', '/v1/status') },
  { name: 'tzbrowser_tabs', description: 'Alle offenen Tabs in TZBrowser (ID, Titel, Adresse, aktiv). Private Tabs sind unsichtbar.', inputSchema: { type: 'object', properties: {} }, run: () => api('GET', '/v1/tabs') },
  { name: 'tzbrowser_tab_text', description: 'Text einer Seite in TZBrowser lesen (bei fremdsprachigen Seiten schon auf Deutsch übersetzt).', inputSchema: { type: 'object', properties: { id, max: { type: 'integer', description: 'max. Zeichen (Standard 20000)' } }, required: ['id'] }, run: (a) => api('GET', `/v1/tabs/${Number(a.id)}/text?max=${Number(a.max) || 20000}`) },
  { name: 'tzbrowser_open', description: 'Adresse in einem neuen TZBrowser-Tab öffnen.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, background: { type: 'boolean' } }, required: ['url'] }, run: (a) => api('POST', '/v1/open', { url: a.url, background: !!a.background }) },
  { name: 'tzbrowser_search', description: 'In TZBrowser suchen (DuckDuckGo, neuer Tab).', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }, run: (a) => api('POST', '/v1/search', { q: a.q }) },
  { name: 'tzbrowser_navigate', description: 'Einen bestehenden Tab zu einer Adresse führen.', inputSchema: { type: 'object', properties: { id, url: { type: 'string' } }, required: ['id', 'url'] }, run: (a) => api('POST', `/v1/tabs/${Number(a.id)}/navigate`, { url: a.url }) },
  { name: 'tzbrowser_activate', description: 'Tab in den Vordergrund holen.', inputSchema: { type: 'object', properties: { id }, required: ['id'] }, run: (a) => api('POST', `/v1/tabs/${Number(a.id)}/activate`) },
  { name: 'tzbrowser_close', description: 'Tab schließen.', inputSchema: { type: 'object', properties: { id }, required: ['id'] }, run: (a) => api('POST', `/v1/tabs/${Number(a.id)}/close`) },
  { name: 'tzbrowser_translate', description: 'Seite auf Deutsch übersetzen oder Original zeigen.', inputSchema: { type: 'object', properties: { id, mode: { type: 'string', enum: ['de', 'original'] } }, required: ['id'] }, run: (a) => api('POST', `/v1/tabs/${Number(a.id)}/translate`, { mode: a.mode || 'de' }) },
  { name: 'tzbrowser_speak', description: 'Text oder eine ganze Seite mit der TZBrowser-KI-Stimme vorlesen.', inputSchema: { type: 'object', properties: { text: { type: 'string' }, tabId: { type: 'integer' } } }, run: (a) => api('POST', '/v1/speak', a.tabId !== undefined ? { tabId: a.tabId } : { text: a.text }) },
  { name: 'tzbrowser_speak_stop', description: 'Vorlesen stoppen.', inputSchema: { type: 'object', properties: {} }, run: () => api('POST', '/v1/speak/stop') },
];

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

async function handle(msg) {
  const { id: rid, method, params } = msg;
  if (method === 'initialize') {
    return send({ id: rid, result: { protocolVersion: (params && params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ghost', version: '1.0.0' } } });
  }
  if (method === 'ping') return send({ id: rid, result: {} });
  if (method === 'tools/list') return send({ id: rid, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === (params && params.name));
    if (!tool) return send({ id: rid, error: { code: -32602, message: 'Unbekanntes Werkzeug' } });
    try {
      const data = await tool.run((params && params.arguments) || {});
      return send({ id: rid, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } });
    } catch (e) {
      return send({ id: rid, result: { isError: true, content: [{ type: 'text', text: e.message }] } });
    }
  }
  if (rid !== undefined) send({ id: rid, error: { code: -32601, message: 'Methode unbekannt' } });
}

let buf = '';
process.stdin.on('data', (d) => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try { handle(JSON.parse(line)); } catch { /* ungültige Zeile ignorieren */ }
  }
});
