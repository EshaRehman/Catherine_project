const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  screen,
  Menu,
  powerSaveBlocker,
} = require('electron');
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
//   KIOSK MODE
//   The booth runs unattended on a portrait screen for a whole
//   event, so the default is borderless fullscreen with no Windows
//   chrome of any kind: no title bar, no menu bar, no taskbar.
//
//   Pass --windowed (or set CATHERINE_WINDOWED=1) to get the old
//   685x1214 resizable window back for development.
// ================================================================
const WINDOWED = process.argv.includes('--windowed') || process.env.CATHERINE_WINDOWED === '1';
const KIOSK = !WINDOWED;

/* How long Escape has to be held to quit outright. Long enough that the short
   press (minimise) and the hold (quit) cannot be confused for one another. */
const ESC_HOLD_QUIT_MS = 5000;

/* One booth, one process. A watchdog relaunch that races the dying instance —
   or an operator double-clicking the shortcut — would otherwise put a second
   copy on screen fighting for the camera and for ports 8000/8188. The second
   copy exits immediately and hands focus back to the one already running. */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/* Chromium throttles timers and rAF in backgrounded windows. Kiosk windows do
   get backgrounded (a Windows notification stealing focus is enough), and a
   throttled idle screen means the hero video stutters and the corner long-press
   timer drifts. */
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// The app never uses a menu; removing it also removes every accelerator that
// came with it (Ctrl+W close, Ctrl+R reload, Ctrl+Shift+I devtools, F11...).
Menu.setApplicationMenu(null);

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

/* Set once the app is genuinely on its way out, so the supervisor below stops
   treating a backend exit as a crash worth restarting. */
let shuttingDown = false;

/* child.kill() on Windows terminates only the process we spawned. Both backends
   are Python launchers that go on to spawn their own children (uvicorn's reload
   worker, ComfyUI's model loaders), and those survive — holding ports 8000 and
   8188 open. The next launch then finds the ports taken and the booth comes up
   with no backend at all, which is exactly the failure an auto-relaunch is
   supposed to prevent. taskkill /T kills the whole tree. */
