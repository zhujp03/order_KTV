const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:set', config),
  getPrinters: () => ipcRenderer.invoke('printer:list'),
  printReceipt: (payload) => ipcRenderer.invoke('printer:printReceipt', payload),
  getPrintWorkerId: () => ipcRenderer.invoke('printer:getWorkerId'),
  request: (request) => ipcRenderer.invoke('remote:request', request),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
