'use strict';
// Brücke zwischen Oberfläche (src/ui) und Hauptprozess.
// Die Oberfläche bekommt nur diese Funktionen, keinen Node-Zugriff.

const { contextBridge, ipcRenderer } = require('electron');

// Erweiterungsknöpfe (<browser-action-list>) nur in der Hauptoberfläche
if (/\/src\/ui\/index\.html$/.test(decodeURIComponent(location.pathname))) {
  try {
    require('electron-chrome-extensions/browser-action').injectBrowserAction();
  } catch (err) {
    console.warn('Erweiterungsknöpfe nicht verfügbar:', err.message);
  }
}

contextBridge.exposeInMainWorld('ghost', {
  send: (channel, data) => ipcRenderer.send('ui:' + channel, data),
  invoke: (channel, data) => ipcRenderer.invoke('ui:' + channel, data),
  on: (channel, callback) => ipcRenderer.on('ev:' + channel, (_e, data) => callback(data)),
});
