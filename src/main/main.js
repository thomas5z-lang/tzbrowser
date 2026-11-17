'use strict';
// TZBrowser – Hauptprozess
// Autor: ZeroCool

const { app, BaseWindow, WebContentsView, ipcMain, session, dialog, Menu, clipboard } = require('electron');
const path = require('path');
const adblock = require('./adblock');
const downloads = require('./downloads');
const video = require('./video');
const vpn = require('./vpn');
const containers = require('./containers');
const sites = require('./sites');
const passwords = require('./passwords');
const googleLogin = require('./google-login');
const library = require('./library');
const ai = require('./ai');
const extensions = require('./extensions');
const tts = require('./tts');
const reader = require('./reader');
const vorleser = require('./vorleser');
const translate = require('./translate');
const api = require('./api');
const privacy = require('./privacy');
const settingsPage = require('./settings-page');
const sessionStore = require('./session');
const shots = require('./shots');
const backup = require('./backup');
privacy.earlyFlags(); // muss vor app.ready laufen (Dark Mode erzwingen)
const settings = require('./settings');
const updater = require('./updater');
const { Panels } = require('./panels');
const { buildMainMenu, mainTemplate } = require('./menu');
const { TabManager } = require('./tabs');
const { uniquePath, downloadsDir } = require('./paths');

const UI_HEIGHT = 84; // Tableiste (36) + Werkzeugleiste (48)
const FIND_HEIGHT = 40; // Suchleiste
const SIDEBAR_WIDTH = 56; // Seitenleiste links (Opera-Stil)
const FORMS_PRELOAD = path.join(__dirname, '..', 'preload', 'forms.js');

// Akzentfarben wie bei Opera GX
const ACCENTS = [
  { name: 'GX-Rot', color: '#fa1e4e' },
  { name: 'Lila', color: '#8b5cf6' },
  { name: 'Türkis', color: '#22d3c5' },
  { name: 'Grün', color: '#3ee08f' },
  { name: 'Orange', color: '#ff7a1a' },
  { name: 'Pink', color: '#ff3ea5' },
  { name: 'Blau', color: '#3b82f6' },
  { name: 'Gelb', color: '#ffd23f' },
];

app.setName('TZBrowser');
require('./log').setupLog();
app.setAppUserModelId('de.zerocool.tzbrowser');
// Electron-Kennung aus dem User-Agent entfernen, damit Seiten (z. B. Google-Login)
// TZBrowser wie einen normalen Chrome behandeln.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/\S+/i, '')
  .replace(/ ghost\/\S+/i, '');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const windows = new Set();
let lastFocused = null;
let adblockStatus = 'loading'; // loading | on | error

const design = require('./design');
const theme = () => design.forUi(); // Farben, Schrift, Logo, Name (Einstellungen → Design)

// An alle Fenster senden
function broadcast(channel, data) {
  for (const w of windows) w.send(channel, data);
}

function current() {
  return (lastFocused && windows.has(lastFocused)) ? lastFocused : [...windows][0] || null;
}

// Tab über seine ID in allen Fenstern finden (für die KI-Schnittstelle; private Tabs bleiben unsichtbar)
function findTab(id) {
  for (const w of windows) {
    const t = w.tabs.tabs.find((x) => x.id === id);
    if (t && t.container !== containers.PRIVATE.id) return { w, t, wc: t.view.webContents };
  }
  return null;
}

function apiHooks() {
  const info = (w, t) => {
    const url = t.view.webContents.getURL();
    return { id: t.id, title: t.title || '', url: /^https?:/i.test(url) ? url : '', active: w.tabs.activeId === t.id, loading: !!t.loading };
  };
  return {
    status: () => ({ ghost: app.getVersion(), windows: windows.size, tabs: [...windows].reduce((n, w) => n + w.tabs.tabs.length, 0), speaking: reader.isSpeaking(), vpn: vpn.status().state }),
    listTabs: () => [...windows].flatMap((w) => w.tabs.tabs.filter((t) => t.container !== containers.PRIVATE.id && !t.internal).map((t) => info(w, t))),
    tabText: async (id, max) => {
      const f = findTab(id);
      if (!f || f.t.internal) return null;
      let text = '';
      try { text = await f.wc.executeJavaScript('document.body ? document.body.innerText : ""', true); } catch { /* leer */ }
      return { id, title: f.wc.getTitle(), url: f.wc.getURL(), text: String(text).slice(0, max), truncated: String(text).length > max };
    },
    open: (url, active) => {
      const w = current() || new GhostWindow();
      const t = w.tabs.create(url, { active });
      if (active) w.win.focus();
      return { id: t.id };
    },
    navigate: (id, url) => { const f = findTab(id); if (!f) return null; f.wc.loadURL(url); return { ok: true }; },
    activate: (id) => { const f = findTab(id); if (!f) return null; f.w.tabs.activate(id); f.w.win.focus(); return { ok: true }; },
    close: (id) => { const f = findTab(id); if (!f) return null; f.w.tabs.close(id); return { ok: true }; },
    translate: (id, mode) => { const f = findTab(id); if (!f) return null; translate.command(f.wc, mode); return { ok: true }; },
    video: (id, format) => { const f = findTab(id); if (!f) return null; return video.startDownload(f.wc, format); },
    speak: async (b) => {
      const w = current();
      if (!w) return { error: 'kein Fenster' };
      if (b.tabId !== undefined) { const f = findTab(Number(b.tabId)); if (!f) return null; reader.readPage(f.w, f.wc); return { ok: true }; }
      if (!b.text) return { error: 'text oder tabId angeben' };
      reader.read(w, String(b.text).slice(0, 100000));
      return { ok: true };
    },
    speakStop: () => { reader.stop(); return { ok: true }; },
  };
}

