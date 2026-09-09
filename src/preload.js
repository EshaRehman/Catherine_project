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
    /* An Escape that nothing on screen claimed. Main decides what it means —
       leave kiosk mode and minimise, or go back into kiosk from the restored
       window — because only main knows which state the window is in. Escape
       stays a normal key event in the renderer so the admin panel's own
       dialogs keep closing on it. */
    escape: () => ipcRenderer.send('kiosk:escape'),
  },
});
