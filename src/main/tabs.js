'use strict';
// Tab-Verwaltung: jeder Tab ist eine eigene WebContentsView.
// Tabs können in Containern laufen (eigene Cookies/Logins) und zwischen Fenstern verschoben werden.
// Jeder Tab merkt sich seinen aktuellen Besitzer (tab.owner), damit die Ereignisse nach dem
// Verschieben im richtigen Fenster landen.

const { WebContentsView, Menu, clipboard, shell } = require('electron');
const path = require('path');
const adblock = require('./adblock');
const video = require('./video');
const vpn = require('./vpn');
const containers = require('./containers');
const library = require('./library');
const translate = require('./translate');
const vorleser = require('./vorleser');
const readmode = require('./readmode');
const design = require('./design');

// Startseite: Design (Farben, Name, Logo, Kacheln) als Adress-Parameter mitgeben
function newtabQuery(c, accent) {
  const d = design.forUi();
  const q = { accent: d.accent || accent, name: d.name, tiles: JSON.stringify(d.tiles) };
  if (d.custom) Object.assign(q, { custom: '1', bg: d.bg, text: d.text, font: d.font, logo: d.logo, nbg: d.newtabBg });
  if (c) Object.assign(q, { c: c.name, color: c.color });
  return q;
}

const NEWTAB_FILE = path.join(__dirname, '..', 'ui', 'newtab.html');
// Interne TZBrowser-Seiten: Datei, eigener Preload und Anzeige in der Adressleiste
const INTERNAL = {
  passwords: {
    file: path.join(__dirname, '..', 'ui', 'passwords.html'),
    preload: path.join(__dirname, '..', 'preload', 'passwords-preload.js'),
    title: 'Passwörter',
    url: 'tzbrowser://passwoerter',
  },
  settings: {
    file: path.join(__dirname, '..', 'ui', 'settings.html'),
    preload: path.join(__dirname, '..', 'preload', 'settings-preload.js'),
    title: 'Einstellungen',
    url: 'tzbrowser://einstellungen',
  },
  library: {
    file: path.join(__dirname, '..', 'ui', 'library.html'),
    preload: path.join(__dirname, '..', 'preload', 'library-preload.js'),
    title: 'Bibliothek',
    url: 'tzbrowser://bibliothek',
  },
};
const SEARCH_URL = 'https://duckduckgo.com/?q=';
let tabSeq = 0; // über alle Fenster eindeutig

function isNewTabUrl(url) {
  return !url || (url.startsWith('file:') && /\/newtab\.html(\?|#|$)/.test(url));
}

// Eingabe aus der Adressleiste in eine URL umwandeln
function toUrl(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^(https?|file|about|chrome|view-source):/i.test(text)) return text;
  if (/^localhost(:\d+)?(\/|$)/i.test(text)) return 'http://' + text;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(text)) return 'http://' + text;
  if (!/\s/.test(text) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text)) return 'https://' + text;
  return SEARCH_URL + encodeURIComponent(text);
}

class TabManager {
  // hooks: { getAccent(), newWindow(url, opts), moveToNewWindow(tab), onEmpty() }
  constructor(win, emit, onShortcut, hooks = {}) {
    this.win = win;
    this.emit = emit;
    this.onShortcut = onShortcut;
    this.hooks = hooks;
    this.tabs = [];
    this.closed = []; // zuletzt geschlossene Tabs { url, container }
    this.activeId = null;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
  }

  get active() {
    return this.tabs.find((t) => t.id === this.activeId) || null;
  }

  byWebContents(wcId) {
    return this.tabs.find((t) => t.view.webContents.id === wcId) || null;
  }

  accent() {
    return this.hooks.getAccent ? this.hooks.getAccent() : '#fa1e4e';
  }

