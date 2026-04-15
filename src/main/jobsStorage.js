const fs = require('fs');
const path = require('path');
const { app, dialog, BrowserWindow } = require('electron');
const JSZip = require('jszip');
const nodemailer = require('nodemailer');

const MANIFEST_NAME = 'manifest.json';

function rootDir() {
  return path.join(app.getPath('userData'), 'job-exports');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readManifest() {
  const root = rootDir();
  const mpath = path.join(root, MANIFEST_NAME);
  if (!fs.existsSync(mpath)) {
    return { version: 1, retentionDays: 60, jobs: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(mpath, 'utf8'));
    if (!Array.isArray(data.jobs)) data.jobs = [];
    if (typeof data.retentionDays !== 'number' || data.retentionDays < 1) data.retentionDays = 60;
    return data;
  } catch {
    return { version: 1, retentionDays: 60, jobs: [] };
  }
}

function writeManifest(data) {
  const root = rootDir();
  ensureDir(root);
  fs.writeFileSync(path.join(root, MANIFEST_NAME), JSON.stringify(data, null, 2), 'utf8');
}

function sanitizeSegment(id) {
  return (
    String(id || 'unknown')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 120) || 'unknown'
  );
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new Error('Invalid data URL');
  return Buffer.from(m[2], 'base64');
}

function getMainWindow() {
  const wins = BrowserWindow.getAllWindows();
  return wins.find((w) => !w.isDestroyed()) || null;
}

