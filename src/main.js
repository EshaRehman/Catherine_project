const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const JSZip = require('jszip');
const { registerGmailIpc, trySendJobZipViaGmail } = require('./gmail-oauth-main');

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

/* ---- Generic HTTP proxy (avoids CORS in renderer) ---- */

function httpRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const bodyStr = body !== undefined ? JSON.stringify(body) : null;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

ipcMain.handle('api-request', async (_event, { method, url, payload }) => {
  return httpRequest(method, url, payload);
});

/* ---- Multipart POST for /generate (sends image as form-data) ---- */

ipcMain.handle('api-generate', async (_event, { url, imageBase64, templateId, seed }) => {
  return new Promise((resolve, reject) => {
    // Strip the data URL prefix to get raw base64
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const boundary = `----FormBoundary${Date.now().toString(16)}`;
    const CRLF = '\r\n';

    // Build multipart body parts
    const parts = [];

    // image field
    parts.push(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="image"; filename="capture.jpg"${CRLF}` +
      `Content-Type: image/jpeg${CRLF}${CRLF}`
    );

    // template_id field
    const templatePart = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="template_id"${CRLF}${CRLF}` +
      `${templateId}${CRLF}`,
      'utf8'
    );

    const closingBoundary = Buffer.from(`--${boundary}--${CRLF}`, 'utf8');

    const imagePartHeader = Buffer.from(parts[0], 'utf8');
    const imagePartFooter = Buffer.from(CRLF, 'utf8');

    let seedPart = Buffer.alloc(0);
    if (seed !== undefined && seed !== null) {
      seedPart = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="seed"${CRLF}${CRLF}` +
        `${seed}${CRLF}`,
        'utf8'
      );
    }

    const bodyBuffer = Buffer.concat([
      imagePartHeader,
      imageBuffer,
      imagePartFooter,
      templatePart,
      seedPart,
      closingBoundary,
    ]);

    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
      },
    };

    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
});

/* ---- Job photo storage (per-event folders under userData/jobs/<eventId>) ---- */

const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

function jobsRoot() {
  return path.join(app.getPath('userData'), 'jobs');
}

function jobDir(eventId) {
  if (typeof eventId !== 'string' || !SAFE_ID_RE.test(eventId)) {
    throw new Error('invalid eventId');
  }
  return path.join(jobsRoot(), eventId);
}

async function ensureJobDir(eventId) {
  const dir = jobDir(eventId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function dataUrlToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('expected data URL');
  const m = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/i.exec(dataUrl);
  if (!m) throw new Error('malformed data URL');
  const mime = (m[1] || 'application/octet-stream').toLowerCase();
  const payload = m[2] || '';
  const isBase64 = /;base64/i.test(dataUrl.slice(0, dataUrl.indexOf(',')));
  const buf = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'binary');
  return { buffer: buf, mime };
}

function extForMime(mime) {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function fileSafeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'job';
}

ipcMain.handle('job-save-photo', async (_event, payload = {}) => {
  const { eventId, dataUrl, capturedAt } = payload;
  if (!eventId) throw new Error('eventId required');
  if (!dataUrl) throw new Error('dataUrl required');
  const dir = await ensureJobDir(eventId);
  const { buffer, mime } = dataUrlToBuffer(dataUrl);
  const ts = Number.isFinite(capturedAt) ? capturedAt : Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `photo-${ts}-${rand}.${extForMime(mime)}`;
  const filePath = path.join(dir, filename);
  await fsp.writeFile(filePath, buffer);
  return { filename, size: buffer.length, capturedAt: ts };
});

ipcMain.handle('job-list-photos', async (_event, payload = {}) => {
  const { eventId } = payload;
  if (!eventId) return { count: 0, files: [] };
  let entries = [];
  try {
    const dir = jobDir(eventId);
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return { count: 0, files: [] };
  }
  const files = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const lower = ent.name.toLowerCase();
    if (!/\.(jpe?g|png|webp|gif)$/i.test(lower)) continue;
    try {
      const stat = await fsp.stat(path.join(jobDir(eventId), ent.name));
      files.push({ name: ent.name, size: stat.size, modified: stat.mtimeMs });
    } catch {
      /* skip unreadable */
    }
  }
  files.sort((a, b) => a.modified - b.modified);
  return { count: files.length, files };
});

ipcMain.handle('job-clear-photos', async (_event, payload = {}) => {
  const { eventId } = payload;
  if (!eventId) return { removed: 0 };
  let dir;
  try {
    dir = jobDir(eventId);
  } catch {
    return { removed: 0 };
  }
  let entries = [];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return { removed: 0 };
  }
  let removed = 0;
  await Promise.all(
    entries.map(async (name) => {
      try {
        await fsp.unlink(path.join(dir, name));
        removed += 1;
      } catch {
        /* ignore */
      }
    }),
  );
  return { removed };
});

async function buildJobZip(eventId) {
  const dir = jobDir(eventId);
  let entries = [];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return null;
  }
  const photos = entries.filter((n) => /\.(jpe?g|png|webp|gif)$/i.test(n));
  if (photos.length === 0) return null;
  const zip = new JSZip();
  for (const name of photos) {
    try {
      const buf = await fsp.readFile(path.join(dir, name));
      zip.file(name, buf);
    } catch {
      /* skip unreadable */
    }
  }
  return {
    count: photos.length,
    buffer: await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
  };
}

ipcMain.handle('job-download-zip', async (event, payload = {}) => {
  const { eventId, eventName } = payload;
  if (!eventId) throw new Error('eventId required');
  const built = await buildJobZip(eventId);
  if (!built) return { ok: false, reason: 'no-photos' };
  const win = BrowserWindow.fromWebContents(event.sender);
  const stamp = new Date().toISOString().slice(0, 10);
  const defaultName = `${fileSafeName(eventName || 'job')}-${stamp}.zip`;
  const result = await dialog.showSaveDialog(win || undefined, {
    title: 'Save job archive',
    defaultPath: defaultName,
    filters: [{ name: 'Zip archive', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, reason: 'cancelled' };
  await fsp.writeFile(result.filePath, built.buffer);
  return { ok: true, path: result.filePath, count: built.count };
});

ipcMain.handle('job-email-zip', async (event, payload = {}) => {
  const { eventId, eventName, recipient = '', message = '' } = payload;
  if (!eventId) throw new Error('eventId required');
  const built = await buildJobZip(eventId);
  if (!built) return { ok: false, reason: 'no-photos' };

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = fileSafeName(eventName || 'job');
  const defaultName = `${safeName}-${stamp}.zip`;
  const trimmedRecipient = String(recipient || '').trim();

  try {
    const gmailResult = await trySendJobZipViaGmail(app, {
      recipient: trimmedRecipient,
      eventName,
      message,
      zipBuffer: built.buffer,
      zipFileName: defaultName,
    });
    if (gmailResult?.ok && gmailResult.via === 'gmail') {
      return { ok: true, via: 'gmail', count: built.count };
    }
    if (gmailResult && gmailResult.ok === false && gmailResult.reason === 'attachment-too-large') {
      return gmailResult;
    }
  } catch (e) {
    return {
      ok: false,
      reason: 'gmail-send-failed',
      detail: String(e && e.message ? e.message : e),
    };
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win || undefined, {
    title: 'Save job archive (then attach to email)',
    defaultPath: defaultName,
    filters: [{ name: 'Zip archive', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, reason: 'cancelled' };
  await fsp.writeFile(result.filePath, built.buffer);

  const subject = `Your photos from ${eventName || 'our event'}`;
  const bodyLines = [
    message ? message : `Hi,\n\nYour photos from ${eventName || 'the event'} are attached as a zip file.`,
    '',
    `Attachment saved to: ${result.filePath}`,
    `Photos: ${built.count}`,
    '',
    'If your mail client did not auto-attach the file, please attach the zip from the path above before sending.',
  ];
  const params = new URLSearchParams({
    subject,
    body: bodyLines.join('\n'),
  });
  const to = encodeURIComponent(trimmedRecipient);
  const mailto = `mailto:${to}?${params.toString().replace(/\+/g, '%20')}`;

  try {
    await shell.openPath(result.filePath); // surface the saved zip in the OS
  } catch {
    /* non-fatal */
  }
  try {
    await shell.openExternal(mailto);
  } catch (e) {
    return { ok: true, path: result.filePath, count: built.count, mailtoOpened: false };
  }

  return { ok: true, path: result.filePath, count: built.count, mailtoOpened: true };
});

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

app.whenReady().then(() => {
  registerGmailIpc({ app, ipcMain, shell });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
