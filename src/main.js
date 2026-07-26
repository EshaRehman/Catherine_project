const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { spawn } = require('node:child_process');
const JSZip = require('jszip');
const { registerGmailIpc, trySendJobZipViaGmail } = require('./gmail-oauth-main');

if (require('electron-squirrel-startup')) {
  app.quit();
}

// ================================================================
//   BACKEND PROCESS MANAGEMENT
//   Starts FastAPI and ComfyUI when the app launches,
//   kills them when the app closes.
// ================================================================

// ---- Resolve APP-Electron directory ----
// Dev machine  : D:\APP-Electron  (checked first)
// Production   : C:\APP-Electron  (setup script installs here)
function resolveAppDir() {
  const candidates = ['D:\\APP-Electron', 'C:\\PhotoBoothApp\\APP-Electron', 'C:\\APP-Electron'];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      console.log('[Backend] Using APP-Electron at:', dir);
      return dir;
    }
  }
  console.error('[Backend] APP-Electron directory not found on D: or C:');
  return 'C:\\APP-Electron'; // last resort
}

const APP_DIR        = resolveAppDir();
const FASTAPI_DIR    = `${APP_DIR}\\Backend(Fast-API)`;
const COMFYUI_DIR    = `${APP_DIR}\\ComfyUI`;

// Python: ComfyUI gets its own venv (step 7b of setup script).
// Falls back to shared venv if own venv not yet created.
function resolveComfyPython() {
  const own      = `${APP_DIR}\\ComfyUI\\venv\\Scripts\\python.exe`;
  const fallback = `${APP_DIR}\\venv\\Scripts\\python.exe`;
  if (fs.existsSync(own)) return own;
  console.warn('[ComfyUI] ComfyUI\\venv not found — falling back to shared venv. Re-run setup script to create a dedicated ComfyUI venv.');
  return fallback;
}

let fastapiProcess = null;
let comfyuiProcess = null;

function startBackends() {
  // --- FastAPI (port 8000) ---
  const backendPython = `${APP_DIR}\\venv\\Scripts\\python.exe`;
  if (!fs.existsSync(backendPython)) {
    console.error('[FastAPI] Python not found at:', backendPython);
  } else {
    console.log('[Backend] Starting FastAPI from:', FASTAPI_DIR);
    fastapiProcess = spawn(
      backendPython,
      ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
      { cwd: FASTAPI_DIR, windowsHide: true, detached: false }
    );
    fastapiProcess.stdout.on('data', d => console.log('[FastAPI]', d.toString().trim()));
    fastapiProcess.stderr.on('data', d => console.log('[FastAPI]', d.toString().trim()));
    fastapiProcess.on('exit', code => console.log(`[FastAPI] exited with code ${code}`));
  }

  // --- ComfyUI (port 8188) ---
  const comfyPython = resolveComfyPython();
  if (!fs.existsSync(comfyPython)) {
    console.error('[ComfyUI] Python not found. Run the setup script to create the venv.');
  } else {
    console.log('[Backend] Starting ComfyUI from:', COMFYUI_DIR);
    comfyuiProcess = spawn(
      comfyPython,
      ['main.py', '--listen', '127.0.0.1', '--port', '8188'],
      { cwd: COMFYUI_DIR, windowsHide: true, detached: false }
    );
    comfyuiProcess.stdout.on('data', d => console.log('[ComfyUI]', d.toString().trim()));
    comfyuiProcess.stderr.on('data', d => console.log('[ComfyUI]', d.toString().trim()));
    comfyuiProcess.on('exit', code => console.log(`[ComfyUI] exited with code ${code}`));
  }
}

function stopBackends() {
  if (fastapiProcess) {
    try { fastapiProcess.kill('SIGTERM'); } catch {}
    fastapiProcess = null;
  }
  if (comfyuiProcess) {
    try { comfyuiProcess.kill('SIGTERM'); } catch {}
    comfyuiProcess = null;
  }
}

