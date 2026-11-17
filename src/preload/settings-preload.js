'use strict';
// Brücke nur für die interne Seite src/ui/settings.html (der Hauptprozess prüft das zusätzlich)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghostSettings', {
  schema: () => ipcRenderer.invoke('ghost:set-schema'),
  save: (key, value) => ipcRenderer.invoke('ghost:set-save', { key, value }),
  action: (name, arg) => ipcRenderer.invoke('ghost:set-action', name, arg),
  design: {
    get: () => ipcRenderer.invoke('ghost:design-get'),
    set: (d) => ipcRenderer.invoke('ghost:design-set', d),
    pick: (what) => ipcRenderer.invoke('ghost:design-pick', what),
    clear: (what) => ipcRenderer.invoke('ghost:design-clear', what),
    site: (url) => ipcRenderer.invoke('ghost:design-site', url),
    reset: () => ipcRenderer.invoke('ghost:design-reset'),
    export: () => ipcRenderer.invoke('ghost:design-export'),
    import: () => ipcRenderer.invoke('ghost:design-import'),
  },
});
