const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('catherine', {
  printDataUrl: (dataUrl) => ipcRenderer.invoke('print-data-url', dataUrl),
  jobExports: {
    saveCapture: (payload) => ipcRenderer.invoke('job-exports-save', payload),
    list: () => ipcRenderer.invoke('job-exports-list'),
    cleanup: () => ipcRenderer.invoke('job-exports-cleanup'),
    exportZipForEvent: (payload) => ipcRenderer.invoke('job-exports-zip-dialog', payload),
    emailZip: (payload) => ipcRenderer.invoke('job-exports-email-zip', payload),
  },
});