  // container: Container-ID oder null (Standard)
  create(url, { active = true, container = null, internal = null, query = {}, lazy = null, pinned = false } = {}) {
    const id = ++tabSeq;
    const page = internal && INTERNAL[internal];
    const c = page ? null : containers.get(container);
    if (c) containers.sessionFor(c.id); // Sitzung vorbereiten (Werbeblocker usw.)
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: true,
        partition: c ? containers.partitionFor(c.id) : undefined,
        preload: page ? page.preload : undefined,
      },
    });
    view.setBackgroundColor('#0b0a10');
    view.webContents.setMaxListeners(40); // Werbeblocker + TZBrowser hängen viele Ereignisse an
    const tab = {
      created: Date.now(),
      id, view, owner: this,
      title: page ? page.title : c && c.temporary ? 'Privater Tab' : 'Neuer Tab',
      url: '', favicon: '', loading: false,
      container: c ? c.id : null,
      internal: page ? internal : null,
      pinned: !!pinned,
    };
    // wiederhergestellter Tab: erst beim Anklicken laden (schneller Start)
    if (lazy && lazy.url) { tab.sleeping = { url: lazy.url, title: lazy.title || lazy.url, favicon: '' }; tab.title = tab.sleeping.title; }

    const idx = this.tabs.findIndex((t) => t.id === this.activeId);
    let at = idx >= 0 ? idx + 1 : this.tabs.length;
    const pinnedCount = this.tabs.filter((t) => t.pinned).length;
    if (!tab.pinned && at < pinnedCount) at = pinnedCount; // normale Tabs nie zwischen angeheftete
    if (tab.pinned) at = pinnedCount;
    this.tabs.splice(at, 0, tab);

    wire(tab);
    this.applyWebRtc(tab);
    const accent = this.accent();
    if (page) view.webContents.loadFile(page.file, { query: { accent, ...query } });
    else if (tab.sleeping) view.webContents.loadURL('about:blank');
    else if (url) view.webContents.loadURL(url);
    else view.webContents.loadFile(NEWTAB_FILE, { query: newtabQuery(c, accent) });
    // erst nach dem Laden melden: die Erweiterungs-Bibliothek wählt den Tab dabei u. U. schon aus
    if (this.hooks.onTabCreated) this.hooks.onTabCreated(tab);

    if (active || !this.activeId) this.activate(id);
    else this.emitState();
    return tab;
  }

  // Bei aktivem VPN darf WebRTC die echte IP nicht verraten
  applyWebRtc(tab) {
    tab.view.webContents.setWebRTCIPHandlingPolicy(vpn.isOn() ? 'disable_non_proxied_udp' : 'default_public_interface_only');
  }

  applyWebRtcAll() {
    this.tabs.forEach((t) => this.applyWebRtc(t));
  }

  containerSubmenu(url) {
    return [
      { label: 'Privater Tab (nichts wird gespeichert)', click: () => this.create(url, { container: containers.PRIVATE.id }) },
      { type: 'separator' },
      ...containers.all().map((c) => ({ label: c.name, click: () => this.create(url, { container: c.id }) })),
    ];
  }

  contextMenu(tab, p) {
    const wc = tab.view.webContents;
    const items = [];
    if (p.linkURL) {
      items.push(
        { label: 'Link in neuem Tab öffnen', click: () => this.create(p.linkURL, { active: false, container: tab.container }) },
        { label: 'Link in neuem Fenster öffnen', click: () => this.hooks.newWindow && this.hooks.newWindow(p.linkURL, { container: tab.container }) },
        { label: 'Link in Container-Tab öffnen', submenu: this.containerSubmenu(p.linkURL) },
        { label: 'Link-Adresse kopieren', click: () => clipboard.writeText(p.linkURL) },
        { label: 'Ziel speichern', click: () => wc.downloadURL(p.linkURL) },
        { type: 'separator' },
      );
    }
    if (p.mediaType === 'image' && p.srcURL) {
      items.push(
        { label: 'Bild in neuem Tab öffnen', click: () => this.create(p.srcURL, { active: false, container: tab.container }) },
        { label: 'Bild speichern', click: () => wc.downloadURL(p.srcURL) },
        { label: 'Bild kopieren', click: () => wc.copyImageAt(p.x, p.y) },
        { label: 'Bildadresse kopieren', click: () => clipboard.writeText(p.srcURL) },
        { type: 'separator' },
      );
    }
    if (p.mediaType === 'video' || p.mediaType === 'audio') {
      if (/^https?:/i.test(p.srcURL)) items.push({ label: 'Mediendatei speichern', click: () => wc.downloadURL(p.srcURL) });
      items.push(
        { label: 'Mediendatei speichern', submenu: video.menuTemplate(wc) },
        { label: 'Bild-in-Bild', click: () => wc.executeJavaScript(`(() => { const v = document.elementFromPoint(${p.x}, ${p.y}); const el = v && (v.tagName === 'VIDEO' ? v : v.closest('div') && v.closest('div').querySelector('video')) || document.querySelector('video'); el && el.requestPictureInPicture(); })()`, true).catch(() => {}) },
        { type: 'separator' },
      );
    }
    if (p.isEditable) {
      for (const s of p.dictionarySuggestions || []) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      if ((p.dictionarySuggestions || []).length) items.push({ type: 'separator' });
      items.push(
        { label: 'Ausschneiden', role: 'cut', enabled: p.editFlags.canCut },
        { label: 'Kopieren', role: 'copy', enabled: p.editFlags.canCopy },
        { label: 'Einfügen', role: 'paste', enabled: p.editFlags.canPaste },
        { label: 'Alles auswählen', role: 'selectAll' },
        { type: 'separator' },
      );
    } else if (p.selectionText) {
      const sel = p.selectionText.trim();
      items.push(
        { label: 'Kopieren', role: 'copy' },
        { label: `Suchen nach „${sel.length > 30 ? sel.slice(0, 30) + '…' : sel}“`, click: () => this.create(SEARCH_URL + encodeURIComponent(sel), { container: tab.container }) },
        { type: 'separator' },
      );
    }
    if (!p.linkURL && !p.isEditable && !p.selectionText && p.mediaType === 'none') {
      items.push(
        { label: 'Zurück', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: 'Vorwärts', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: 'Neu laden', click: () => wc.reload() },
        { type: 'separator' },
        { label: 'Seite im Standardbrowser öffnen', click: () => shell.openExternal(wc.getURL()) },
        { type: 'separator' },
      );
    }
    const extra = this.hooks.contextItems ? this.hooks.contextItems(wc, p) : [];
    if (extra.length) items.push(...extra, { type: 'separator' });
    items.push({ label: 'Untersuchen', click: () => wc.inspectElement(p.x, p.y) });
    Menu.buildFromTemplate(items).popup();
  }

  // Menü für Rechtsklick auf einen Tab
  tabMenu(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return null;
    const url = tab.view.webContents.getURL();
    const web = /^https?:/i.test(url);
    return Menu.buildFromTemplate([
      { label: 'Neu laden', click: () => tab.view.webContents.reload() },
      { label: tab.pinned ? 'Tab lösen' : 'Tab anheften', click: () => this.togglePin(id) },
      { label: 'Tab duplizieren', enabled: web, click: () => this.create(url, { container: tab.container }) },
      { label: 'In neues Fenster verschieben', enabled: this.tabs.length > 1, click: () => this.hooks.moveToNewWindow && this.hooks.moveToNewWindow(tab) },
      { label: 'In Container öffnen', enabled: web, submenu: this.containerSubmenu(url) },
      { label: tab.view.webContents.isAudioMuted() ? 'Ton einschalten' : 'Ton stummschalten', click: () => { tab.view.webContents.setAudioMuted(!tab.view.webContents.isAudioMuted()); this.emitState(); } },
      { type: 'separator' },
      { label: 'Andere Tabs schließen', enabled: this.tabs.length > 1, click: () => this.tabs.filter((t) => t.id !== id).forEach((t) => this.close(t.id)) },
      { label: 'Tabs rechts schließen', enabled: this.tabs.indexOf(tab) < this.tabs.length - 1, click: () => this.tabs.slice(this.tabs.indexOf(tab) + 1).forEach((t) => this.close(t.id)) },
      { label: 'Tab schließen', accelerator: 'Ctrl+W', registerAccelerator: false, click: () => this.close(id) },
    ]);
  }

  activate(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const prev = this.active;
    if (prev && prev !== tab) {
      prev.lastActive = Date.now();
      prev.view.webContents.stopFindInPage('clearSelection');
      this.win.contentView.removeChildView(prev.view);
    }
    this.activeId = id;
    if (tab.sleeping) this.wake(tab);
    this.win.contentView.addChildView(tab.view);
    tab.view.setBounds(this.bounds);
    // Neuer Tab: wie in Firefox gleich in die Adressleiste tippen
    if (!tab.internal && isNewTabUrl(tab.view.webContents.getURL())) this.emit('focus-address');
    else tab.view.webContents.focus();
    if (this.hooks.onTabActivated) this.hooks.onTabActivated(tab);
    this.emit('tab-switched', id);
    this.emitState();
  }

  // Tab aus diesem Fenster lösen, ohne ihn zu schließen (zum Verschieben)
  detach(id) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const [tab] = this.tabs.splice(idx, 1);
    if (this.activeId === id) {
      this.win.contentView.removeChildView(tab.view);
      this.activeId = null;
      const next = this.tabs[idx] || this.tabs[idx - 1];
      if (next) this.activate(next.id);
    }
    if (this.tabs.length === 0 && this.hooks.onEmpty) this.hooks.onEmpty();
    else this.emitState();
    return tab;
  }

  // Tab aus einem anderen Fenster übernehmen
  adopt(tab, { active = true } = {}) {
    tab.owner = this;
    if (this.hooks.onTabCreated) this.hooks.onTabCreated(tab);
    this.tabs.push(tab);
    if (active) this.activate(tab.id);
    else this.emitState();
  }

  // Design geändert: offene Startseiten neu aufbauen
  refreshNewtabs() {
    for (const t of this.tabs) {
      const wc = t.view.webContents;
      if (!t.sleeping && isNewTabUrl(wc.getURL())) wc.loadFile(NEWTAB_FILE, { query: newtabQuery(containers.get(t.container), this.accent()) });
    }
  }

  // ---- Angeheftete Tabs: klein, immer links, bleiben über Neustarts erhalten ----
  togglePin(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    this.tabs.splice(this.tabs.indexOf(tab), 1);
    tab.pinned = !tab.pinned;
    const pinnedCount = this.tabs.filter((t) => t.pinned).length;
    this.tabs.splice(pinnedCount, 0, tab);
    this.emitState();
  }

  // Für die Sitzungs-Wiederherstellung (ohne private Tabs und interne Seiten)
  snapshot() {
    const list = [];
    let activeIndex = 0;
    for (const t of this.tabs) {
      if (t.container === containers.PRIVATE.id || t.internal) continue;
      const wc = t.view.webContents;
      const url = t.sleeping ? t.sleeping.url : t.readerOf || wc.getURL();
      if (!/^https?:/i.test(url)) continue;
      if (t.id === this.activeId) activeIndex = list.length;
      list.push({ url, title: (t.sleeping ? t.sleeping.title : t.title) || url, container: t.container, pinned: !!t.pinned });
    }
    return { tabs: list, activeIndex };
  }

  // ---- Tabs schlafen legen: lange unbenutzte Tabs entladen (spart Arbeitsspeicher) ----
  async sleepIdle(minutes) {
    if (!minutes) return;
    const limit = Date.now() - minutes * 60000;
    for (const t of this.tabs) {
      if (t.id === this.activeId || t.sleeping || t.internal || t.container === containers.PRIVATE.id) continue;
      const wc = t.view.webContents;
      const url = wc.getURL();
      if (!/^https?:/i.test(url) || wc.isCurrentlyAudible() || (t.lastActive || t.created || Date.now()) > limit) continue;
      // nicht schlafen legen, wenn dort gerade Text getippt wurde (Formulare, Nachrichten)
      let typing = false;
      try {
        typing = await wc.executeJavaScript(`[...document.querySelectorAll('textarea,[contenteditable="true"],[contenteditable=""]')].some((e) => (e.value || e.textContent || '').trim().length > 0)`, true);
      } catch { /* egal */ }
      if (typing || t.id === this.activeId) continue;
      t.sleeping = { url, title: t.title, favicon: t.favicon };
      wc.loadURL('about:blank');
      console.log('[tabs] schlafen gelegt: ' + url.slice(0, 80));
    }
    this.emitState();
  }

  // Lesemodus an/aus (F9 oder 📖 in der Adressleiste)
  async toggleReader(tab = this.active) {
    if (!tab) return;
    const wc = tab.view.webContents;
    if (tab.readerOf && wc.getURL().startsWith('data:')) {
      if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); else wc.loadURL(tab.readerOf);
      tab.readerOf = null;
      return;
    }
    if (!/^https?:/i.test(wc.getURL())) return;
    const src = await readmode.open(wc, this.accent());
    if (src) tab.readerOf = src;
    else this.emit('toast', 'Für diese Seite gibt es keine Leseansicht');
    this.emitState();
  }

  wake(tab) {
    const s = tab.sleeping;
    console.log('[tabs] aufwecken: ' + String(s.url).slice(0, 80));
    tab.sleeping = null;
    tab.title = s.title;
    tab.favicon = s.favicon;
    const h = tab.view.webContents.navigationHistory;
    if (h.canGoBack()) h.goBack(); else tab.view.webContents.loadURL(s.url);
  }

  close(id) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const [tab] = this.tabs.splice(idx, 1);
    const url = tab.sleeping ? tab.sleeping.url : tab.view.webContents.getURL();
    const isPrivate = tab.container === containers.PRIVATE.id;
    if (!isNewTabUrl(url) && !isPrivate && !tab.internal) {
      this.closed.push({ url, container: tab.container });
      if (this.closed.length > 25) this.closed.shift();
    }
    if (this.activeId === id) {
      this.win.contentView.removeChildView(tab.view);
      this.activeId = null;
      const next = this.tabs[idx] || this.tabs[idx - 1];
      if (next) this.activate(next.id);
    }
    video.reset(tab.view.webContents.id);
    tab.view.webContents.close();
    // Letzter privater Tab zu: Spuren löschen
    if (isPrivate && !this.tabs.some((t) => t.container === containers.PRIVATE.id)) containers.clearPrivate().catch(() => {});
    if (this.tabs.length === 0) {
      // Letzter Tab: Fenster schließen, wenn es noch andere gibt – sonst neuer leerer Tab
      if (this.hooks.onEmpty && this.hooks.onEmpty()) return;
      this.create();
    } else this.emitState();
  }

  // Alle Tabs schließen (Fenster wird geschlossen)
  destroyAll() {
    for (const t of this.tabs) {
      video.reset(t.view.webContents.id);
      if (!t.view.webContents.isDestroyed()) t.view.webContents.close();
    }
    this.tabs = [];
  }

  canRestore() {
    return this.closed.length > 0;
  }

  restoreClosed() {
    const last = this.closed.pop();
    if (last) this.create(last.url, { container: last.container });
  }

  cycle(step) {
    if (this.tabs.length < 2) return;
    const idx = this.tabs.findIndex((t) => t.id === this.activeId);
    const next = this.tabs[(idx + step + this.tabs.length) % this.tabs.length];
    this.activate(next.id);
  }

  navigate(input) {
    const url = toUrl(input);
    const tab = this.active;
    if (!url || !tab) return;
    tab.view.webContents.loadURL(url);
    tab.view.webContents.focus();
  }

  setBounds(bounds) {
    this.bounds = bounds;
    if (this.active) this.active.view.setBounds(bounds);
  }

  state() {
    const a = this.active;
    const wc = a && a.view.webContents;
    const url = wc ? wc.getURL() : '';
    const containerInfo = (t) => {
      const c = containers.get(t.container);
      return c ? { name: c.name, color: c.color, temporary: !!c.temporary } : null;
    };
    return {
      activeId: this.activeId,
      tabs: this.tabs.map((t) => ({
        id: t.id,
        title: t.sleeping ? t.sleeping.title : t.title,
        url: t.sleeping ? t.sleeping.url : t.readerOf && /^data:/.test(t.url) ? t.readerOf : t.internal ? INTERNAL[t.internal].url : isNewTabUrl(t.url) ? '' : t.url,
        favicon: t.sleeping ? t.sleeping.favicon : t.favicon,
        sleeping: !!t.sleeping,
        pinned: !!t.pinned,
        loading: t.loading,
        muted: t.view.webContents.isAudioMuted(),
        audible: t.view.webContents.isCurrentlyAudible(),
        container: containerInfo(t),
      })),
      canGoBack: !!wc && wc.navigationHistory.canGoBack(),
      canGoForward: !!wc && wc.navigationHistory.canGoForward(),
      blocked: wc ? adblock.getBlocked(wc.id) : 0,
      paused: /^https?:/i.test(url) && adblock.isPaused(url),
      video: !!wc && /^https?:/i.test(url) && video.available(wc),
      container: a ? containerInfo(a) : null,
      bookmarked: /^https?:/i.test(url) && library.isBookmarked(url),
      translated: wc && /^https?:/i.test(url) ? translate.stateFor(wc.id) : null,
      reader: a && a.readerOf && /^data:/.test(url) ? 'on' : /^https?:/i.test(url) ? 'off' : null,
      vorleser: wc && vorleser.isSite(url) ? { on: !!vorleser.einst().an } : null,
    };
  }

  emitState() {
    this.emit('state', this.state());
  }
}

