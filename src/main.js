const { app, BrowserWindow, ipcMain } = require('electron');
const { registerJobExportsIpc, cleanupExpiredJobs } = require('./main/jobsStorage');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let printWindow = null;

ipcMain.handle('print-data-url', async (_event, dataUrl) => {
  return new Promise((resolve, reject) => {
    if (printWindow) {
      printWindow.destroy();
      printWindow = null;
    }
    printWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff;}
      img{max-width:100%;max-height:100%;object-fit:contain;}
    </style></head><body><img src="${dataUrl.replace(/"/g, '')}" onload="window.ready=true" /></body></html>`;
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        printWindow.webContents.print(
          { silent: false, printBackground: true },
          (success, failureReason) => {
            printWindow.destroy();
            printWindow = null;
            if (success) resolve(true);
            else reject(new Error(failureReason || 'print failed'));
          },
        );
      }, 250);
    });
  });
});

/* Register as soon as ipcMain exists — must not wait for app.ready (renderer can invoke IPC early). */
try {
  registerJobExportsIpc(ipcMain);
} catch (err) {
  console.error('[catherine] job-exports IPC registration failed', err);
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#F5F2ED',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  try {
    cleanupExpiredJobs();
  } catch (_) {
    /* ignore */
  }

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
