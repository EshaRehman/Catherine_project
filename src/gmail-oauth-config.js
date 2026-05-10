/**
 * OAuth redirect for the desktop app (loopback). This exact URL must be added in
 * Google Cloud Console → APIs & Services → Credentials → your OAuth client
 * → Authorized redirect URIs.
 *
 * The client must paste: http://127.0.0.1:54321/oauth2/callback
 */
const GMAIL_OAUTH_REDIRECT_PORT = 54321;
const GMAIL_OAUTH_REDIRECT_PATH = '/oauth2/callback';
const GMAIL_OAUTH_REDIRECT_URI = `http://127.0.0.1:${GMAIL_OAUTH_REDIRECT_PORT}${GMAIL_OAUTH_REDIRECT_PATH}`;

/** Send-only scope (least privilege). */
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

module.exports = {
  GMAIL_OAUTH_REDIRECT_PORT,
  GMAIL_OAUTH_REDIRECT_PATH,
  GMAIL_OAUTH_REDIRECT_URI,
  GMAIL_SCOPES,
};