// Fenster zu einem Tab (webContents-ID) finden
function windowOfWc(wcId) {
  for (const w of windows) if (w.tabs.byWebContents(wcId)) return w;
  return null;
}

// ---- Sitzungen (Standard, Container, Panels) einheitlich vorbereiten ----
const prepared = new WeakSet();
function prepareSession(ses) {
  if (prepared.has(ses)) return;
  prepared.add(ses);
  setupPermissions(ses);
  downloads.setup(ses, (summary) => broadcast('downloads', summary));
  video.setup(ses, (wcId) => {
    const w = windowOfWc(wcId);
    if (w && w.activeWc() && w.activeWc().id === wcId) w.tabs.emitState();
  });
  adblock.attach(ses);
  vpn.attach(ses);
  sites.attach(ses);
  googleLogin.attach(ses);
  ses.registerPreloadScript({ type: 'frame', id: 'ghost-forms', filePath: FORMS_PRELOAD }); // Passwortmanager
  translate.prepareSession(ses); // automatisch Deutsch
  ses.registerPreloadScript({ type: 'frame', id: 'ghost-pip', filePath: path.join(__dirname, '..', 'preload', 'pip.js') }); // Bild-in-Bild-Knopf
  vorleser.prepareSession(ses); // Anime-Vorleser (Crunchyroll)
}

function setupPermissions(ses) {
  const always = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management']);
  const ask = {
    media: 'Kamera/Mikrofon',
    geolocation: 'deinen Standort',
    notifications: 'Benachrichtigungen',
    'clipboard-read': 'die Zwischenablage lesen',
    midi: 'MIDI-Geräte',
  };
  const decided = new Map(); // origin|permission -> true/false (für diese Sitzung)

  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (always.has(permission)) return callback(true);
    // Interne TZBrowser-Seiten dürfen die Zwischenablage lesen (Passwort kopieren)
    if (permission === 'clipboard-read' && /^file:/.test(details.requestingUrl || '')) return callback(true);
    if (!ask[permission]) return callback(false);
    let origin = '';
    try { origin = new URL(details.requestingUrl || wc.getURL()).origin; } catch { /* leer */ }
    const keyId = `${origin}|${permission}`;
    if (decided.has(keyId)) return callback(decided.get(keyId));
    const w = windowOfWc(wc.id) || current();
    const { response } = await dialog.showMessageBox(w ? w.win : undefined, {
      type: 'question',
      buttons: ['Erlauben', 'Blockieren'],
      defaultId: 1,
      cancelId: 1,
      title: 'TZBrowser – Berechtigung',
      message: `${origin} möchte auf ${ask[permission]} zugreifen.`,
    });
    const ok = response === 0;
    decided.set(keyId, ok);
    callback(ok);
  });
}

