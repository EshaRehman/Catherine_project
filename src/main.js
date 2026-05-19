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

ipcMain.handle('api-generate', async (_event, { url, imageBase64, templateId, eventId, seed }) => {
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

  // Fetch image list server-side to avoid CORS in renderer
  let images = [];
  try {
    const res = await httpRequest('GET', `http://127.0.0.1:8000/event-images/${eventId}`);
    if (res.status === 200 && res.body && Array.isArray(res.body.images)) {
      images = res.body.images;
    }
  } catch { /* open empty gallery */ }

  const BASE = 'http://127.0.0.1:8000';
  const resolved = images.map(img => ({
    filename: img.filename || 'photo.jpg',
    src: img.url ? (img.url.startsWith('http') ? img.url : BASE + img.url) : '',
    size: img.size || 0,
    createdAt: img.createdAt || '',
  }));

  const safeTitle = (eventName || 'Gallery')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const imagesJson = JSON.stringify(resolved);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle} — Gallery</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#f7f7f5;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh}
/* ── Top bar ── */
.topbar{background:#fff;border-bottom:1px solid #e8e8e5;padding:0 28px;height:52px;display:flex;align-items:center;position:sticky;top:0;z-index:20}
.breadcrumb{display:flex;align-items:center;gap:6px;font-size:13px;color:#888}
.breadcrumb span{color:#1a1a1a;font-weight:500}
.breadcrumb .sep{color:#ccc}
/* ── Page body ── */
.page{max-width:1200px;margin:0 auto;padding:32px 28px 60px}
.page-title{font-size:26px;font-weight:700;letter-spacing:-.3px;color:#111;margin-bottom:28px}
/* ── Section header ── */
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.section-label{font-size:13px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em}
.sort-wrap{display:flex;align-items:center;gap:6px}
.sort-label{font-size:13px;color:#888}
select{font-size:13px;color:#333;border:1px solid #ddd;border-radius:6px;padding:5px 28px 5px 10px;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E") no-repeat right 10px center;appearance:none;cursor:pointer;outline:none}
select:hover{border-color:#bbb}
/* ── Grid ── */
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.07),0 0 0 1px rgba(0,0,0,.04);cursor:pointer;transition:box-shadow .18s,transform .18s}
.card:hover{box-shadow:0 4px 16px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.06);transform:translateY(-2px)}
.card-thumb{width:100%;aspect-ratio:1;overflow:hidden;background:#f0eeeb;display:block;position:relative}
.card-thumb img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .25s}
.card-thumb img.rdy{opacity:1}
.card-foot{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.card-name{font-size:12px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.card-menu{width:24px;height:24px;border:none;background:none;cursor:pointer;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#aaa;flex-shrink:0;transition:background .15s,color .15s}
.card-menu:hover{background:#f0eeeb;color:#555}
/* context menu */
.ctx{position:fixed;background:#fff;border:1px solid #e0e0dc;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.13);z-index:50;min-width:148px;padding:4px 0;display:none}
.ctx.show{display:block}
.ctx button{display:block;width:100%;padding:8px 14px;background:none;border:none;text-align:left;font-size:13px;color:#333;cursor:pointer}
.ctx button:hover{background:#f5f4f1}
/* ── Empty ── */
#empty{text-align:center;padding:100px 24px;color:#aaa;font-size:15px;display:none}
/* ── Lightbox ── */
#lb{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:100;display:flex;align-items:center;justify-content:center}
#lb.off{display:none}
#lb-img{max-width:calc(100vw - 140px);max-height:calc(100vh - 80px);object-fit:contain;border-radius:6px;box-shadow:0 24px 80px rgba(0,0,0,.6);opacity:0;transition:opacity .2s}
#lb-img.rdy{opacity:1}
.lb-nav{position:fixed;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;cursor:pointer;border-radius:10px;width:44px;height:72px;font-size:28px;display:flex;align-items:center;justify-content:center;transition:background .15s}
.lb-nav:hover{background:rgba(255,255,255,.2)}
#lb-prev{left:12px}
#lb-next{right:12px}
#lb-close{position:fixed;top:16px;right:18px;width:36px;height:36px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;cursor:pointer;border-radius:8px;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background .15s}
#lb-close:hover{background:rgba(255,255,255,.2)}
#lb-foot{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);font-size:12px;color:rgba(255,255,255,.4);pointer-events:none;white-space:nowrap}
#lb-spin{position:absolute;width:28px;height:28px;border:3px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.7);border-radius:50%;animation:spin .65s linear infinite;display:none}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="topbar">
  <nav class="breadcrumb">
    <span>Events</span>
    <span class="sep">›</span>
    <span>${safeTitle}</span>
    <span class="sep">›</span>
    <span>Gallery</span>
  </nav>
</div>

<div class="page">
  <h1 class="page-title">${safeTitle}</h1>

  <div class="section-head">
    <span class="section-label">Gallery</span>
    <div class="sort-wrap">
      <span class="sort-label">Sort:</span>
      <select id="sort-sel">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="name">Name A–Z</option>
      </select>
    </div>
  </div>

  <div id="grid"></div>
  <div id="empty">No photos found for this event.</div>
</div>

<!-- Context menu -->
<div class="ctx" id="ctx">
  <button id="ctx-dl">Download photo</button>
</div>

<!-- Lightbox -->
<div id="lb" class="off">
  <div id="lb-spin"></div>
  <button id="lb-close" title="Close (Esc)">&#10005;</button>
  <button class="lb-nav" id="lb-prev" title="Previous (←)">&#8249;</button>
  <img id="lb-img" alt="">
  <button class="lb-nav" id="lb-next" title="Next (→)">&#8250;</button>
  <div id="lb-foot"></div>
</div>

<script>
const RAW=${imagesJson};
let IMAGES=[...RAW];
let cur=0;
let ctxIdx=-1;

const grid=document.getElementById('grid');
const lb=document.getElementById('lb');
const lbImg=document.getElementById('lb-img');
const lbFoot=document.getElementById('lb-foot');
const lbSpin=document.getElementById('lb-spin');
const ctx=document.getElementById('ctx');

function sortImages(order){
  if(order==='newest') IMAGES=[...RAW].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  else if(order==='oldest') IMAGES=[...RAW].sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
  else IMAGES=[...RAW].sort((a,b)=>a.filename.localeCompare(b.filename));
  renderGrid();
}

function renderGrid(){
  grid.innerHTML='';
  if(!IMAGES.length){document.getElementById('empty').style.display='block';return;}
  document.getElementById('empty').style.display='none';
  IMAGES.forEach((img,i)=>{
    const card=document.createElement('div');card.className='card';
    const thumb=document.createElement('div');thumb.className='card-thumb';
    const el=document.createElement('img');
    el.loading='lazy';el.alt=img.filename;el.src=img.src;
    el.onload=()=>el.classList.add('rdy');
    thumb.appendChild(el);
    const foot=document.createElement('div');foot.className='card-foot';
    const name=document.createElement('span');name.className='card-name';name.textContent=img.filename;
    const menu=document.createElement('button');menu.className='card-menu';menu.title='Options';
    menu.innerHTML='<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="2" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg>';
    menu.addEventListener('click',e=>{e.stopPropagation();openCtx(e,i)});
    foot.appendChild(name);foot.appendChild(menu);
    card.appendChild(thumb);card.appendChild(foot);
    card.addEventListener('click',()=>openLB(i));
    grid.appendChild(card);
  });
}

function openCtx(e,i){
  ctxIdx=i;
  ctx.classList.add('show');
  const x=Math.min(e.clientX,window.innerWidth-160);
  const y=Math.min(e.clientY,window.innerHeight-80);
  ctx.style.left=x+'px';ctx.style.top=y+'px';
}
function closeCtx(){ctx.classList.remove('show');ctxIdx=-1;}
document.addEventListener('click',()=>closeCtx());
ctx.addEventListener('click',e=>e.stopPropagation());

document.getElementById('ctx-dl').addEventListener('click',()=>{
  if(ctxIdx<0)return;
  downloadImg(IMAGES[ctxIdx]);
  closeCtx();
});

async function downloadImg(img){
  try{
    const res=await fetch(img.src);
    const blob=await res.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=img.filename;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }catch{
    const a=document.createElement('a');a.href=img.src;a.download=img.filename;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  }
}

function openLB(i){cur=i;showImg();lb.classList.remove('off');}
function showImg(){
  lbImg.classList.remove('rdy');lbSpin.style.display='block';lbImg.src='';
  const img=IMAGES[cur];
  lbImg.onload=()=>{lbSpin.style.display='none';lbImg.classList.add('rdy');};
  lbImg.src=img.src;
  lbFoot.textContent=(cur+1)+' / '+IMAGES.length+' · '+img.filename;
}
function closeLB(){lb.classList.add('off');lbImg.src='';}
function prev(){cur=(cur-1+IMAGES.length)%IMAGES.length;showImg();}
function next(){cur=(cur+1)%IMAGES.length;showImg();}

document.getElementById('lb-close').onclick=closeLB;
document.getElementById('lb-prev').onclick=prev;
document.getElementById('lb-next').onclick=next;
lb.addEventListener('click',e=>{if(e.target===lb)closeLB();});
document.addEventListener('keydown',e=>{
  if(lb.classList.contains('off'))return;
  if(e.key==='Escape')closeLB();
  if(e.key==='ArrowLeft')prev();
  if(e.key==='ArrowRight')next();
});

document.getElementById('sort-sel').addEventListener('change',e=>sortImages(e.target.value));
sortImages('newest');
</script>
</body>
</html>`;

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#f7f7f5',
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
