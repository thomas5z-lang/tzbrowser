'use strict';
// Brücke nur für die interne Seite src/ui/library.html (der Hauptprozess prüft das zusätzlich)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lib', {
  bookmarks: () => ipcRenderer.invoke('ghost:lib-bookmarks'),
  removeBookmark: (id) => ipcRenderer.invoke('ghost:lib-bookmark-remove', id),
  updateBookmark: (b) => ipcRenderer.invoke('ghost:lib-bookmark-update', b),
  importSources: () => ipcRenderer.invoke('ghost:lib-import-sources'),
  importFrom: (id) => ipcRenderer.invoke('ghost:lib-import', id),
  history: (q) => ipcRenderer.invoke('ghost:lib-history', q),
  removeHistory: (entry) => ipcRenderer.invoke('ghost:lib-history-remove', entry),
  clearHistory: (sinceMs) => ipcRenderer.invoke('ghost:lib-history-clear', sinceMs),
});