// =====================================================================
// Ein TZBrowser-Fenster: Oberfläche, Seitenleiste, Panels und Tabs
// =====================================================================
class GhostWindow {
  constructor({ url = null, container = null, adoptTab = null, bounds = null, restore = null } = {}) {
    this.htmlFullscreen = false;
    this.findOpen = false;
    this.dropHeight = 0; // offene Vorschläge unter der Adressleiste

    this.win = new BaseWindow({
      width: bounds ? bounds.width : 1400,
      height: bounds ? bounds.height : 900,
      x: bounds ? bounds.x : undefined,
      y: bounds ? bounds.y : undefined,
      minWidth: 760,
      minHeight: 420,
      title: 'TZBrowser',
      backgroundColor: '#0b0a10',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      autoHideMenuBar: true,
    });
    this.win.setMenuBarVisibility(false);

    this.ui = this.makeChrome('index.html');
    this.ui.setBackgroundColor('#00000000'); // durchsichtig, damit Vorschläge über der Seite schweben können
    this.sidebar = this.makeChrome('sidebar.html');

    this.panels = new Panels(this.win, {
      prepare: prepareSession,
      onChange: (state) => this.send('panels', state),
      openInTab: (u) => this.tabs.create(u),
      onShortcut: this.handleShortcut,
      getAccent: () => theme().accent,
    });

    this.ui.webContents.on('did-finish-load', () => {
      this.send('theme', theme());
      this.tabs.emitState();
      this.send('adblock', adblockStatus);
      this.send('downloads', downloads.summary());
      this.send('vpn', vpn.status());
    });
    this.sidebar.webContents.on('did-finish-load', () => {
      this.send('theme', theme());
      this.send('panels', this.panels.state());
      this.send('vpn', vpn.status());
    });

    this.tabs = new TabManager(this.win, (channel, data) => {
      if (channel === 'fullscreen') {
        this.htmlFullscreen = data;
        this.win.setFullScreen(data);
        this.layout();
        return;
      }
      if (channel === 'tab-switched') {
        if (this.findOpen) this.send('find-reset');
        return;
      }
      if (channel === 'toast') {
        dialog.showMessageBox(this.win, { type: 'info', title: 'TZBrowser', message: String(data) }).catch(() => {});
        return;
      }
      if (channel === 'focus-address') {
        // kurz warten: die neue Tab-Ansicht holt sich beim Einhängen sonst den Fokus zurück
        const go = () => { if (this.ui && !this.ui.webContents.isDestroyed()) { this.ui.webContents.focus(); this.send('focus-address'); } };
        go();
        setTimeout(go, 60);
        return;
      }
      this.send(channel, data);
    }, this.handleShortcut, {
      getAccent: () => theme().accent,
      onTabCreated: (tab) => extensions.addTab(tab.view.webContents, this.win),
      onTabActivated: (tab) => extensions.selectTab(tab.view.webContents),
      contextItems: (wc, params) => [...reader.contextItems(this, wc, params), ...extensions.contextItems(wc, params)],
      newWindow: (u, opts) => new GhostWindow({ url: u, ...opts }),
      moveToNewWindow: (tab) => {
        const b = this.win.getBounds();
        const moved = this.tabs.detach(tab.id);
        if (moved) new GhostWindow({ adoptTab: moved, bounds: { x: b.x + 40, y: b.y + 40, width: b.width, height: b.height } });
      },
      // Letzter Tab geschlossen: Fenster schließen, wenn es noch weitere Fenster gibt
      onEmpty: () => {
        if (windows.size > 1) { setImmediate(() => this.win.close()); return true; }
        return false;
      },
    });

    this.layout();
    this.win.on('resize', () => this.layout());
    this.win.on('focus', () => { lastFocused = this; });
    // letztes Fenster wird geschlossen: Sitzung noch mit diesem Fenster speichern
    this.win.on('close', () => { if (windows.size === 1) sessionStore.save(windows); });
    this.win.on('closed', () => {
      this.tabs.destroyAll();
      windows.delete(this);
      if (lastFocused === this) lastFocused = null;
      if (windows.size === 0) app.quit();
    });

    windows.add(this);
    lastFocused = this;

    if (adoptTab) this.tabs.adopt(adoptTab);
    else if (restore && restore.tabs && restore.tabs.length) {
      console.log(`[sitzung] stelle ${restore.tabs.length} Tab(s) wieder her`);
      for (const t of restore.tabs) {
        this.tabs.create(null, { active: false, lazy: { url: t.url, title: t.title }, pinned: !!t.pinned, container: containers.get(t.container) ? t.container : null });
      }
      const target = this.tabs.tabs[Math.min(restore.activeIndex || 0, this.tabs.tabs.length - 1)];
      if (target) this.tabs.activate(target.id);
      if (restore.maximized) this.win.maximize();
    } else this.tabs.create(url, { container });
    // normale Fenstergröße merken (für die Wiederherstellung auch bei maximiertem Fenster)
    const remember = () => { if (!this.win.isMaximized() && !this.win.isFullScreen() && !this.win.isMinimized()) this.normalBounds = this.win.getBounds(); };
    remember();
    this.win.on('resize', remember);
    this.win.on('move', remember);
  }

