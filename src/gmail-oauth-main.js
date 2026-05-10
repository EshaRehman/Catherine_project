const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { OAuth2Client } = require('google-auth-library');
const {
  GMAIL_OAUTH_REDIRECT_PORT,
  GMAIL_OAUTH_REDIRECT_PATH,
  GMAIL_OAUTH_REDIRECT_URI,
  GMAIL_SCOPES,
} = require('./gmail-oauth-config');

const TOKEN_FILENAME = 'gmail-oauth-tokens.json';
/** Stay under Gmail’s ~25 MB attachment limit. */
const MAX_ZIP_BYTES = 24 * 1024 * 1024;

function tokenPath(app) {
  return path.join(app.getPath('userData'), TOKEN_FILENAME);
}

function findClientSecretJsonPath(app) {
  const envPath = process.env.GMAIL_CLIENT_SECRET_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const dirs = [app.getAppPath(), process.cwd()];
  for (const dir of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.startsWith('client_secret_') || !name.endsWith('.json')) continue;
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
        /* skip */
      }
    }
  }
  return null;
}

function readWebCredentials(clientSecretPath) {
  const raw = JSON.parse(fs.readFileSync(clientSecretPath, 'utf8'));
  const web = raw.web || raw.installed;
  if (!web?.client_id || !web?.client_secret) {
    throw new Error('OAuth JSON must include web (or installed) client_id and client_secret');
  }
  return { clientId: web.client_id, clientSecret: web.client_secret };
}

function createOAuthClient(clientSecretPath) {
  const { clientId, clientSecret } = readWebCredentials(clientSecretPath);
  return new OAuth2Client(clientId, clientSecret, GMAIL_OAUTH_REDIRECT_URI);
}

async function loadTokens(app) {
  const p = tokenPath(app);
  try {
    const raw = await fsp.readFile(p, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j.refresh_token === 'string') return j;
  } catch {
    /* missing */
  }
  return null;
}

async function saveTokens(app, tokens) {
  await fsp.writeFile(tokenPath(app), JSON.stringify(tokens, null, 2), 'utf8');
}

async function clearTokens(app) {
  try {
    await fsp.unlink(tokenPath(app));
  } catch {
    /* ok */
  }
}

function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function wrapMimeLines(b64) {
  const chunks = [];
  for (let i = 0; i < b64.length; i += 76) chunks.push(b64.slice(i, i + 76));
  return chunks.join('\r\n');
}

function buildRawMimeMessage({ to, subject, bodyText, zipName, zipBuffer }) {
  const boundary = `catherine_${Math.random().toString(36).slice(2, 14)}`;
  const nl = '\r\n';
  const textPart = `${bodyText || ''}`.replace(/\r?\n/g, nl);
  const b64Zip = wrapMimeLines(zipBuffer.toString('base64'));
  const mime =
    `To: ${to}${nl}` +
    `Subject: ${subject}${nl}` +
    `MIME-Version: 1.0${nl}` +
    `Content-Type: multipart/mixed; boundary="${boundary}"${nl}` +
    `${nl}` +
    `--${boundary}${nl}` +
    `Content-Type: text/plain; charset=UTF-8${nl}` +
    `Content-Transfer-Encoding: 8bit${nl}` +
    `${nl}` +
    `${textPart}${nl}` +
    `${nl}` +
    `--${boundary}${nl}` +
    `Content-Type: application/zip${nl}` +
    `Content-Disposition: attachment; filename="${zipName.replace(/"/g, '')}"${nl}` +
    `Content-Transfer-Encoding: base64${nl}` +
    `${nl}` +
    `${b64Zip}${nl}` +
    `${nl}` +
    `--${boundary}--`;
  return toBase64Url(mime);
}

async function fetchSenderEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.email || null;
}