function killTree(child, label) {
  if (!child || child.killed || child.exitCode !== null) return;
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, detached: false });
    } catch (err) {
      console.error(`[${label}] taskkill failed:`, err?.message);
      try { child.kill(); } catch { /* already gone */ }
    }
  } else {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

/**
 * Spawn a backend and keep it alive for the length of the event.
 *
 * An 8-hour run has to survive a backend falling over — an out-of-memory
 * ComfyUI, a Python traceback that kills uvicorn — without an operator noticing
 * and restarting anything. Restarts back off from 2s to 30s so a backend that
 * cannot start (missing model, occupied port) does not spin the CPU retrying
 * hundreds of times a minute.
 */
function superviseBackend({ label, command, args, cwd }) {
  const state = { child: null, attempts: 0, timer: null };

  const launch = () => {
    state.timer = null;
    if (shuttingDown) return;

    console.log(`[${label}] Starting from: ${cwd}`);
    let child;
    try {
      child = spawn(command, args, { cwd, windowsHide: true, detached: false });
    } catch (err) {
      console.error(`[${label}] spawn failed:`, err?.message);
      scheduleRestart();
      return;
    }
    state.child = child;

    child.stdout.on('data', (d) => console.log(`[${label}]`, d.toString().trim()));
    child.stderr.on('data', (d) => console.log(`[${label}]`, d.toString().trim()));
    child.on('error', (err) => console.error(`[${label}] process error:`, err?.message));

    /* A backend that stayed up long enough to serve traffic has proven itself;
       reset the backoff so a single late crash restarts promptly rather than
       inheriting a 30s delay earned hours earlier. */
    const startedAt = Date.now();
    child.on('exit', (code, signal) => {
      state.child = null;
      console.log(`[${label}] exited code=${code} signal=${signal}`);
      if (shuttingDown) return;
      if (Date.now() - startedAt > 60_000) state.attempts = 0;
      scheduleRestart();
    });
  };

  const scheduleRestart = () => {
    if (shuttingDown || state.timer) return;
    state.attempts += 1;
    const delay = Math.min(30_000, 2_000 * 2 ** Math.min(state.attempts - 1, 4));
    console.warn(`[${label}] restarting in ${delay}ms (attempt ${state.attempts})`);
    state.timer = setTimeout(launch, delay);
  };

  launch();

  return {
    stop() {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      killTree(state.child, label);
      state.child = null;
    },
  };
}

let backendSupervisors = [];

/* Probe a port and decide what, if anything, is on it.
      'free'    — nothing listening, ours to start.
      'ours'    — our backend is already up (an operator running it in a
                  terminal is normal); leave it alone.
      'foreign' — something else has the port. Our backend cannot bind while
                  that is true, so say so plainly rather than letting the
                  operator wonder why generation fails.

   Identity matters here, not just whether the port answers: a stray service on
   8000 looks exactly like a healthy backend to a bare TCP connect, and
   skipping the launch on that basis leaves the booth with no backend at all
   and nothing in the log to explain it. */
function probeBackendPort(port, healthPath, marker, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (verdict) => {
      if (settled) return;
      settled = true;
      resolve(verdict);
    };

    const req = http.get(
      { host: '127.0.0.1', port, path: healthPath, timeout: timeoutMs },
      (res) => {
        /* A liveness endpoint is a poor fingerprint — a two-line stub server
           can return the same {"status":"ok"} our /health does, and trusting it
           would make the booth skip launching its real backend and then fail
           every generation with nothing in the log. So the probe asks for
           something only the real service can produce: the API's own route
           table, or ComfyUI's device list. */
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (settled) return;
          body += chunk;
          // Stop as soon as the answer is known; these documents run to tens
          // of kilobytes and there is no reason to buffer all of it.
          if (body.includes(marker)) {
            res.destroy();
            finish('ours');
          } else if (body.length > 512 * 1024) {
            res.destroy();
            finish('foreign');
          }
        });
        res.on('end', () => finish(body.includes(marker) ? 'ours' : 'foreign'));
        res.on('error', () => finish('foreign'));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      finish('foreign');
    });
    req.on('error', (err) => {
      // ECONNREFUSED is the good case: nobody is home, so we start it.
      finish(err?.code === 'ECONNREFUSED' ? 'free' : 'foreign');
    });
  });
}

async function startBackends() {
  stopBackends();
  shuttingDown = false;
  backendSupervisors = [];

  const services = [
    {
      label: 'FastAPI',
      port: 8000,
      // /openapi.json lists every route this API serves; "/generate" appears
      // in no other service on this machine.
      healthPath: '/openapi.json',
      marker: '"/generate"',
      command: `${APP_DIR}\\venv\\Scripts\\python.exe`,
      args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
      cwd: FASTAPI_DIR,
      missing: 'Python not found at the shared venv.',
    },
    {
      label: 'ComfyUI',
      port: 8188,
      healthPath: '/system_stats',
      marker: '"devices"',
      command: resolveComfyPython(),
      args: ['main.py', '--listen', '127.0.0.1', '--port', '8188'],
      cwd: COMFYUI_DIR,
      missing: 'Python not found. Run the setup script to create the venv.',
    },
  ];

  for (const service of services) {
    if (!fs.existsSync(service.command)) {
      console.error(`[${service.label}] ${service.missing}`, service.command);
      continue;
    }

    const occupant = await probeBackendPort(
      service.port,
      service.healthPath,
      service.marker,
    );

    if (occupant === 'ours') {
      console.log(
        `[${service.label}] Already running on port ${service.port} — leaving it alone.`,
      );
      continue;
    }

    if (occupant === 'foreign') {
      /* Supervised anyway rather than skipped: the launch will fail on
         "address already in use", which lands in the log next to this line and
         names the real problem, and if the squatter ever goes away the retry
         picks the port up without anyone restarting the booth. */
      console.error(
        `[${service.label}] Port ${service.port} is held by something that is not the ` +
          `photo booth backend. ${service.label} cannot start until that process is ` +
          `closed. Find it with:  netstat -ano | findstr :${service.port}`,
      );
    }

    if (shuttingDown) return;
    backendSupervisors.push(superviseBackend(service));
  }
}