  makeChrome(file) {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'ui-preload.js'),
        contextIsolation: true,
        // Die Oberfläche ist eine lokale TZBrowser-Datei; ohne Sandbox kann ihr Preload die
        // Erweiterungsknöpfe (<browser-action-list>) einbinden. contextIsolation bleibt an.
        sandbox: false,
        nodeIntegration: false,
      },
    });
    view.setBackgroundColor('#07060b');
    this.win.contentView.addChildView(view);
    view.webContents.loadFile(path.join(__dirname, '..', 'ui', file));
    view.webContents.on('before-input-event', this.handleShortcut);
    // Rechtsklick in Eingabefeldern (Adressleiste, Suche): Ausschneiden/Kopieren/Einfügen
    view.webContents.on('context-menu', async (_e, params) => {
      if (!params.isEditable) return;
      const f = params.editFlags || {};
      const template = [
        { label: 'Rückgängig', role: 'undo', enabled: f.canUndo },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut', enabled: f.canCut },
        { label: 'Kopieren', role: 'copy', enabled: f.canCopy },
        { label: 'Einfügen', role: 'paste', enabled: f.canPaste },
      ];
      if (file === 'index.html') {
        // readText ist in neueren Electron-Versionen asynchron
        const clip = String((await clipboard.readText()) || '').trim();
        template.push({ label: 'Einfügen und los', enabled: !!clip, click: () => { this.tabs.navigate(clip); const p = this.activeWc(); if (p) p.focus(); } });
      }
      template.push({ label: 'Löschen', role: 'delete', enabled: f.canDelete }, { type: 'separator' }, { label: 'Alles markieren', role: 'selectAll' });
      Menu.buildFromTemplate(template).popup({ window: this.win, frame: params.frame || undefined });
    });
    return view;
  }

  owns(webContents) {
    return webContents === this.ui.webContents || webContents === this.sidebar.webContents;
  }

  send(channel, data) {
    for (const v of [this.ui, this.sidebar]) {
      if (v && !v.webContents.isDestroyed()) v.webContents.send('ev:' + channel, data);
    }
  }

  activeWc() {
    return this.tabs && this.tabs.active ? this.tabs.active.view.webContents : null;
  }

  layout() {
    if (!this.tabs) return;
    const { width, height } = this.win.getContentBounds();
    if (this.htmlFullscreen) {
      this.ui.setBounds({ x: 0, y: 0, width, height: 0 });
      this.sidebar.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      this.panels.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      this.tabs.setBounds({ x: 0, y: 0, width, height });
      return;
    }
    const top = UI_HEIGHT + (this.findOpen ? FIND_HEIGHT : 0);
    const h = Math.max(0, height - top);
    const pw = this.panels.width();
    this.ui.setBounds({ x: 0, y: 0, width, height: Math.max(top, Math.min(this.dropHeight, height)) });
    this.sidebar.setBounds({ x: 0, y: top, width: SIDEBAR_WIDTH, height: h });
    this.panels.setBounds({ x: SIDEBAR_WIDTH, y: top, width: pw, height: h });
    this.tabs.setBounds({ x: SIDEBAR_WIDTH + pw, y: top, width: Math.max(0, width - SIDEBAR_WIDTH - pw), height: h });
  }

  // ---- Aktionen (für Menü, Tastenkürzel und Oberfläche) ----
  get actions() {
    return {
      openFind: () => {
        this.findOpen = true;
        this.layout();
        this.ui.webContents.focus();
        this.send('find-open');
      },
      closeFind: () => {
        if (!this.findOpen) return;
        this.findOpen = false;
        const wc = this.activeWc();
        if (wc) wc.stopFindInPage('clearSelection');
        this.layout();
        this.send('find-close');
        if (wc) wc.focus();
      },
      toggleFullscreen: () => this.win.setFullScreen(!this.win.isFullScreen()),
      toggleVpn: () => vpn.toggle(this.win),
      privateTab: () => this.tabs.create(null, { container: containers.PRIVATE.id }),
      newWindow: () => new GhostWindow(),
      openPasswords: () => {
        const existing = this.tabs.tabs.find((t) => t.internal === 'passwords');
        if (existing) this.tabs.activate(existing.id);
        else this.tabs.create(null, { internal: 'passwords' });
      },
      togglePanel: (id) => { this.panels.toggle(id); this.layout(); },
      openSettings: () => {
        const existing = this.tabs.tabs.find((t) => t.internal === 'settings');
        if (existing) { this.tabs.activate(existing.id); existing.view.webContents.reload(); return; }
        this.tabs.create(null, { internal: 'settings' });
      },
      openLibrary: (tab = 'lesezeichen') => {
        const existing = this.tabs.tabs.find((t) => t.internal === 'library');
        if (existing) this.tabs.close(existing.id);
        this.tabs.create(null, { internal: 'library', query: { tab } });
      },
      toggleBookmark: () => {
        const t = this.tabs.active;
        if (!t) return;
        const wc = t.view.webContents;
        library.toggleBookmark(wc.getURL(), wc.getTitle(), t.favicon);
        for (const w of windows) w.tabs.emitState();
      },
      setAccent: (color) => design.setAccent(color),
      savePage: async () => {
        const wc = this.activeWc();
        if (!wc) return;
        const name = (wc.getTitle() || 'Seite').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100) + '.html';
        const { canceled, filePath } = await dialog.showSaveDialog(this.win, {
          title: 'Seite speichern unter',
          defaultPath: uniquePath(downloadsDir(), name),
          filters: [{ name: 'Webseite, komplett', extensions: ['html'] }],
        });
        if (!canceled && filePath) wc.savePage(filePath, 'HTMLComplete').catch((e) => dialog.showErrorBox('Speichern fehlgeschlagen', e.message));
      },
    };
  }

  popupAt(menu, pos) {
    menu.popup({ window: this.win, x: Math.round(pos?.x ?? 0), y: Math.round(pos?.y ?? UI_HEIGHT) });
  }

  newTabMenu() {
    return Menu.buildFromTemplate([
      { label: 'Neuer Tab', accelerator: 'Ctrl+T', registerAccelerator: false, click: () => this.tabs.create() },
      { label: 'Neues Fenster', accelerator: 'Ctrl+N', registerAccelerator: false, click: () => this.actions.newWindow() },
      { label: 'Neuer privater Tab', accelerator: 'Ctrl+Shift+P', registerAccelerator: false, click: () => this.actions.privateTab() },
      { type: 'separator' },
      { label: 'Neuer Container-Tab', enabled: false },
      ...containers.all().map((c) => ({ label: `    ${c.name}`, click: () => this.tabs.create(null, { container: c.id }) })),
    ]);
  }

  themeMenu() {
    const cur = theme().accent;
    return Menu.buildFromTemplate([
      { label: 'Akzentfarbe', enabled: false },
      ...ACCENTS.map((a) => ({ label: a.name, type: 'radio', checked: a.color === cur, click: () => this.actions.setAccent(a.color) })),
    ]);
  }

  panelMenu(id) {
    const entry = this.panels.list().find((a) => a.id === id);
    if (!entry) return null;
    return Menu.buildFromTemplate([
      { label: entry.name, enabled: false },
      { label: 'Neu laden', enabled: this.panels.isLoaded(id), click: () => this.panels.reload(id) },
      { label: 'Panel beenden (Speicher freigeben)', enabled: this.panels.isLoaded(id), click: () => { this.panels.unload(id); this.layout(); } },
    ]);
  }

  // ---- TZBrowser-eigenes Hauptmenü (HTML): Schalter lassen das Menü offen, schließt erst bei Klick daneben ----
  menuCtx() {
    return { ghost: this, win: this.win, tabs: this.tabs, sendUi: (c, d) => this.send(c, d), actions: this.actions };
  }

  serializeMenu() {
    this.menuHandlers = new Map();
    let seq = 0;
    const ser = (items) => (items || []).filter(Boolean).map((it) => {
      if (it.type === 'separator') return { type: 'separator' };
      const id = ++seq;
      if (typeof it.click === 'function') this.menuHandlers.set(id, it);
      return {
        id,
        label: String(it.label || '').replace(/&&/g, '&'),
        sublabel: it.sublabel || '',
        type: it.type || 'normal',
        checked: !!it.checked,
        enabled: it.enabled !== false,
        accel: String(it.accelerator || '').replace('CommandOrControl', 'Strg').replace('Ctrl', 'Strg').replace('Shift', 'Umschalt').replace('Plus', '+'),
        submenu: Array.isArray(it.submenu) ? ser(it.submenu) : null,
      };
    });
    return ser(mainTemplate(this.menuCtx()));
  }

  openHtmlMenu(side) {
    this.send('menu-open', { items: this.serializeMenu(), side });
  }

  menuClick(id) {
    const it = this.menuHandlers && this.menuHandlers.get(id);
    if (!it) return;
    const toggles = it.type === 'checkbox' || it.type === 'radio';
    try {
      it.click({ checked: it.type === 'checkbox' ? !it.checked : true }, this.win, {});
    } catch (e) { console.error('[menü] ' + e.message); }
    if (toggles) setTimeout(() => this.send('menu-update', { items: this.serializeMenu() }), 250);
    else this.send('menu-close');
  }

  showMenu(which, pos, id) {
    const wc = this.activeWc();
    let menu = null;
    if (which === 'main') menu = buildMainMenu({ ghost: this, win: this.win, tabs: this.tabs, sendUi: (c, d) => this.send(c, d), actions: this.actions });
    else if (which === 'downloads') menu = Menu.buildFromTemplate(downloads.menuTemplate());
    else if (which === 'video' && wc) menu = Menu.buildFromTemplate(video.menuTemplate(wc));
    else if (which === 'translate' && wc) menu = Menu.buildFromTemplate(translate.menuTemplate(wc, () => this.tabs.emitState()));
    else if (which === 'newtab') menu = this.newTabMenu();
    else if (which === 'tab') menu = this.tabs.tabMenu(id);
    else if (which === 'theme') menu = this.themeMenu();
    else if (which === 'panel') menu = this.panelMenu(id);
    if (menu) this.popupAt(menu, pos);
  }

  // Tastenkürzel – greifen in Oberfläche, Seitenleiste, Panels und jedem Tab dieses Fensters
  handleShortcut = (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();
    const wc = this.activeWc();
    const tab = this.tabs.active;
    const a = this.actions;
    let handled = true;

    if (ctrl && input.shift && key === 't') this.tabs.restoreClosed();
    else if (ctrl && input.shift && (key === 'p' || key === 'n')) a.privateTab();
    else if (ctrl && input.shift && key === 'v') a.toggleVpn();
    else if (ctrl && input.shift && key === 'q') app.quit();
    else if (ctrl && input.shift && key === 'k') a.openPasswords();
    else if (ctrl && input.shift && key === 'o') a.openLibrary('lesezeichen');
    else if (ctrl && key === 'h') a.openLibrary('verlauf');
    else if (ctrl && input.shift && key === 'a') a.togglePanel('ai');
    else if (ctrl && key === 'd') a.toggleBookmark();
    else if (ctrl && key === 'n') a.newWindow();
    else if (ctrl && key === 't') this.tabs.create(null, { container: tab && tab.container !== containers.PRIVATE.id ? tab.container : null });
    else if (ctrl && key === 'w') { if (tab) this.tabs.close(tab.id); }
    else if (ctrl && key === 'tab') this.tabs.cycle(input.shift ? -1 : 1);
    else if (ctrl && (key === 'l' || key === 'e')) { this.ui.webContents.focus(); this.send('focus-address'); }
    else if (ctrl && key === 'f') a.openFind();
    else if (key === 'f3' && this.findOpen) this.send('find-next', !input.shift);
    else if (key === 'escape' && this.findOpen) a.closeFind();
    else if (ctrl && key === 'j') this.showMenu('downloads', { x: this.win.getContentBounds().width - 290, y: UI_HEIGHT - 6 });
    else if (ctrl && key === 'p') { if (wc) wc.print(); }
    else if (ctrl && key === 's') a.savePage();
    else if (ctrl && key === 'u') { if (wc) this.tabs.create('view-source:' + wc.getURL()); }
    else if ((ctrl && key === 'r') || key === 'f5') {
      if (wc) (input.shift || (ctrl && key === 'f5')) ? wc.reloadIgnoringCache() : wc.reload();
    }
    else if (input.alt && key === 'arrowleft') { if (wc) wc.navigationHistory.goBack(); }
    else if (input.alt && key === 'arrowright') { if (wc) wc.navigationHistory.goForward(); }
    else if (ctrl && (key === '+' || key === '=')) { if (wc) wc.setZoomLevel(wc.getZoomLevel() + 0.5); }
    else if (ctrl && key === '-') { if (wc) wc.setZoomLevel(wc.getZoomLevel() - 0.5); }
    else if (ctrl && key === '0') { if (wc) wc.setZoomLevel(0); }
    else if (key === 'f11') a.toggleFullscreen();
    else if (key === 'f9') this.tabs.toggleReader();
    else if (ctrl && key === ',') a.openSettings();
    else if (key === 'f12' || (ctrl && input.shift && key === 'i')) { if (wc) wc.toggleDevTools(); }
    else if (key === 'escape' && this.htmlFullscreen) { if (wc) wc.executeJavaScript('document.exitFullscreen && document.exitFullscreen()', true); }
    else if (ctrl && /^[1-9]$/.test(key)) {
      const list = this.tabs.tabs;
      const target = key === '9' ? list[list.length - 1] : list[Number(key) - 1];
      if (target) this.tabs.activate(target.id);
    } else handled = false;

    if (handled) event.preventDefault();
  };
}

