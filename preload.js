'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ballApi', {
  onConfig: (cb) => ipcRenderer.on('config', (_event, config) => cb(config)),
  onState: (cb) => ipcRenderer.on('state', (_event, state) => cb(state))
});
