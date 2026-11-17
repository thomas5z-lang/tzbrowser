'use strict';
// Seitenleisten-Panels wie bei Opera: Messenger & Co. bleiben neben der Seite offen.
// Alle Panels teilen sich eine eigene, dauerhafte Sitzung (Logins bleiben erhalten),
// bekommen Werbeblocker/Passwortmanager usw. über prepareSession.

const { WebContentsView, session, shell } = require('electron');
const path = require('path');

const GHOST_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#fa1e4e" d="M10 14h20v8h-6v28h-8V22h-6zM34 14h20v8L43 42h11v8H34v-8l11-20H34z"/></svg>');

const APPS = [
  {
    id: 'ai', name: 'TZBrowser KI', icon: GHOST_ICON,
    internal: { file: path.join(__dirname, '..', 'ui', 'ai.html'), preload: path.join(__dirname, '..', 'preload', 'ai-preload.js') },
  },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', host: 'web.whatsapp.com' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/app', host: 'discord.com' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/a/', host: 'telegram.org' },
  { id: 'ytmusic', name: 'YouTube Music', url: 'https://music.youtube.com/', host: 'music.youtube.com' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/', host: 'claude.ai' },
];
const WIDTH = 420;
const PARTITION = 'persist:ghost-panels';

class Panels {
  constructor(win, { prepare, onChange, openInTab, onShortcut, getAccent = () => '#fa1e4e' }) {
    this.win = win;
    this.getAccent = getAccent;
    this.views = new Map();
    this.openId = null;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this.onChange = onChange;
    this.openInTab = openInTab;
    this.onShortcut = onShortcut;
    this.ses = session.fromPartition(PARTITION);
    prepare(this.ses);
  }

  list() {
    return APPS.map((a) => ({ id: a.id, name: a.name, icon: a.icon || `https://icons.duckduckgo.com/ip3/${a.host}.ico` }));
  }

  state() {
    return { apps: this.list(), open: this.openId };
  }

  width() {
    return this.openId ? WIDTH : 0;
  }

  view(id) {
    if (this.views.has(id)) return this.views.get(id);
    const app = APPS.find((a) => a.id === id);
    const view = new WebContentsView({
      webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, preload: app.internal ? app.internal.preload : undefined },
    });
    view.setBackgroundColor('#0b0a10');
    view.webContents.setMaxListeners(40);
    // Links aus dem Panel im normalen Tab öffnen (nicht im schmalen Panel)
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) this.openInTab(url);
      else shell.openExternal(url);
      return { action: 'deny' };
    });
    view.webContents.on('before-input-event', (e, input) => this.onShortcut(e, input));
    if (app.internal) view.webContents.loadFile(app.internal.file, { query: { accent: this.getAccent() } });
    else view.webContents.loadURL(app.url);
    this.views.set(id, view);
    return view;
  }

  // Öffnen / umschalten / schließen; gibt true zurück, wenn sich die Breite geändert hat
  toggle(id) {
    const prev = this.openId;
    if (prev) this.win.contentView.removeChildView(this.views.get(prev));
    this.openId = prev === id ? null : id;
    if (this.openId) {
      const v = this.view(this.openId);
      this.win.contentView.addChildView(v);
      v.setBounds(this.bounds);
      v.webContents.focus();
    }
    this.onChange(this.state());
    return !!prev !== !!this.openId;
  }

  close() {
    if (this.openId) this.toggle(this.openId);
  }

  reload(id) {
    const v = this.views.get(id);
    if (v) v.webContents.reload();
  }

  // Panel ganz beenden (z. B. abmelden/Speicher freigeben)
  unload(id) {
    if (this.openId === id) this.toggle(id);
    const v = this.views.get(id);
    if (v) { v.webContents.close(); this.views.delete(id); }
  }

  ownsWebContents(wc) {
    for (const v of this.views.values()) if (v.webContents === wc) return true;
    return false;
  }

  isLoaded(id) {
    return this.views.has(id);
  }

  setBounds(b) {
    this.bounds = b;
    if (this.openId) this.views.get(this.openId).setBounds(b);
  }
}

module.exports = { Panels, PANEL_WIDTH: WIDTH };