// ---- Befehle aus der Oberfläche: immer an das Fenster, aus dem sie kommen ----
function on(channel, fn) {
  ipcMain.on('ui:' + channel, (event, data) => {
    const w = [...windows].find((x) => x.owns(event.sender));
    if (w) fn(w, data);
  });
}
const withWc = (fn) => (w) => { const wc = w.activeWc(); if (wc) fn(wc); };

on('new-tab', (w) => w.tabs.create());
on('close-tab', (w, id) => w.tabs.close(id));
on('activate-tab', (w, id) => w.tabs.activate(id));
on('navigate', (w, input) => w.tabs.navigate(input));
on('back', withWc((wc) => wc.navigationHistory.goBack()));
on('forward', withWc((wc) => wc.navigationHistory.goForward()));
on('reload', withWc((wc) => wc.reload()));
on('stop', withWc((wc) => wc.stop()));
on('focus-page', withWc((wc) => wc.focus()));
on('menu', (w, { which, x, y, id }) => w.showMenu(which, { x, y }, id));
on('vpn-toggle', (w) => w.actions.toggleVpn());
on('panel', (w, id) => w.actions.togglePanel(id));
on('open-passwords', (w) => w.actions.openPasswords());
on('open-library', (w, tab) => w.actions.openLibrary(tab));
on('bookmark-toggle', (w) => w.actions.toggleBookmark());
on('suggest-size', (w, h) => {
  w.dropHeight = Math.max(0, Number(h) || 0);
  w.layout();
  if (w.dropHeight) w.win.contentView.addChildView(w.ui); // Oberfläche nach oben holen
});
// ---- Schnellmenü: mehrere Einstellungen ändern, ohne dass sich etwas schließt ----
const QUICK_KEYS = ['animeVorleser.an', 'translateAuto', 'translateEngine', 'readVoice', 'readTempo', 'youtubeAds', 'sponsorblock', 'dislikes', 'twitchAds', 'twitchPoints', 'dns', 'forceDark', 'tabSleepMin', 'apiEnabled'];
function quickState(w) {
  const wc = w.activeWc();
  const url = wc ? wc.getURL() : '';
  const host = adblock.hostOf(url);
  const web = /^https?:/i.test(url);
  const s = vpn.status();
  const special = [
    { section: 'Schnell', key: '@vpn', label: 'VPN (Cloudflare WARP)', type: 'bool', value: s.state === 'on' || s.state === 'starting', note: s.state === 'starting' ? 'verbindet …' : s.info && s.info.loc ? `verbunden – ${s.info.loc}` : '' },
  ];
  if (web && host) special.push({ section: 'Schnell', key: '@adblock', label: `Werbeblocker auf ${host}`, type: 'bool', value: !adblock.isPaused(url) });
  return [...special, ...settingsPage.quickItems(QUICK_KEYS)];
}
ipcMain.handle('ui:quick', (event) => {
  const w = [...windows].find((x) => x.owns(event.sender));
  return w ? quickState(w) : [];
});
ipcMain.handle('ui:quick-set', async (event, { key, value } = {}) => {
  const w = [...windows].find((x) => x.owns(event.sender));
  if (!w) return [];
  const wc = w.activeWc();
  const url = wc ? wc.getURL() : '';
  if (key === '@vpn') { if (!!value !== (vpn.status().state === 'on')) w.actions.toggleVpn(); }
  else if (key === '@adblock') { if (!!value === adblock.isPaused(url)) { adblock.togglePause(url); if (wc) wc.reload(); } }
  else {
    const r = settingsPage.setKey(String(key), value);
    // Seiten-Extras wirken erst nach dem Neuladen
    if (wc && /^(youtubeAds|sponsorblock|dislikes)$/.test(key) && /youtube\.com/i.test(url)) wc.reload();
    if (wc && /^twitch/.test(key) && /twitch\.tv/i.test(url)) wc.reload();
    if (wc && key === 'animeVorleser.an' && value && vorleser.isSite(url)) wc.reload();
    if (wc && key === 'translateAuto' && value && /^https?:/i.test(url)) wc.reload();
    w.tabs.emitState();
    if (r.restart) return { items: quickState(w), restart: true };
  }
  await new Promise((res) => setTimeout(res, 150));
  return { items: quickState(w) };
});
ipcMain.handle('ui:suggest', (event, q) => ([...windows].some((x) => x.owns(event.sender)) ? library.suggest(q) : []));
on('mute-tab', (w, id) => {
  const t = w.tabs.tabs.find((x) => x.id === id);
  if (t) { t.view.webContents.setAudioMuted(!t.view.webContents.isAudioMuted()); w.tabs.emitState(); }
});
on('find', (w, { text, forward = true, findNext = false }) => {
  const wc = w.activeWc();
  if (!wc) return;
  if (!text) { wc.stopFindInPage('clearSelection'); w.send('find-result', { active: 0, total: 0 }); return; }
  wc.findInPage(text, { forward, findNext });
});
on('find-close', (w) => w.actions.closeFind());
on('tts-stop', () => reader.stop());
// Anime-Vorleser direkt über den Knopf in der Adressleiste ein-/ausschalten
on('reader-toggle', (w) => w.tabs.toggleReader());
on('open-settings', (w) => w.actions.openSettings());
on('adblock-toggle', (w) => {
  const wc = w.activeWc();
  const url = wc ? wc.getURL() : '';
  if (!/^https?:/i.test(url) || !adblock.isReady()) return;
  adblock.togglePause(url);
  wc.reload();
  w.tabs.emitState();
});
on('menu-html', (w, side) => w.openHtmlMenu(side === 'left' ? 'left' : 'right'));
on('menu-click', (w, id) => w.menuClick(Number(id)));
on('av-toggle', (w) => {
  const on = !vorleser.einst().an;
  vorleser.setEinst({ an: on });
  const wc = w.activeWc();
  if (on && wc && vorleser.isSite(wc.getURL())) wc.reload();
  w.tabs.emitState();
});
on('tts-ended', (w, s) => reader.ended(w, s));