async function sendGmailRaw(accessToken, rawBase64Url) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: rawBase64Url }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${t}`);
  }
  return res.json();
}

function registerGmailIpc({ app, ipcMain, shell }) {
  ipcMain.handle('gmail-auth-status', async () => {
    const secretPath = findClientSecretJsonPath(app);
    const tokens = await loadTokens(app);
    if (!secretPath) {
      return {
        clientSecretFound: false,
        linked: false,
        email: null,
        redirectUri: GMAIL_OAUTH_REDIRECT_URI,
      };
    }
    if (!tokens?.refresh_token) {
      return {
        clientSecretFound: true,
        linked: false,
        email: null,
        redirectUri: GMAIL_OAUTH_REDIRECT_URI,
      };
    }
    try {
      const client = createOAuthClient(secretPath);
      client.setCredentials(tokens);
      const { token: accessToken } = await client.getAccessToken();
      if (!accessToken) {
        return {
          clientSecretFound: true,
          linked: false,
          email: null,
          redirectUri: GMAIL_OAUTH_REDIRECT_URI,
        };
      }
      const email = await fetchSenderEmail(accessToken);
      return {
        clientSecretFound: true,
        linked: true,
        email,
        redirectUri: GMAIL_OAUTH_REDIRECT_URI,
      };
    } catch {
      return {
        clientSecretFound: true,
        linked: false,
        email: null,
        redirectUri: GMAIL_OAUTH_REDIRECT_URI,
      };
    }
  });

  ipcMain.handle('gmail-auth-connect', async () => {
    const secretPath = findClientSecretJsonPath(app);
    if (!secretPath) {
      return { ok: false, reason: 'no-client-secret', redirectUri: GMAIL_OAUTH_REDIRECT_URI };
    }
    const client = createOAuthClient(secretPath);
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      prompt: 'consent',
    });

    const result = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const u = new URL(req.url || '/', `http://127.0.0.1:${GMAIL_OAUTH_REDIRECT_PORT}`);
          if (u.pathname !== GMAIL_OAUTH_REDIRECT_PATH) {
            res.statusCode = 404;
            res.end();
            return;
          }
          const code = u.searchParams.get('code');
          const err = u.searchParams.get('error');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          if (err) {
            res.end(
              `<!doctype html><html><body><p>Google returned: ${err}</p><p>You can close this window.</p></body></html>`,
            );
            server.close(() => resolve({ ok: false, error: err }));
            return;
          }
          if (!code) {
            res.end('<!doctype html><html><body><p>No code received.</p></body></html>');
            server.close(() => resolve({ ok: false, error: 'no_code' }));
            return;
          }
          res.end(
            '<!doctype html><html><body><p>Connected. You can return to Catherine and close this tab.</p></body></html>',
          );
          server.close(() => resolve({ ok: true, code }));
        } catch (e) {
          res.statusCode = 500;
          res.end();
          server.close(() => reject(e));
        }
      });
      server.on('error', (e) => reject(e));
      server.listen(GMAIL_OAUTH_REDIRECT_PORT, '127.0.0.1', () => {
        shell.openExternal(authUrl).catch((e) => {
          server.close(() => reject(e));
        });
      });
    }).catch((e) => {
      if (e && e.code === 'EADDRINUSE') {
        return { ok: false, error: 'port_in_use' };
      }
      return { ok: false, error: e && e.message ? e.message : 'server_failed' };
    });

    if (!result.ok) {
      const reason =
        result.error === 'port_in_use'
          ? 'port_in_use'
          : result.error === 'no_code'
            ? 'no_code'
            : result.error || 'denied';
      return { ok: false, reason, redirectUri: GMAIL_OAUTH_REDIRECT_URI };
    }

    try {
      const { tokens } = await client.getToken(result.code);
      if (!tokens.refresh_token) {
        return {
          ok: false,
          reason: 'no_refresh_token',
          redirectUri: GMAIL_OAUTH_REDIRECT_URI,
          hint: 'Revoke Catherine in Google Account → Security, then connect again.',
        };
      }
      await saveTokens(app, tokens);
      client.setCredentials(tokens);
      const { token: accessToken } = await client.getAccessToken();
      const email = accessToken ? await fetchSenderEmail(accessToken) : null;
      return { ok: true, email, redirectUri: GMAIL_OAUTH_REDIRECT_URI };
    } catch (e) {
      return {
        ok: false,
        reason: 'token_exchange_failed',
        detail: String(e && e.message ? e.message : e),
        redirectUri: GMAIL_OAUTH_REDIRECT_URI,
      };
    }
  });

  ipcMain.handle('gmail-auth-disconnect', async () => {
    await clearTokens(app);
    return { ok: true };
  });
}

/**
 * If OAuth is configured and linked, sends zip via Gmail API. Otherwise returns null.
 */
async function trySendJobZipViaGmail(app, { recipient, eventName, message, zipBuffer, zipFileName }) {
  const secretPath = findClientSecretJsonPath(app);
  if (!secretPath) return null;
  const tokens = await loadTokens(app);
  if (!tokens?.refresh_token) return null;
  if (zipBuffer.length > MAX_ZIP_BYTES) {
    return {
      ok: false,
      reason: 'attachment-too-large',
      maxMb: Math.floor(MAX_ZIP_BYTES / (1024 * 1024)),
    };
  }
  const client = createOAuthClient(secretPath);
  client.setCredentials(tokens);
  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) return null;
  const subject = `Your photos from ${eventName || 'our event'}`;
  const bodyText =
    message ||
    `Hi,\n\nYour photos from ${eventName || 'the event'} are attached as a zip file.\n\nThanks!`;
  const raw = buildRawMimeMessage({
    to: recipient.trim(),
    subject,
    bodyText,
    zipName: zipFileName,
    zipBuffer,
  });
  await sendGmailRaw(accessToken, raw);
  return { ok: true, via: 'gmail' };
}

module.exports = {
  registerGmailIpc,
  trySendJobZipViaGmail,
  findClientSecretJsonPath,
  GMAIL_OAUTH_REDIRECT_URI,
};