// Kill backends when Electron exits for any reason
app.on('before-quit', stopBackends);
app.on('will-quit',   stopBackends);
process.on('exit',    stopBackends);

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

ipcMain.handle('api-generate', async (_event, { url, imageBase64, templateId, eventId, seed }) => {
  return new Promise((resolve, reject) => {
    const mimeMatch = imageBase64.match(/^data:(image\/[\w+.-]+);base64,/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext  = mime === 'image/png' ? 'png' : 'jpg';

    const base64Data = imageBase64.replace(/^data:image\/[\w+.-]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const boundary = `----FormBoundary${Date.now().toString(16)}`;
    const CRLF = '\r\n';

    // Build multipart body parts
    const parts = [];

    // image field
    parts.push(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="image"; filename="capture.${ext}"${CRLF}` +
      `Content-Type: ${mime}${CRLF}${CRLF}`
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

    const eventIdPart = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="eventId"${CRLF}${CRLF}` +
      `${eventId}${CRLF}`,
      'utf8'
    );

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
      eventIdPart,
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

/* ---- Multipart POST for /preview-image ---- */

ipcMain.handle('api-preview-image', async (_event, { imageBase64, prompt, seed }) => {
  return new Promise((resolve, reject) => {
    const mimeMatch = imageBase64.match(/^data:(image\/[\w+.-]+);base64,/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext  = mime === 'image/png' ? 'png' : 'jpg';

    const base64Data = imageBase64.replace(/^data:image\/[\w+.-]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const boundary = `----FormBoundary${Date.now().toString(16)}`;
    const CRLF = '\r\n';

    const imagePartHeader = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="image"; filename="capture.${ext}"${CRLF}` +
      `Content-Type: ${mime}${CRLF}${CRLF}`,
      'utf8'
    );
    const imagePartFooter = Buffer.from(CRLF, 'utf8');

    const promptPart = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="prompt"${CRLF}${CRLF}` +
      `${prompt}${CRLF}`,
      'utf8'
    );

    let seedPart = Buffer.alloc(0);
    if (seed !== undefined && seed !== null && seed !== '') {
      seedPart = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="seed"${CRLF}${CRLF}` +
        `${Number(seed)}${CRLF}`,
        'utf8'
      );
    }

    const closingBoundary = Buffer.from(`--${boundary}--${CRLF}`, 'utf8');
    const bodyBuffer = Buffer.concat([imagePartHeader, imageBuffer, imagePartFooter, promptPart, seedPart, closingBoundary]);

    const options = {
      hostname: '127.0.0.1',
      port: 8000,
      path: '/preview-image',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
      },
    };

    const req = http.request(options, (res) => {
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

/* ---- Gallery window ---- */

ipcMain.handle('open-gallery', async (_event, { eventId, eventName = 'Gallery' } = {}) => {
  if (!eventId) return;

  const safeTitle = (eventName || 'Gallery')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeEventId = String(eventId).replace(/[^A-Za-z0-9_-]/g, '');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle} — Gallery</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#ede8df;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh}

.page{padding:48px 56px 72px}

/* ── Gradient title (matches "A LOOK" kiosk headline) ── */
.ev-title{
  display:inline-block;
  font-size:48px;font-weight:900;letter-spacing:-2px;line-height:1;
  background:linear-gradient(100deg,#f5a623 0%,#ff8a2a 18%,#f5a623 32%,#b89a36 60%,#4f9d56 92%,#1f8f6e 110%);
  -webkit-background-clip:text;background-clip:text;
  color:transparent;-webkit-text-fill-color:transparent;
  position:relative;margin-bottom:10px;
}
/* Sparkle cluster — positioned relative to title wrapper */
.title-wrap{position:relative;display:inline-block;margin-bottom:10px}
.sparkle-cluster{position:absolute;top:-10px;right:-48px;pointer-events:none}
.sp-star{position:absolute;animation:twinkle 2.6s ease-in-out infinite}
.sp-star svg{display:block}
.sp-a{top:0;left:0;animation-delay:0s}
.sp-b{top:16px;left:20px;animation-delay:.55s}
.sp-c{top:28px;left:8px;animation-delay:1.1s}
@keyframes twinkle{0%,100%{opacity:.25;transform:scale(.7) rotate(0deg)}50%{opacity:1;transform:scale(1) rotate(15deg)}}

.ev-sub{font-size:15px;color:#8a8278;margin-bottom:36px;font-weight:400}

/* ── Gallery label ── */
.gallery-lbl{
  display:inline-block;
  font-size:13px;font-weight:800;letter-spacing:.15em;
  text-transform:uppercase;color:#111;
  padding-bottom:7px;
  margin-bottom:22px;
  position:relative;
}
.gallery-lbl::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:2.5px;
  background:linear-gradient(to right,#E8671F 50%,#2D6A00 50%);
  border-radius:2px;
}

/* ── Grid: 4 columns ── */
#grid{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:20px;
}

/* ── Card with photo ── */
.card{
  border:1.5px solid rgba(232,103,31,.55);
  border-radius:20px;
  overflow:hidden;
  cursor:pointer;
  background:#e8e2da;
  aspect-ratio:1080/1320;
  transition:transform .2s,box-shadow .2s;
  box-shadow:
    0 0 0 3px rgba(245,166,35,.18),
    0 4px 18px rgba(232,103,31,.22),
    0 0 40px rgba(245,166,35,.10);
  position:relative;
}
.card:hover{
  transform:translateY(-4px);
  box-shadow:
    0 0 0 3px rgba(245,166,35,.32),
    0 10px 32px rgba(232,103,31,.32),
    0 0 60px rgba(245,166,35,.18);
}
.card img{
  width:100%;height:100%;
  object-fit:cover;display:block;
  opacity:0;transition:opacity .28s;
}
.card img.rdy{opacity:1}

/* ── Context menu ── */
.ctx{position:fixed;background:#fff;border:1px solid #e8e0d6;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.13);z-index:50;min-width:148px;padding:4px 0;display:none}
.ctx.show{display:block}
.ctx button{display:block;width:100%;padding:9px 16px;background:none;border:none;text-align:left;font-size:13px;color:#333;cursor:pointer}
.ctx button:hover{background:#fdf5ef}

/* ── Empty state ── */
#empty{padding:60px 0;color:#b0a498;font-size:15px;display:none}

/* ── New-image flash on card ── */
@keyframes cardFlash{0%{box-shadow:0 0 0 4px rgba(245,166,35,.9),0 0 40px rgba(245,166,35,.5)}100%{box-shadow:0 0 0 3px rgba(245,166,35,.18),0 4px 18px rgba(232,103,31,.22),0 0 40px rgba(245,166,35,.10)}}
.card--new{animation:cardFlash 1.4s ease-out forwards}

/* ── Lightbox ── */
#lb{position:fixed;inset:0;background:rgba(8,5,2,.94);z-index:100;display:flex;align-items:center;justify-content:center}
#lb.off{display:none}
#lb-img{max-width:calc(100vw - 140px);max-height:calc(100vh - 80px);object-fit:contain;border-radius:10px;box-shadow:0 24px 80px rgba(0,0,0,.7);opacity:0;transition:opacity .22s}
#lb-img.rdy{opacity:1}
.lb-nav{position:fixed;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);color:#fff;cursor:pointer;border-radius:10px;width:44px;height:72px;font-size:30px;display:flex;align-items:center;justify-content:center;transition:background .15s}
.lb-nav:hover{background:rgba(255,255,255,.18)}
#lb-prev{left:12px}
#lb-next{right:12px}
#lb-close{position:fixed;top:16px;right:18px;width:36px;height:36px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);color:#fff;cursor:pointer;border-radius:8px;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background .15s}
#lb-close:hover{background:rgba(255,255,255,.2)}
#lb-foot{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);font-size:12px;color:rgba(255,255,255,.35);pointer-events:none;white-space:nowrap}
#lb-spin{position:absolute;width:28px;height:28px;border:3px solid rgba(255,255,255,.12);border-top-color:rgba(255,255,255,.75);border-radius:50%;animation:spin .65s linear infinite;display:none}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="page">

  <!-- Title -->
  <div style="margin-bottom:8px">
    <div class="title-wrap">
      <div class="ev-title">${safeTitle}</div>
      <div class="sparkle-cluster">
        <div class="sp-star sp-a"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 0 L13.6 9.4 L24 12 L13.6 14.6 L12 24 L10.4 14.6 L0 12 L10.4 9.4 Z" fill="#f5a623"/></svg></div>
        <div class="sp-star sp-b"><svg width="12" height="12" viewBox="0 0 24 24"><path d="M12 0 L13.6 9.4 L24 12 L13.6 14.6 L12 24 L10.4 14.6 L0 12 L10.4 9.4 Z" fill="#b89a36"/></svg></div>
        <div class="sp-star sp-c"><svg width="9" height="9" viewBox="0 0 24 24"><path d="M12 0 L13.6 9.4 L24 12 L13.6 14.6 L12 24 L10.4 14.6 L0 12 L10.4 9.4 Z" fill="#4f9d56"/></svg></div>
      </div>
    </div>
  </div>
  <p class="ev-sub">Relive the moments that matter.</p>

  <!-- Gallery label -->
  <div class="gallery-lbl">Gallery</div>

  <!-- Grid -->
  <div id="grid"></div>
  <div id="empty">No photos found for this event.</div>
</div>

<!-- Right-click / long-press context menu -->
<div class="ctx" id="ctx">
  <button id="ctx-dl">Download photo</button>
</div>

<!-- Lightbox -->
<div id="lb" class="off">
  <div id="lb-spin"></div>
  <button id="lb-close" title="Close (Esc)">&#10005;</button>
  <button class="lb-nav" id="lb-prev">&#8249;</button>
  <img id="lb-img" alt="">
  <button class="lb-nav" id="lb-next">&#8250;</button>
  <div id="lb-foot"></div>
</div>

<script>
const BASE = 'http://127.0.0.1:8000';
const EVENT_ID = '${safeEventId}';

let IMAGES = [];   // sorted newest-first
let cur = 0, ctxIdx = -1;

const grid    = document.getElementById('grid');
const lb      = document.getElementById('lb');
const lbImg   = document.getElementById('lb-img');
const lbFoot  = document.getElementById('lb-foot');
const lbSpin  = document.getElementById('lb-spin');
const ctx     = document.getElementById('ctx');

/* ── Helpers ── */
function normalise(img) {
  return {
    filename : img.filename || 'photo.jpg',
    src      : img.url ? (img.url.startsWith('http') ? img.url : BASE + img.url) : '',
    size     : img.size || 0,
    createdAt: img.createdAt || '',
  };
}

function makeCard(img, i, flash) {
  const card = document.createElement('div');
  card.className = 'card' + (flash ? ' card--new' : '');
  const el = document.createElement('img');
  el.loading = 'lazy'; el.alt = img.filename; el.src = img.src;
  el.onload = () => el.classList.add('rdy');
  card.appendChild(el);
  card.addEventListener('click', () => openLB(i));
  card.addEventListener('contextmenu', e => { e.preventDefault(); openCtx(e, i); });
  return card;
}

function renderGrid() {
  grid.innerHTML = '';
  document.getElementById('empty').style.display = IMAGES.length ? 'none' : 'block';
  IMAGES.forEach((img, i) => grid.appendChild(makeCard(img, i, false)));
}

/* Prepend a single new card without rebuilding entire grid */
function prependCard(img) {
  document.getElementById('empty').style.display = 'none';
  // Re-index existing cards (+1 each)
  [...grid.children].forEach(card => {
    const old = parseInt(card.dataset.idx || 0);
    card.dataset.idx = old + 1;
    card.onclick = null;
    card.addEventListener('click', () => openLB(old + 1));
  });
  const card = makeCard(img, 0, true);
  card.dataset.idx = 0;
  grid.prepend(card);
}

/* ── SSE connection ── */
let es = null, retryTimer = null;

function connectSSE() {
  if (es) { es.close(); es = null; }
  clearTimeout(retryTimer);

  es = new EventSource(BASE + '/event-images/' + EVENT_ID + '/stream');

  es.addEventListener('snapshot', e => {
    const data = JSON.parse(e.data);
    IMAGES = (data.images || []).map(normalise)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    renderGrid();
  });

  es.addEventListener('image_added', e => {
    const data = JSON.parse(e.data);
    const img = normalise(data);
    IMAGES.unshift(img);          // newest first
    prependCard(img);
    // If lightbox open, shift index since we prepended
    if (!lb.classList.contains('off')) cur += 1;
  });

  es.onerror = () => {
    es.close(); es = null;
    retryTimer = setTimeout(connectSSE, 3000);
  };
}

connectSSE();
window.addEventListener('beforeunload', () => { if (es) es.close(); });

/* ── Context menu ── */
function openCtx(e, i) {
  ctxIdx = i; ctx.classList.add('show');
  ctx.style.left = Math.min(e.clientX, window.innerWidth - 160) + 'px';
  ctx.style.top  = Math.min(e.clientY, window.innerHeight - 80)  + 'px';
}
function closeCtx() { ctx.classList.remove('show'); ctxIdx = -1; }
document.addEventListener('click', () => closeCtx());
ctx.addEventListener('click', e => e.stopPropagation());
document.getElementById('ctx-dl').addEventListener('click', () => {
  if (ctxIdx >= 0) { downloadImg(IMAGES[ctxIdx]); closeCtx(); }
});

async function downloadImg(img) {
  try {
    const res  = await fetch(img.src);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = img.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    const a = document.createElement('a'); a.href = img.src; a.download = img.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

/* ── Lightbox ── */
function openLB(i) { cur = i; showImg(); lb.classList.remove('off'); }
function showImg() {
  lbImg.classList.remove('rdy'); lbSpin.style.display = 'block'; lbImg.src = '';
  const img = IMAGES[cur];
  lbImg.onload = () => { lbSpin.style.display = 'none'; lbImg.classList.add('rdy'); };
  lbImg.src = img.src;
  lbFoot.textContent = (cur + 1) + ' / ' + IMAGES.length + ' · ' + img.filename;
}
function closeLB() { lb.classList.add('off'); lbImg.src = ''; }
function prev() { cur = (cur - 1 + IMAGES.length) % IMAGES.length; showImg(); }
function next() { cur = (cur + 1) % IMAGES.length; showImg(); }

document.getElementById('lb-close').onclick = closeLB;
document.getElementById('lb-prev').onclick  = prev;
document.getElementById('lb-next').onclick  = next;
lb.addEventListener('click', e => { if (e.target === lb) closeLB(); });
document.addEventListener('keydown', e => {
  if (lb.classList.contains('off')) return;
  if (e.key === 'Escape')     closeLB();
  if (e.key === 'ArrowLeft')  prev();
  if (e.key === 'ArrowRight') next();
});
</script>
</body>
</html>`;

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#ede8df',
    title: `${eventName} — Gallery`,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // required: allows img src + fetch + downloads to http://127.0.0.1
    },
  });

  win.setMenu(null);
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 685,
    height: 1214,
    useContentSize: true,
    minWidth: 480,
    minHeight: Math.round((480 * 1214) / 685),
    show: false,
    backgroundColor: '#F5F2ED',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Locks resizing to the kiosk's 685x1214 portrait ratio — without this the
  // window can be dragged into an off-ratio shape, which shifts object-fit:
  // cover's crop axis on the idle video from side-cropping (by design) to
  // top/bottom-cropping, cutting into the mascot at the bottom of frame.
  mainWindow.setAspectRatio(685 / 1214);

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
};

app.whenReady().then(() => {
  startBackends();
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