app.on('second-instance', () => {
  const w = current();
  if (!w) return;
  if (w.win.isMinimized()) w.win.restore();
  w.win.focus();
});

app.whenReady().then(async () => {
  // Widevine (Kopierschutz für Netflix, Crunchyroll, Disney+ …) – nur mit der castLabs-Version von Electron.
  // Beim ersten Start lädt TZBrowser das Widevine-Modul von Google; danach ist es sofort da.
  const { components } = require('electron');
  if (components && components.whenReady) {
    const ready = components.whenReady()
      .then(() => console.log('[drm] Widevine bereit: ' + JSON.stringify(components.status())))
      .catch((e) => console.error('[drm] Widevine nicht verfügbar: ' + (e && e.message ? e.message : e)));
    await Promise.race([ready, new Promise((r) => setTimeout(r, 4000))]);
  }
  containers.setPrepare(prepareSession);
  privacy.applyDns();
  settingsPage.setup({ accents: ACCENTS, setAccent: (c) => design.setAccent(c) });
  // Design geändert: Oberfläche, Seitenleiste und offene Startseiten sofort anpassen
  design.setup(() => {
    broadcast('theme', theme());
    for (const w of windows) w.tabs.refreshNewtabs();
  }, settingsPage.isPage);
  // Tabs schlafen legen (Standard: nach 30 Minuten ohne Benutzung)
  setInterval(() => {
    const min = settings.get('tabSleepMin') ?? 30;
    for (const w of windows) w.tabs.sleepIdle(Number(min) || 0).catch(() => {});
  }, 60000);
  sites.setup();
  vorleser.setup();
  translate.setup((wcId) => {
    const w = windowOfWc(wcId);
    if (w && w.activeWc() && w.activeWc().id === wcId) w.tabs.emitState();
  }, (wc) => !!windowOfWc(wc.id));
  api.setup(apiHooks());
  library.setup();
  extensions.setup({
    getWin: () => { const w = current(); return w ? w.win : undefined; },
    createTab: (url, active) => {
      const w = current() || new GhostWindow();
      const t = w.tabs.create(url || null, { active });
      return [t.view.webContents, w.win];
    },
    selectTab: (wc) => { const w = windowOfWc(wc.id); if (w) { w.tabs.activate(w.tabs.byWebContents(wc.id).id); w.win.focus(); } },
    removeTab: (wc) => { const w = windowOfWc(wc.id); if (w) w.tabs.close(w.tabs.byWebContents(wc.id).id); },
    createWindow: (url) => new GhostWindow({ url: url || null }).win,
    removeWindow: (win) => { const w = [...windows].find((x) => x.win === win); if (w) w.win.close(); },
  });
  ai.setup({
    // Aktiver Tab im Fenster, zu dem das KI-Panel gehört
    getActiveTabFor: (sender) => {
      const w = [...windows].find((x) => x.panels.ownsWebContents(sender));
      return w ? w.activeWc() : null;
    },
  });
  passwords.setup(() => { const w = current(); return w ? w.win : undefined; });
  vpn.setup((status) => {
    broadcast('vpn', status);
    for (const w of windows) w.tabs.applyWebRtcAll();
  });
  prepareSession(session.defaultSession);
  // Tabs vom letzten Mal wiederherstellen (abschaltbar in den Einstellungen)
  const saved = settings.get('restoreSession') === false ? [] : sessionStore.load();
  let first = null;
  for (const ws of saved) {
    const w = new GhostWindow({ restore: ws, bounds: ws.bounds });
    if (!first) first = w;
  }
  if (!first) first = new GhostWindow();
  setInterval(() => sessionStore.save(windows), 15000);
  updater.setup(first.win);
  video.selfUpdate();

  // Werbeblocker laden (beim ersten Start werden die Listen heruntergeladen)
  try {
    await adblock.setupAdblock((wcId, n) => {
      const w = windowOfWc(wcId);
      if (w && w.activeWc() && w.activeWc().id === wcId) w.send('blocked', n);
    });
    adblockStatus = 'on';
  } catch (err) {
    console.error('[adblock] Start fehlgeschlagen:', err);
    adblockStatus = 'error';
  }
  broadcast('adblock', adblockStatus);
});

// Private Daten beim Beenden sicher löschen
let cleaned = false;
app.on('before-quit', (e) => {
  if (cleaned) return;
  e.preventDefault();
  cleaned = true;
  sessionStore.save(windows);
  tts.shutdown(); // selbst gestarteten Sprach-Server beenden
  Promise.race([containers.clearPrivate(), new Promise((r) => setTimeout(r, 1500))]).finally(() => app.quit());
});

app.on('window-all-closed', () => app.quit());
