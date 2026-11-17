'use strict';
// Brücke nur für die interne Seite src/ui/passwords.html.
// Der Hauptprozess prüft zusätzlich selbst, dass die Anfrage von dieser Seite kommt.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pwm', {
  info: () => ipcRenderer.invoke('ghost:pwm-info'),
  list: () => ipcRenderer.invoke('ghost:pwm-list'),
  reveal: (id) => ipcRenderer.invoke('ghost:pwm-reveal', id),
  update: (entry) => ipcRenderer.invoke('ghost:pwm-update', entry),
  remove: (id) => ipcRenderer.invoke('ghost:pwm-delete', id),
  never: () => ipcRenderer.invoke('ghost:pwm-never'),
  neverRemove: (origin) => ipcRenderer.invoke('ghost:pwm-never-remove', origin),
});