function cleanupExpiredJobs() {
  const mf = readManifest();
  const now = Date.now();
  const root = rootDir();
  const keep = [];
  let removed = 0;
  for (const job of mf.jobs) {
    const exp = new Date(job.expiresAt).getTime();
    const expired = !job.expiresAt || Number.isNaN(exp) || exp < now;
    if (expired) {
      const abs = path.join(root, job.relPath);
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch (_) {
        /* ignore */
      }
      try {
        const dir = path.dirname(abs);
        if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch (_) {
        /* ignore */
      }
      removed += 1;
    } else {
      keep.push(job);
    }
  }
  mf.jobs = keep;
  writeManifest(mf);
  return { removed, remaining: keep.length };
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

const SMTP_FILE = 'smtp-config.json';

/**
 * SMTP is not shown in the UI. Configure once via either:
 * - Environment: CATHERINE_SMTP_HOST, CATHERINE_SMTP_PORT, CATHERINE_SMTP_SECURE (1/true),
 *   CATHERINE_SMTP_USER, CATHERINE_SMTP_PASS, CATHERINE_SMTP_FROM
 * - Or a file next to app data: userData/smtp-config.json
 *   { "host", "port", "secure", "user", "pass", "from" }
 * Env vars take precedence over the file when host+from are set.
 */
function getConfiguredSmtp() {
  const normalize = (host, port, secure, user, pass, from) => {
    const h = String(host || '').trim();
    const f = String(from || '').trim();
    if (!h || !f || !isValidEmail(f)) return null;
    return {
      host: h,
      port: Math.min(65535, Math.max(1, Number(port) || 587)),
      secure: !!secure,
      user: String(user || '').trim(),
      pass: String(pass || ''),
      from: f,
    };
  };

  const eh = process.env.CATHERINE_SMTP_HOST?.trim();
  const ef = process.env.CATHERINE_SMTP_FROM?.trim();
  if (eh && ef) {
    const s = normalize(
      eh,
      process.env.CATHERINE_SMTP_PORT,
      process.env.CATHERINE_SMTP_SECURE === '1' ||
        String(process.env.CATHERINE_SMTP_SECURE || '').toLowerCase() === 'true',
      process.env.CATHERINE_SMTP_USER,
      process.env.CATHERINE_SMTP_PASS,
      ef,
    );
    if (s) return s;
  }

  const cfgPath = path.join(app.getPath('userData'), SMTP_FILE);
  if (fs.existsSync(cfgPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return normalize(j.host, j.port, j.secure, j.user, j.pass, j.from);
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * Build in-memory ZIP of all non-expired export files for one event id.
 * @param {string} eventId
 * @returns {Promise<{ ok: true, buffer: Buffer, count: number, fileBase: string } | { ok: false, error: string }>}
 */
async function buildZipBufferForEvent(eventId) {
  const mf = readManifest();
  const ev = eventId || '__general__';
  const matches = mf.jobs.filter((j) => j.eventId === ev);
  if (!matches.length) {
    return { ok: false, error: 'No saved exports for this event yet.' };
  }
  const zip = new JSZip();
  const root = rootDir();
  for (const job of matches) {
    const abs = path.join(root, job.relPath);
    if (!fs.existsSync(abs)) continue;
    const entryName = path.basename(job.relPath);
    const uniqueName = `${job.id.slice(-10)}-${entryName}`;
    zip.file(uniqueName, fs.readFileSync(abs));
  }
  if (Object.keys(zip.files).length === 0) {
    return { ok: false, error: 'Export files are missing on disk.' };
  }
  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const fileBase = sanitizeSegment(ev);
  return { ok: true, buffer: buf, count: Object.keys(zip.files).length, fileBase };
}

/**
 * @param {import('electron').IpcMain} ipcMain
 */
function registerJobExportsIpc(ipcMain) {
  ipcMain.handle('job-exports-save', async (_evt, payload) => {
    const {
      eventId,
      eventName,
      dataUrl,
      templateName,
      retentionDays: retentionFromPayload,
    } = payload || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return { ok: false, error: 'Missing dataUrl' };
    }
    const mf = readManifest();
    const retentionDays =
      typeof retentionFromPayload === 'number' && retentionFromPayload > 0
        ? Math.min(Math.floor(retentionFromPayload), 3650)
        : mf.retentionDays;
    mf.retentionDays = retentionDays;

    const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const evSeg = sanitizeSegment(eventId || '__general__');
    const root = rootDir();
    const dir = path.join(root, evSeg);
    ensureDir(dir);
    const baseName = `portrait-${Date.now()}.png`;
    const relPath = path.join(evSeg, baseName).replace(/\\/g, '/');
    const absPath = path.join(root, evSeg, baseName);
    const buf = dataUrlToBuffer(dataUrl);
    fs.writeFileSync(absPath, buf);

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + retentionDays * 86400000).toISOString();
    mf.jobs.push({
      id: jobId,
      eventId: eventId || '__general__',
      eventName: typeof eventName === 'string' ? eventName : '',
      templateName: typeof templateName === 'string' ? templateName : '',
      relPath,
      createdAt,
      expiresAt,
    });
    writeManifest(mf);
    return { ok: true, jobId, relPath };
  });

  ipcMain.handle('job-exports-list', async () => {
    const mf = readManifest();
    return { ok: true, jobs: mf.jobs, retentionDays: mf.retentionDays };
  });

  ipcMain.handle('job-exports-cleanup', async () => {
    const r = cleanupExpiredJobs();
    return { ok: true, ...r };
  });

  ipcMain.handle('job-exports-zip-dialog', async (_evt, { eventId, defaultBaseName } = {}) => {
    const built = await buildZipBufferForEvent(eventId);
    if (!built.ok) return built;
    const win = getMainWindow();
    const base =
      typeof defaultBaseName === 'string' && defaultBaseName.trim()
        ? sanitizeSegment(defaultBaseName.trim())
        : built.fileBase;
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Save event exports',
      defaultPath: `${base}-exports.zip`,
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    });
    if (canceled || !filePath) {
      return { ok: false, canceled: true };
    }
    fs.writeFileSync(filePath, built.buffer);
    return { ok: true, path: filePath, count: built.count };
  });

  ipcMain.handle('job-exports-email-zip', async (_evt, payload) => {
    const { eventId, defaultBaseName, to } = payload || {};
    const toAddr = String(to || '').trim();
    if (!isValidEmail(toAddr)) {
      return { ok: false, error: 'Enter a valid recipient email address.' };
    }
    const s = getConfiguredSmtp();
    if (!s) {
      return {
        ok: false,
        error:
          'SMTP is not configured yet (smtp-config.json in app data, or CATHERINE_SMTP_* env vars).',
      };
    }

    const built = await buildZipBufferForEvent(eventId);
    if (!built.ok) return built;

    const base =
      typeof defaultBaseName === 'string' && defaultBaseName.trim()
        ? sanitizeSegment(defaultBaseName.trim())
        : built.fileBase;
    const zipName = `${base}-exports.zip`;

    try {
      const transportOpts = {
        host: s.host,
        port: s.port,
        secure: s.secure,
      };
      if (s.user || s.pass) {
        transportOpts.auth = { user: s.user, pass: s.pass };
      }
      const transporter = nodemailer.createTransport(transportOpts);
      const displayName = typeof defaultBaseName === 'string' && defaultBaseName.trim()
        ? defaultBaseName.trim()
        : 'Event';
      await transporter.sendMail({
        from: s.from,
        to: toAddr,
        subject: `Photo exports — ${displayName}`,
        text: `Attached: ${built.count} portrait file(s) exported from your live session.`,
        attachments: [
          {
            filename: zipName,
            content: built.buffer,
          },
        ],
      });
      return { ok: true, count: built.count };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      return { ok: false, error: msg };
    }
  });
}

module.exports = {
  registerJobExportsIpc,
  cleanupExpiredJobs,
  rootDir,
};