// Ereignisse eines Tabs – gehen immer an den aktuellen Besitzer (tab.owner)
function wire(tab) {
  const wc = tab.view.webContents;
  const m = () => tab.owner;
  const update = () => {
    tab.url = wc.getURL();
    // Interne Seite verlassen -> normaler Tab
    if (tab.internal && !/^file:/.test(tab.url)) tab.internal = null;
    m().emitState();
  };

  const isPrivate = () => tab.container === containers.PRIVATE.id || !!tab.sleeping; // schlafende Tabs nicht in den Verlauf
  wc.on('page-title-updated', (_e, title) => {
    tab.title = title;
    if (!isPrivate()) library.updateTitle(wc.getURL(), title);
    m().emitState();
  });
  // Verlauf (nie aus privaten Tabs)
  wc.on('did-navigate', (_e, url) => { if (!isPrivate()) library.addVisit(url, ''); });
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => { if (isMainFrame && !isPrivate()) library.addVisit(url, wc.getTitle()); });
  wc.on('page-favicon-updated', (_e, favs) => { tab.favicon = favs[0] || ''; m().emitState(); });
  wc.on('did-start-loading', () => { tab.loading = true; m().emitState(); });
  wc.on('did-stop-loading', () => { tab.loading = false; update(); });
  wc.on('did-navigate', update);
  wc.on('did-navigate-in-page', update);
  wc.on('audio-state-changed', () => m().emitState());
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      if (!/^data:/.test(details.url || '')) tab.readerOf = null;
      translate.reset(wc.id);
      adblock.resetBlocked(wc.id);
      video.reset(wc.id);
      tab.favicon = '';
    }
  });
  wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) { // -3 = abgebrochen
      tab.title = 'Seite nicht erreichbar';
      m().emitState();
    }
  });
  wc.on('found-in-page', (_e, r) => {
    if (tab.id === m().activeId) m().emit('find-result', { active: r.activeMatchOrdinal, total: r.matches });
  });

  // Popups und target=_blank: neuer Tab im selben Container; "neues Fenster" (Umschalt+Klick) -> Fenster
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (disposition === 'new-window' && m().hooks.newWindow) m().hooks.newWindow(url, { container: tab.container });
    else m().create(url, { active: disposition !== 'background-tab', container: tab.container });
    return { action: 'deny' };
  });

  // Vollbild von Videos
  wc.on('enter-html-full-screen', () => m().emit('fullscreen', true));
  wc.on('leave-html-full-screen', () => m().emit('fullscreen', false));

  wc.on('before-input-event', (event, input) => m().onShortcut(event, input));
  wc.on('context-menu', (_e, params) => m().contextMenu(tab, params));
}

module.exports = { TabManager, toUrl };
