const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('catherine', {
  printDataUrl: (dataUrl) => ipcRenderer.invoke('print-data-url', dataUrl),
});
