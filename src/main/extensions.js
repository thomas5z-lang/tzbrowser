'use strict';
// Chrome-Erweiterungen in TZBrowser
//  - electron-chrome-extensions: stellt die chrome.*-APIs (Tabs, Fenster, Popups, Kontextmenüs) bereit
//  - electron-chrome-web-store: "Zu Chrome hinzufügen" direkt im Chrome Web Store, automatische Updates
// Erweiterungen laufen in normalen Tabs (Standardsitzung) – nicht in Containern/privaten Tabs.

const { session, dialog, shell, app } = require('electron');
const path = require('path');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { installChromeWebStore, uninstallExtension, updateExtensions } = require('electron-chrome-web-store');

const STORE_URL = 'https://chromewebstore.google.com/category/extensions?hl=de';
let ext = null;
let getWin = () => null;

function ses() {
  return session.defaultSession;
}

// hooks: { createTab(url, active), selectTab(wc), removeTab(wc), createWindow(url), removeWindow(win), getWin() }
async function setup(hooks) {
  getWin = hooks.getWin;
  ext = new ElectronChromeExtensions({
    session: ses(),
    createTab: async (details) => hooks.createTab(details.url, details.active !== false),
    selectTab: (wc) => hooks.selectTab(wc),
    removeTab: (wc) => hooks.removeTab(wc),
    createWindow: async (details) => hooks.createWindow(Array.isArray(details.url) ? details.url[0] : details.url),
    removeWindow: (win) => hooks.removeWindow(win),
  });
  ElectronChromeExtensions.handleCRXProtocol(ses()); // Symbole der Erweiterungen in der Werkzeugleiste

  try {
    await installChromeWebStore({
      session: ses(),
      autoUpdate: true,
      // Vor jeder Installation nachfragen
      beforeInstall: async (details) => {
        const perms = (details.manifest.permissions || []).concat(details.manifest.host_permissions || []);
        const { response } = await dialog.showMessageBox(getWin(), {
          type: 'question',
          title: 'TZBrowser – Erweiterung hinzufügen',
          message: `„${details.localizedName}“ hinzufügen?`,
          detail: perms.length
            ? `Diese Erweiterung möchte Zugriff auf:\n• ${perms.slice(0, 12).join('\n• ')}${perms.length > 12 ? '\n• …' : ''}`
            : 'Diese Erweiterung benötigt keine besonderen Berechtigungen.',
          icon: details.icon,
          buttons: ['Hinzufügen', 'Abbrechen'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        return { action: response === 0 ? 'allow' : 'deny' };
      },
    });
    console.log(`[ext] Chrome Web Store bereit, ${list().length} Erweiterung(en) geladen`);
  } catch (err) {
    console.warn('[ext] Web Store konnte nicht eingerichtet werden:', err.message);
  }
}

function list() {
  const s = ses();
  const all = s.extensions ? s.extensions.getAllExtensions() : s.getAllExtensions();
  return all.map((e) => ({ id: e.id, name: e.name, version: e.version }));
}

async function remove(id) {
  try {
    await uninstallExtension(id, { session: ses() });
  } catch {
    const s = ses();
    (s.extensions || s).removeExtension(id);
  }
}

// Tabs bekanntmachen (nur Standardsitzung)
function addTab(wc, win) {
  if (ext && wc.session === ses()) ext.addTab(wc, win);
}

function selectTab(wc) {
  if (ext && wc.session === ses()) ext.selectTab(wc);
}

function contextItems(wc, params) {
  if (!ext || wc.session !== ses()) return [];
  try { return ext.getContextMenuItems(wc, params); } catch { return []; }
}

// Menüeinträge für ☰ → Erweiterungen
function menuTemplate({ openStore }) {
  const items = list();
  return [
    { label: 'Chrome Web Store öffnen', click: () => openStore(STORE_URL) },
    { label: 'Erweiterungen jetzt aktualisieren', click: () => updateExtensions(ses()).catch(() => {}) },
    { label: 'Erweiterungsordner öffnen', click: () => shell.openPath(path.join(app.getPath('userData'), 'Extensions')) },
    { type: 'separator' },
    ...(items.length ? [{ label: 'Installiert', enabled: false }] : [{ label: 'Noch keine Erweiterungen installiert', enabled: false }]),
    ...items.map((e) => ({
      label: `${e.name}  (${e.version})`,
      submenu: [
        {
          label: 'Entfernen',
          click: async () => {
            const { response } = await dialog.showMessageBox(getWin(), {
              type: 'question', title: 'TZBrowser – Erweiterung entfernen', message: `„${e.name}“ entfernen?`,
              buttons: ['Entfernen', 'Abbrechen'], defaultId: 1, cancelId: 1, noLink: true,
            });
            if (response === 0) await remove(e.id);
          },
        },
      ],
    })),
  ];
}

module.exports = { setup, addTab, selectTab, contextItems, menuTemplate, list, STORE_URL };
