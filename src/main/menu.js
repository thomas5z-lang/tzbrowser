'use strict';
// Hauptmenü (☰ / TZBrowser-Logo). Aufgeteilt in: Tabs · Bibliothek · Diese Seite · Schutz · Extras · TZBrowser.
// Die Tastenkürzel werden nur angezeigt, ausgeführt werden sie in main.js (handleShortcut).

const { app, Menu, dialog, shell, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const adblock = require('./adblock');
const downloads = require('./downloads');
const video = require('./video');
const updater = require('./updater');
const vpn = require('./vpn');
const containers = require('./containers');
const settings = require('./settings');
const library = require('./library');
const extensions = require('./extensions');
const reader = require('./reader');
const tts = require('./tts');
const vorleser = require('./vorleser');
const translate = require('./translate');
const api = require('./api');
const privacy = require('./privacy');
const shots = require('./shots');

const SHORTCUTS = [
  'Strg+T  Neuer Tab · Strg+W  Tab schließen · Strg+Umschalt+T  Tab wiederherstellen',
  'Strg+N  Neues Fenster · Strg+Umschalt+P  Privater Tab · Strg+Tab  Nächster Tab · Strg+1…9  Tab wählen',
  'Strg+L  Adressleiste · Strg+F  Auf Seite suchen · F9  Lesemodus · F11  Vollbild',
  'Strg+D  Lesezeichen · Strg+Umschalt+O  Lesezeichen verwalten · Strg+H  Verlauf · Strg+J  Downloads',
  'Strg+Umschalt+K  Passwörter · Strg+Umschalt+V  VPN · Strg+Umschalt+A  TZBrowser KI · Strg+,  Einstellungen',
  'Strg+P  Drucken · Strg+S  Speichern · Strg+U  Quelltext · F12  Entwicklerwerkzeuge',
  'Strg+Plus / Strg+Minus / Strg+0  Zoom · Alt+←/→  Zurück/Vorwärts · Strg+Umschalt+Q  Beenden',
];

// Schalter für die Seiten-Extras; wirken nach dem Neuladen der Seite
function toggle(ctx, key, label, hint) {
  return {
    label,
    sublabel: hint,
    type: 'checkbox',
    checked: !!settings.get(key),
    click: (item) => {
      settings.set(key, item.checked);
      const wc = ctx.tabs.active && ctx.tabs.active.view.webContents;
      if (wc && /youtube\.com|twitch\.tv/i.test(wc.getURL())) wc.reload();
    },
  };
}

function voiceMenu(ctx) {
  const voice = reader.voice();
  const tempo = reader.tempo();
  return [
    {
      label: 'Stimme',
      submenu: [
        { label: 'Windows-Stimme (sofort, ohne KI)', type: 'radio', checked: voice === 'windows', click: () => settings.set('readVoice', 'windows') },
        { type: 'separator' },
        ...tts.voices().map((v) => ({ label: tts.voiceName(v), type: 'radio', checked: voice === v, click: () => settings.set('readVoice', v) })),
      ],
    },
    { label: `Tempo (${tempo.toFixed(1)}×)`, submenu: [0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6].map((v) => ({ label: `${v.toFixed(1)}×`, type: 'radio', checked: tempo === v, click: () => settings.set('readTempo', v) })) },
    { type: 'separator' },
    { label: tts.running() ? '● KI-Stimme bereit' : tts.installed() ? '○ KI-Stimme startet bei Bedarf (ca. 20 s)' : '⚠ Sprach-Server nicht gefunden', enabled: false },
    {
      label: 'Ordner des Sprach-Add-ons …',
      click: async () => {
        const r = await dialog.showOpenDialog(ctx.win, { title: 'Ordner des Sprach-Add-ons (mit server.py)', defaultPath: tts.dir(), properties: ['openDirectory'] });
        if (!r.canceled && r.filePaths[0]) settings.set('vorleserDir', r.filePaths[0]);
      },
    },
  ];
}

function subtitleMenu(ctx) {
  const reloadSites = () => {
    for (const t of ctx.tabs.tabs) if (vorleser.isSite(t.view.webContents.getURL())) t.view.webContents.reload();
  };
  return [
    { label: 'Untertitel vorlesen', sublabel: 'Crunchyroll, Netflix, Prime, Disney+, YouTube …', type: 'checkbox', checked: !!vorleser.einst().an, click: (i) => { vorleser.setEinst({ an: i.checked }); if (i.checked) reloadSites(); } },
    { type: 'separator' },
    ...vorleser.menuTemplate(reloadSites).slice(2),
  ];
}

function apiMenu(ctx) {
  const on = api.enabled();
  return [
    { label: `KI-Schnittstelle aktiv (127.0.0.1:${api.port()})`, type: 'checkbox', checked: on, click: (i) => api.setEnabled(i.checked) },
    { label: 'Schlüssel in die Zwischenablage kopieren', enabled: on, click: () => clipboard.writeText(fs.readFileSync(api.tokenFile(), 'utf8').trim()) },
    {
      label: 'Neuen Schlüssel erzeugen',
      click: async () => {
        const { response } = await dialog.showMessageBox(ctx.win, { type: 'question', buttons: ['Neu erzeugen', 'Abbrechen'], defaultId: 1, cancelId: 1, message: 'Neuen Schlüssel erzeugen?', detail: 'Verbundene Programme brauchen danach den neuen Schlüssel.' });
        if (response === 0) api.newToken();
      },
    },
    {
      label: 'Was kann die Schnittstelle?',
      click: () => dialog.showMessageBox(ctx.win, {
        type: 'info',
        title: 'TZBrowser KI-Schnittstelle',
        message: 'TZBrowser per KI steuern (z. B. Claude)',
        detail: `Nur auf diesem PC erreichbar: http://127.0.0.1:${api.port()}\nJede Anfrage braucht den Schlüssel: Authorization: Bearer <Schlüssel>\n\n`
          + 'GET  /v1/status · /v1/tabs · /v1/tabs/<id>/text\n'
          + 'POST /v1/open {url} · /v1/search {q}\n'
          + 'POST /v1/tabs/<id>/navigate {url} · activate · close\n'
          + 'POST /v1/tabs/<id>/translate {mode: "de"|"original"}\n'
          + 'POST /v1/speak {text} oder {tabId} · /v1/speak/stop\n\n'
          + 'Claude: tools/tzbrowser-mcp.js (MCP-Brücke)\n'
          + 'Gesperrt: private Tabs, Passwörter, Formulare absenden, Skripte ausführen.',
      }),
    },
  ];
}

// Liefert die Einträge (für das TZBrowser-eigene HTML-Menü und für ein natives Menü)
function mainTemplate(ctx) {
  const tab = ctx.tabs.active;
  const wc = tab && tab.view.webContents;
  const url = wc ? wc.getURL() : '';
  const isWeb = /^https?:/i.test(url);
  const host = adblock.hostOf(url);
  const zoom = wc ? Math.round(100 * Math.pow(1.2, wc.getZoomLevel())) : 100;
  const s = vpn.status();
  const where = s.info && s.info.loc ? ` – ${s.info.loc}` : '';
  const dnsKey = privacy.dnsKey();

  const shot = (mode) => shots.capture(wc, mode).catch((e) => dialog.showMessageBox(ctx.win, { type: 'warning', message: 'Screenshot nicht möglich', detail: e.message }));
  const pip = () => wc.executeJavaScript(`(() => {
    if (document.pictureInPictureElement) { document.exitPictureInPicture(); return true; }
    const v = [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    if (!v) return false;
    v.disablePictureInPicture = false;
    v.requestPictureInPicture();
    return true;
  })()`, true).then((ok) => { if (!ok) dialog.showMessageBox(ctx.win, { type: 'info', message: 'Auf dieser Seite läuft kein Video' }); }).catch(() => {});

  return [
    // ---- Tabs & Fenster ----
    { label: 'Neuer Tab', accelerator: 'Ctrl+T', registerAccelerator: false, click: () => ctx.tabs.create() },
    { label: 'Neues Fenster', accelerator: 'Ctrl+N', registerAccelerator: false, click: () => ctx.actions.newWindow() },
    { label: 'Neuer privater Tab', accelerator: 'Ctrl+Shift+P', registerAccelerator: false, click: () => ctx.actions.privateTab() },
    { label: 'Neuer Container-Tab', submenu: containers.all().map((c) => ({ label: c.name, click: () => ctx.tabs.create(null, { container: c.id }) })) },
    { label: 'Tab wiederherstellen', accelerator: 'Ctrl+Shift+T', registerAccelerator: false, enabled: ctx.tabs.canRestore(), click: () => ctx.tabs.restoreClosed() },
    { label: tab && tab.pinned ? 'Tab lösen' : 'Tab anheften', enabled: !!tab, click: () => ctx.tabs.togglePin(tab.id) },
    { type: 'separator' },

    // ---- Bibliothek ----
    {
      label: 'Lesezeichen',
      submenu: [
        { label: 'Lesezeichen für diese Seite', accelerator: 'Ctrl+D', registerAccelerator: false, enabled: isWeb, click: () => ctx.actions.toggleBookmark() },
        { label: 'Lesezeichen verwalten', accelerator: 'Ctrl+Shift+O', registerAccelerator: false, click: () => ctx.actions.openLibrary('lesezeichen') },
        { type: 'separator' },
        ...(library.listBookmarks().slice(0, 25).map((b) => ({ label: b.title.length > 55 ? b.title.slice(0, 53) + '…' : b.title, click: () => ctx.tabs.create(b.url) }))),
      ],
    },
    {
      label: 'Verlauf',
      submenu: [
        { label: 'Verlauf anzeigen', accelerator: 'Ctrl+H', registerAccelerator: false, click: () => ctx.actions.openLibrary('verlauf') },
        { type: 'separator' },
        { label: 'Zuletzt besucht', enabled: false },
        ...(library.searchHistory('', 12).map((h) => ({ label: (h.title || h.url).slice(0, 55), click: () => ctx.tabs.create(h.url) }))),
      ],
    },
    { label: 'Downloads', accelerator: 'Ctrl+J', registerAccelerator: false, submenu: downloads.menuTemplate() },
    { label: 'Passwörter', accelerator: 'Ctrl+Shift+K', registerAccelerator: false, click: () => ctx.actions.openPasswords() },
    { type: 'separator' },

    // ---- Diese Seite ----
    {
      label: 'Diese Seite',
      enabled: !!wc,
      submenu: !wc ? [] : [
        { label: 'Auf Seite suchen …', accelerator: 'Ctrl+F', registerAccelerator: false, click: () => ctx.actions.openFind() },
        { label: 'Lesemodus', accelerator: 'F9', registerAccelerator: false, enabled: isWeb || !!(tab && tab.readerOf), click: () => ctx.tabs.toggleReader() },
        {
          label: `Zoom (${zoom} %)`,
          submenu: [
            { label: 'Vergrößern', accelerator: 'Ctrl+Plus', registerAccelerator: false, click: () => wc.setZoomLevel(wc.getZoomLevel() + 0.5) },
            { label: 'Verkleinern', accelerator: 'Ctrl+-', registerAccelerator: false, click: () => wc.setZoomLevel(wc.getZoomLevel() - 0.5) },
            { label: 'Zurücksetzen (100 %)', accelerator: 'Ctrl+0', registerAccelerator: false, click: () => wc.setZoomLevel(0) },
          ],
        },
        { label: 'Vollbild', accelerator: 'F11', registerAccelerator: false, type: 'checkbox', checked: ctx.win.isFullScreen(), click: () => ctx.actions.toggleFullscreen() },
        { type: 'separator' },
        { label: 'Übersetzen', submenu: translate.menuTemplate(isWeb ? wc : null) },
        {
          label: 'Vorlesen',
          submenu: [
            { label: 'Seite vorlesen', enabled: isWeb, click: () => reader.readPage(ctx.ghost, wc) },
            { label: 'Seite als MP3 speichern …', enabled: isWeb, click: () => reader.readPage(ctx.ghost, wc, true) },
            { label: 'Vorlesen stoppen', enabled: reader.isSpeaking(), click: () => reader.stop() },
            { label: 'Tipp: Text markieren → Rechtsklick → Vorlesen', enabled: false },
          ],
        },
        { label: 'Mediendatei speichern', enabled: isWeb, submenu: isWeb ? video.menuTemplate(wc) : [] },
        { label: 'Bild-in-Bild', enabled: isWeb, click: pip },
        { type: 'separator' },
        {
          label: 'Screenshot',
          enabled: isWeb || !!(tab && tab.readerOf),
          submenu: [
            { label: 'Sichtbarer Bereich (auch in die Zwischenablage)', click: () => shot('visible') },
            { label: 'Ganze Seite', click: () => shot('full') },
            { label: 'Als PDF', click: () => shot('pdf') },
          ],
        },
        { label: 'Drucken …', accelerator: 'Ctrl+P', registerAccelerator: false, enabled: isWeb, click: () => wc.print() },
        { label: 'Seite speichern unter …', accelerator: 'Ctrl+S', registerAccelerator: false, enabled: isWeb, click: () => ctx.actions.savePage() },
        { type: 'separator' },
        {
          label: host ? `Werbeblocker auf ${host} pausieren` : 'Werbeblocker hier pausieren',
          type: 'checkbox',
          enabled: isWeb && adblock.isReady(),
          checked: isWeb && adblock.isPaused(url),
          click: () => { adblock.togglePause(url); wc.reload(); },
        },
        { label: 'Seitenquelltext anzeigen', accelerator: 'Ctrl+U', registerAccelerator: false, enabled: isWeb, click: () => ctx.tabs.create('view-source:' + url) },
        { label: 'Im Standardbrowser öffnen', enabled: isWeb, click: () => shell.openExternal(url) },
      ],
    },
    { type: 'separator' },

    // ---- Schutz & Privatsphäre ----
    {
      label: 'Schutz & Privatsphäre',
      submenu: [
        {
          label: s.state === 'on' ? `VPN (Cloudflare WARP)${where}` : s.state === 'starting' ? 'VPN verbindet …' : 'VPN (Cloudflare WARP)',
          type: 'checkbox',
          accelerator: 'Ctrl+Shift+V',
          registerAccelerator: false,
          checked: s.state === 'on' || s.state === 'starting',
          click: () => ctx.actions.toggleVpn(),
        },
        { label: 'Neuer privater Tab', accelerator: 'Ctrl+Shift+P', registerAccelerator: false, click: () => ctx.actions.privateTab() },
        { type: 'separator' },
        { label: 'Verschlüsseltes DNS', enabled: false },
        ...Object.entries(privacy.DNS).map(([k, d]) => ({ label: d.label, type: 'radio', checked: dnsKey === k, click: () => { settings.set('dns', k); privacy.applyDns(); } })),
        { label: 'Streng: nie unverschlüsselt zurückfallen', type: 'checkbox', checked: !!settings.get('dnsStrict'), click: (i) => { settings.set('dnsStrict', i.checked); privacy.applyDns(); } },
        { type: 'separator' },
        {
          label: 'Werbeblocker-Filterlisten jetzt aktualisieren',
          enabled: adblock.isReady(),
          click: async () => {
            ctx.sendUi('adblock', 'loading');
            try { await adblock.refreshLists(); ctx.sendUi('adblock', 'on'); } catch { ctx.sendUi('adblock', 'error'); }
          },
        },
        { label: 'Alle Seiten dunkel darstellen', sublabel: 'wirkt nach Neustart von TZBrowser', type: 'checkbox', checked: !!settings.get('forceDark'), click: (i) => settings.set('forceDark', i.checked) },
      ],
    },

    // ---- Extras ----
    {
      label: 'Extras',
      submenu: [
        {
          label: 'YouTube && Twitch',
          submenu: [
            toggle(ctx, 'youtubeAds', 'YouTube: Videowerbung überspringen'),
            toggle(ctx, 'sponsorblock', 'YouTube: Sponsoren überspringen (SponsorBlock)'),
            toggle(ctx, 'dislikes', 'YouTube: Dislikes anzeigen'),
            { type: 'separator' },
            toggle(ctx, 'twitchAds', 'Twitch: Werbung blockieren (Purple AdBlock)'),
            toggle(ctx, 'twitchPoints', 'Twitch: Kanalpunkte automatisch abholen'),
          ],
        },
        { label: 'Untertitel-Vorleser', submenu: subtitleMenu(ctx) },
        { label: 'Vorlese-Stimme', submenu: voiceMenu(ctx) },
        { label: 'Erweiterungen', submenu: extensions.menuTemplate({ openStore: (u) => ctx.tabs.create(u) }) },
        { label: 'KI-Schnittstelle (KI-Assistenten wie Claude)', submenu: apiMenu(ctx) },
      ],
    },
    { type: 'separator' },

    // ---- TZBrowser ----
    { label: 'Einstellungen', accelerator: 'Ctrl+,', registerAccelerator: false, click: () => ctx.actions.openSettings() },
    { label: 'Sicherung (exportieren / einlesen) …', click: () => ctx.actions.openSettings() },
    {
      label: 'Weitere Werkzeuge',
      submenu: [
        { label: 'Entwicklerwerkzeuge', accelerator: 'F12', registerAccelerator: false, enabled: !!wc, click: () => wc.toggleDevTools() },
        { label: 'TZBrowser-Datenordner öffnen', click: () => shell.openPath(app.getPath('userData')) },
      ],
    },
    {
      label: 'Hilfe',
      submenu: [
        { label: 'Tastenkürzel', click: () => dialog.showMessageBox(ctx.win, { type: 'info', title: 'TZBrowser – Tastenkürzel', message: 'Tastenkürzel', detail: SHORTCUTS.join('\n') }) },
        { label: 'Nach Updates suchen', click: () => updater.checkNow() },
        {
          label: 'Über TZBrowser',
          click: () => dialog.showMessageBox(ctx.win, {
            type: 'info',
            title: 'Über TZBrowser',
            icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
            message: `TZBrowser ${app.getVersion()}`,
            detail: `Schneller, privater Browser mit starkem Werbeblocker.\nVon ZeroCool – gebaut mit Claude.\n\nChromium ${process.versions.chrome}\nElectron ${process.versions.electron}\nKeine Telemetrie.`,
          }),
        },
      ],
    },
    { label: 'Beenden', accelerator: 'Ctrl+Shift+Q', registerAccelerator: false, click: () => app.quit() },
  ];
}

function buildMainMenu(ctx) {
  return Menu.buildFromTemplate(mainTemplate(ctx));
}

module.exports = { buildMainMenu, mainTemplate };
