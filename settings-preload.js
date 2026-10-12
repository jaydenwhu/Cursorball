'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.send('settings:set', patch),
  chooseImage: () => ipcRenderer.send('settings:choose-image'),
  useBuiltIn: () => ipcRenderer.send('settings:use-builtin'),
  reset: () => ipcRenderer.send('settings:reset'),
  onChange: (cb) => ipcRenderer.on('settings:changed', (_event, settings) => cb(settings))
});
