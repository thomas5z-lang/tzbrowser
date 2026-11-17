'use strict';
// Brücke nur für die KI-Seite src/ui/ai.html (der Hauptprozess prüft das zusätzlich)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ai', {
  config: () => ipcRenderer.invoke('ai:config'),
  setConfig: (c) => ipcRenderer.invoke('ai:set-config', c),
  models: () => ipcRenderer.invoke('ai:models'),
  page: () => ipcRenderer.invoke('ai:page'),
  chat: (req) => ipcRenderer.send('ai:chat', req),
  stop: (id) => ipcRenderer.send('ai:stop', id),
  on: (channel, cb) => ipcRenderer.on(channel, (_e, data) => cb(data)),
  onThinking: (cb) => ipcRenderer.on('ai:thinking', (_e, data) => cb(data)),
});