function stopBackends() {
  shuttingDown = true;
  for (const supervisor of backendSupervisors) {
    try { supervisor.stop(); } catch { /* best effort on the way out */ }
  }
  backendSupervisors = [];
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

ipcMain.handle('api-preview-image', async (_event, { imageBase64, prompt, seed, mode }) => {
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

    const modePart = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="mode"${CRLF}${CRLF}` +
      `${mode || 'local'}${CRLF}`,
      'utf8'
    );

    const closingBoundary = Buffer.from(`--${boundary}--${CRLF}`, 'utf8');
    const bodyBuffer = Buffer.concat([imagePartHeader, imageBuffer, imagePartFooter, promptPart, seedPart, modePart, closingBoundary]);

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

/* ---- Window shape ----
   ONE window shape for the whole app: the 685x1214 portrait kiosk ratio.
   Admin does NOT get its own landscape window — the admin panel is expected to
   lay itself out inside the same portrait viewport the operator already sees in
   user mode (see the admin responsive rules at the end of index.css). */

const KIOSK_SHAPE = { width: 685, height: 1214 };
const KIOSK_RATIO = KIOSK_SHAPE.width / KIOSK_SHAPE.height;

/* 1214px of content height does not fit on a 1080p screen (work area ~1032px).
   Asking for it anyway gets the height clamped but NOT the width, which leaves
   the window off-ratio — the exact state setAspectRatio exists to prevent. So
   scale the whole box down until it fits, keeping the ratio exact. */
const fitKioskShape = (win) => {
  const { workAreaSize } = screen.getDisplayMatching(win.getBounds());
  // Leave room for the window frame + title bar; getContentSize is inner size.
  const [outerW, outerH] = win.getSize();
  const [innerW, innerH] = win.getContentSize();
  const chromeW = Math.max(0, outerW - innerW);
  const chromeH = Math.max(0, outerH - innerH);

  const maxW = workAreaSize.width - chromeW;
  const maxH = workAreaSize.height - chromeH;

  const scale = Math.min(1, maxW / KIOSK_SHAPE.width, maxH / KIOSK_SHAPE.height);
  return {
    width: Math.max(1, Math.round(KIOSK_SHAPE.width * scale)),
    height: Math.max(1, Math.round(KIOSK_SHAPE.height * scale)),
  };
};

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
  aspect-ratio:1080/1350;
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
  // The kiosk window sits at the 'screen-saver' always-on-top level, so a
  // plain window opens *behind* it and looks like the gallery never launched.
  // Matching the level puts this one on top, being the newer window.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

/* ---- Launch at logon ----
   Registers the packaged .exe under the per-user Run key so the booth comes
   back on its own after a Windows restart. Per-user rather than machine-wide
   deliberately: it needs no admin rights and no installer step, so a venue
   machine that gets rebuilt only has to run the app once.

   Skipped when running under `electron-forge start`, where execPath is the
   electron.exe dev binary and registering it would launch a bare Electron
   window at logon. The watchdog scheduled task (scripts/install-kiosk-autostart
   .ps1) is the belt-and-braces version of this and also covers crash relaunch. */
function configureAutoLaunch() {
  if (process.platform !== 'win32') return;
  if (!app.isPackaged) {
    console.log('[AutoLaunch] skipped — not a packaged build');
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: [],
    });
    console.log('[AutoLaunch] registered:', process.execPath);
  } catch (err) {
    console.error('[AutoLaunch] could not register:', err?.message);
  }
}

/* ---- Display / screensaver suppression ----
   The booth sits idle between guests for long stretches. Windows must not blank
   the screen, dim it, start a screensaver or sleep the machine during those —
   the idle hero video IS the attract loop, and it has to stay visible.

   'prevent-display-sleep' implies 'prevent-app-suspension', so this one blocker
   covers both the display and the system. It is re-armed on resume because a
   blocker started before a sleep/hibernate does not always survive it. */
let powerBlockerId = null;

function armPowerBlocker() {
  try {
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) return;
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    console.log('[Power] display-sleep blocker armed id=%d', powerBlockerId);
  } catch (err) {
    console.error('[Power] could not start power save blocker:', err?.message);
  }
}

function releasePowerBlocker() {
  try {
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
    }
  } catch { /* shutting down anyway */ }
  powerBlockerId = null;
}

/* ---- Deliberate-quit flag ----
   The watchdog scheduled task relaunches the booth whenever the process
   disappears — which is the whole point, except when the operator just chose
   "Quit booth" from the Escape prompt. Without a way to tell those apart the
   booth would come straight back a few seconds later and could never be
   closed. The app drops this file on an intentional exit and clears it on every
   start; the watchdog reads it and stands down. Path is shared by contract with
   scripts/kiosk-watchdog.ps1 — change both together. */
const STOP_FLAG_PATH = path.join(
  process.env.LOCALAPPDATA || app.getPath('userData'),
  'CatherineKiosk',
  'stop.flag',
);

function writeStopFlag(reason) {
  try {
    fs.mkdirSync(path.dirname(STOP_FLAG_PATH), { recursive: true });
    fs.writeFileSync(STOP_FLAG_PATH, `${new Date().toISOString()} ${reason}\n`, 'utf8');
  } catch (err) {
    console.error('[Kiosk] could not write stop flag:', err?.message);
  }
}

function clearStopFlag() {
  try {
    fs.rmSync(STOP_FLAG_PATH, { force: true });
  } catch { /* nothing there is the normal case */ }
}

/* ---- Intentional quit ----
   Closing is no longer refused: the watchdog relaunches the booth within about
   ten seconds whatever route it took (scripts/kiosk-watchdog.ps1), so a close
   is a restart rather than a dark booth. Every close still goes through
   quitBooth, so FastAPI and ComfyUI go with it instead of being orphaned on
   ports 8000 and 8188. */
let allowQuit = WINDOWED;

/* Whether the window is CURRENTLY borderless-fullscreen, as opposed to whether
   it launched that way (KIOSK). Escape toggles this without closing anything. */
let kioskActive = KIOSK;

function quitBooth(reason) {
  console.log('[Kiosk] quit requested:', reason);
  allowQuit = true;
  shuttingDown = true;
  writeStopFlag(reason);
  releasePowerBlocker();
  stopBackends();
  app.quit();
}

let mainWindow = null;

/* ---- Esc once: hand the machine back to Windows ----
   Drops the borderless-fullscreen state, which brings back the title bar (with
   its minimise and close buttons) and lets the taskbar through. The booth is
   NOT closed: the backends stay up and a guest session in flight survives, so
   there is nothing for the watchdog to relaunch and no fight over the desktop.

   Reversible — see enterKiosk below. Note the window lands at Electron's
   default 800x600 rather than filling the screen, because a window created
   fullscreen has no earlier size to restore to. That looks broken but is not:
   fullscreen comes back correctly. */
function leaveKiosk() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  kioskActive = false;
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setKiosk(false);
  mainWindow.setFullScreen(false);
  mainWindow.setResizable(true);
  mainWindow.setMovable(true);
  console.log('[Kiosk] left kiosk mode — title bar and taskbar are back');
}

/* ---- Back into kiosk: the maximize button, or F11 ----
   Measured on Windows 11 (1920x1080): after leaveKiosk(), setFullScreen(true)
   puts the PAGE back to a true 1920x1080 with the frame gone and the taskbar
   covered. An earlier version of this file claimed that re-entry left the page
   rendering at the old small size; that does not reproduce.

   Fullscreen is set BEFORE resizable is locked off again: a non-resizable
   window is the one shape Windows will refuse to grow, and locking first is the
   most likely explanation for the earlier reading.

   Why hook 'maximize' at all: maximize and fullscreen are different states, and
   maximize by definition leaves the taskbar showing — measured at 1920x1009,
   the missing 71px being the taskbar. On a booth nobody wants that window, so
   the maximize button is treated as "go back to kiosk". */
function enterKiosk() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  mainWindow.setFullScreen(true);
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setResizable(false);
  mainWindow.setMovable(false);
  kioskActive = true;
  console.log('[Kiosk] back in kiosk mode — title bar and taskbar hidden');
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    /* Kiosk: fullscreen on the primary display, above the taskbar.
       Windowed (dev): the original 685x1214 portrait box.

       The frame is deliberately KEPT rather than set to false. A fullscreen
       window hides it anyway - measured: getBounds() and getContentBounds()
       are identical in kiosk mode, so nothing is drawn - and a frame cannot be
       added to a window at runtime. Without one, Escape could only minimise a
       borderless window: no title bar and no close button to come back to. */
    ...(KIOSK
      ? { fullscreen: true, kiosk: true, resizable: false, movable: false }
      : {
          width: 685,
          height: 1214,
          useContentSize: true,
          minWidth: 480,
          minHeight: Math.round((480 * 1214) / 685),
          titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        }),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0D0B1A',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      // Guests never need to scroll-zoom or pinch-zoom the booth, and a stray
      // touch gesture that zooms the UI to 150% strands the operator.
      zoomFactor: 1,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (KIOSK) {
    // 'screen-saver' is the level that actually clears the Windows taskbar and
    // toast notifications; plain alwaysOnTop still lets the taskbar surface on
    // hover at the screen edge.
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    // Locks resizing to the kiosk's 685x1214 portrait ratio — without this the
    // window can be dragged into an off-ratio shape, which shifts object-fit:
    // cover's crop axis on the idle video from side-cropping (by design) to
    // top/bottom-cropping, cutting into the mascot at the bottom of frame.
    //
    // 1214px of content height exceeds a 1080p work area, so the requested size
    // above gets its height clamped and its width left alone — landing
    // off-ratio before the user has touched anything. Shrink to the largest box
    // that both fits and holds the ratio, then lock.
    const fitted = fitKioskShape(mainWindow);
    mainWindow.setContentSize(fitted.width, fitted.height, false);
    mainWindow.setAspectRatio(KIOSK_RATIO);
    mainWindow.center();
  }

  /* ---- Keyboard lockdown ----
     A keyboard is attached for the operator, so every Chromium accelerator that
     can break the booth has to be swallowed: reload (which would drop a guest
     mid-flow), devtools, print, zoom, close. Escape is the one key that does
     something, and it does two different things depending on how long it is
     held: a press minimises, a five-second hold quits. */
  const escState = { holdTimer: null };

  const clearEscHold = () => {
    if (escState.holdTimer) {
      clearTimeout(escState.holdTimer);
      escState.holdTimer = null;
    }
  };

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' && input.type !== 'keyUp') return;

    /* F11 is the one key that still means something once out of kiosk: the
       universal "make this fullscreen". Handled here rather than left to
       Chromium because Chromium's own F11 only sets fullscreen — it would not
       restore always-on-top, so the taskbar would still surface on hover.
       Escape is deliberately NOT the way back: it is the way OUT, and the admin
       panel's dialogs all use it. */
    if (KIOSK && !kioskActive && input.type === 'keyDown'
        && (input.key || '').toLowerCase() === 'f11') {
      event.preventDefault();
      enterKiosk();
      return;
    }

    /* Windowed dev mode keeps every normal shortcut, devtools included — and so
       does a booth an operator has escaped out of kiosk mode, which is a
       maintenance window by definition. */
    if (!kioskActive) return;

    const key = (input.key || '').toLowerCase();
    const mod = input.control || input.meta;

    if (input.type === 'keyUp') {
      if (key === 'escape') clearEscHold();
      return;
    }

    if (key === 'escape') {
      // `isAutoRepeat` fires continuously while held; only the first press
      // starts the hold timer.
      if (input.isAutoRepeat) return;

      /* Deliberately NOT preventDefault'ed. Escape already closes the admin
         panel's own dialogs, and swallowing it here would break every one of
         them. A short press is the renderer's to interpret — dismiss the
         dialog on screen, or ask main to minimise when there is none — in
         KioskEscape.

         What main keeps is the escape hatch: a renderer that has hung can
         neither close a dialog nor send that message, and the operator would
         be left with a frozen full-screen window and no title bar. Holding
         Escape quits regardless of any of it. The renderer only acts on keyup,
         so a press long enough to land here never also minimised on the way
         through. */
      clearEscHold();
      escState.holdTimer = setTimeout(() => {
        escState.holdTimer = null;
        quitBooth('escape held 5s');
      }, ESC_HOLD_QUIT_MS);
      return;
    }

    const blockedWithMod = ['r', 'w', 'q', 'p', 'f', 'g', 'u', 'j', 'n', 't', '+', '-', '=', '0'];
    if (mod && blockedWithMod.includes(key)) {
      event.preventDefault();
      return;
    }
    if (mod && input.shift && ['i', 'c', 'j', 'r'].includes(key)) {
      event.preventDefault();
      return;
    }
    if (['f5', 'f11', 'f12'].includes(key)) {
      event.preventDefault();
      return;
    }
    if (input.alt && key === 'f4') {
      event.preventDefault();
    }
  });

  // Right-click has no purpose in the booth and the default menu offers Reload.
  mainWindow.webContents.on('context-menu', (event) => {
    if (KIOSK) event.preventDefault();
  });

  // Nothing in the booth should ever open a second window or navigate away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  /* ---- Close ----
     The X on the restored window, the taskbar's "close window", a stray
     Alt+F4: all allowed, because the watchdog puts the booth back within about
     ten seconds. Routed through quitBooth rather than let through raw, so the
     backends are killed as a tree instead of surviving to hold ports 8000 and
     8188 against the relaunch.

     To reach the desktop WITHOUT the booth restarting, press Escape once: that
     minimises it and leaves everything running. */
  /* The maximize button on the title bar an operator gets after Escape. Windows
     maximize leaves the taskbar showing (measured: 1920x1009 of a 1080 screen),
     which on a booth reads as the kiosk being broken. Treat it as "back to
     kiosk" instead — that is what anyone pressing it actually wants. */
  mainWindow.on('maximize', () => {
    if (KIOSK && !kioskActive) enterKiosk();
  });

  mainWindow.on('close', (event) => {
    if (allowQuit) return;
    event.preventDefault();
    quitBooth('window closed');
  });

  /* ---- Crash recovery ----
     A renderer crash used to leave a white window that only a human could fix.
     Reloading in place is enough: the booth reboots into the idle screen, which
     is where an interrupted guest session should land anyway. */
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Kiosk] renderer gone:', details?.reason, details?.exitCode);
    if (allowQuit || mainWindow.isDestroyed()) return;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    }, 1000);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[Kiosk] renderer unresponsive — reloading');
    if (allowQuit || mainWindow.isDestroyed()) return;
    mainWindow.reload();
  });

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || allowQuit) return;
    console.error('[Kiosk] load failed:', errorCode, errorDescription, '— retrying');
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
    }, 1500);
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (KIOSK) mainWindow.focus();
  });
};

/* An Escape the renderer had nothing else to spend on: hand the desktop over.
   Once out of kiosk the window is an ordinary one, and Escape goes back to
   meaning nothing in particular. */
ipcMain.on('kiosk:escape', () => {
  if (KIOSK && kioskActive) leaveKiosk();
});

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Starting at all means the booth is meant to be running; anything the last
    // shutdown left behind is stale.
    clearStopFlag();
    armPowerBlocker();
    startBackends();
    registerGmailIpc({ app, ipcMain, shell });
    createWindow();
    configureAutoLaunch();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

/* A resume from sleep/hibernate can leave the blocker inert; re-arm it. */
app.on('ready', () => {
  const { powerMonitor } = require('electron');
  powerMonitor.on('resume', armPowerBlocker);
  powerMonitor.on('unlock-screen', armPowerBlocker);
});

app.on('before-quit', releasePowerBlocker);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
