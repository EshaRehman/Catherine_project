const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('catherine', {
  printDataUrl: (dataUrl) => ipcRenderer.invoke('print-data-url', dataUrl),
  api: {
    request: (method, url, payload) => ipcRenderer.invoke('api-request', { method, url, payload }),
    generate: (url, imageBase64, templateId, eventId, seed) => ipcRenderer.invoke('api-generate', { url, imageBase64, templateId, eventId, seed }),
    previewImage: (imageBase64, prompt, seed, mode) => ipcRenderer.invoke('api-preview-image', { imageBase64, prompt, seed, mode }),
  },
  gmail: {
    getStatus: () => ipcRenderer.invoke('gmail-auth-status'),
    connect: () => ipcRenderer.invoke('gmail-auth-connect'),
    disconnect: () => ipcRenderer.invoke('gmail-auth-disconnect'),
  },
  jobs: {
    savePhoto: (payload) => ipcRenderer.invoke('job-save-photo', payload),
    listPhotos: (payload) => ipcRenderer.invoke('job-list-photos', payload),
    clearPhotos: (payload) => ipcRenderer.invoke('job-clear-photos', payload),
    downloadZip: (payload) => ipcRenderer.invoke('job-download-zip', payload),
    emailZip: (payload) => ipcRenderer.invoke('job-email-zip', payload),
  },
  openGallery: (payload) => ipcRenderer.invoke('open-gallery', payload),
  kiosk: {
    /* Main fires this when Windows tries to close the kiosk window by a route
       other than the keyboard (Alt+F4, the taskbar's close). Escape itself is
       handled in the renderer so it can still dismiss the admin panel's own
       dialogs. Returns an unsubscribe so React effects can clean up instead of
       stacking a listener per remount. */
    onExitRequest: (handler) => {
      const listener = () => handler();
      ipcRenderer.on('kiosk:exit-request', listener);
      return () => ipcRenderer.removeListener('kiosk:exit-request', listener);
    },
    confirmExit: () => ipcRenderer.send('kiosk:exit-confirm'),
    cancelExit: () => ipcRenderer.send('kiosk:exit-cancel'),
  },
});
