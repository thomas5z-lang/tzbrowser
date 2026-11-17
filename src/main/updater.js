'use strict';
// Updates über die öffentlichen GitHub-Releases (electron-updater).
// Es wird nur geprüft, ob es eine neue Version gibt – installiert wird erst nach Rückfrage.

const { app, dialog } = require('electron');

let updater = null;
let win = null;
let manualCheck = false;

function setup(mainWindow) {
  win = mainWindow;
  if (!app.isPackaged) return; // in der Entwicklung keine Updates
  ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;

  updater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Jetzt herunterladen', 'Später'],
      defaultId: 0,
      cancelId: 1,
      title: 'TZBrowser – Update',
      message: `TZBrowser ${info.version} ist verfügbar (installiert: ${app.getVersion()}).`,
      detail: 'Das Update wird im Hintergrund geladen und beim nächsten Neustart installiert.',
    });
    if (response === 0) updater.downloadUpdate();
  });

  updater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox(win, { type: 'info', title: 'TZBrowser', message: `TZBrowser ${app.getVersion()} ist aktuell.` });
    manualCheck = false;
  });

  updater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Jetzt neu starten', 'Beim Beenden installieren'],
      defaultId: 0,
      cancelId: 1,
      title: 'TZBrowser – Update bereit',
      message: `TZBrowser ${info.version} ist heruntergeladen.`,
    });
    if (response === 0) updater.quitAndInstall();
  });

  updater.on('error', (err) => {
    console.warn('[update]', err.message);
    if (manualCheck) dialog.showMessageBox(win, { type: 'warning', title: 'TZBrowser – Update', message: 'Die Update-Prüfung hat nicht geklappt.', detail: err.message });
    manualCheck = false;
  });

  setTimeout(() => updater.checkForUpdates().catch(() => {}), 10_000);
  setInterval(() => updater.checkForUpdates().catch(() => {}), 6 * 3600 * 1000).unref();
}

function checkNow() {
  if (!app.isPackaged) {
    dialog.showMessageBox(win, { type: 'info', title: 'TZBrowser', message: 'Updates gibt es nur in der installierten Version.', detail: `Entwicklungsversion ${app.getVersion()}` });
    return;
  }
  manualCheck = true;
  updater.checkForUpdates().catch(() => {});
}

module.exports = { setup, checkNow };
