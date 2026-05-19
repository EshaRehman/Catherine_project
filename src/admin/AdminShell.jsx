import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { connectGmailApi, getGmailStatusApi } from '../utils/api.js';
import adminBrandMark from '../assets/admin-brand-mark.jpeg';

export function AdminShell({ children }) {
  const { setMode, adminRoute, setAdminRoute, settings, jobsSupported } = useApp();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gmailModal, setGmailModal] = useState(false);
  const [gmailForm, setGmailForm] = useState({ email: '', password: '' });
  const [gmailFormError, setGmailFormError] = useState('');
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailStatus, setGmailStatus] = useState(null);

  const settingsRef = useRef(null);

  useEffect(() => {
    getGmailStatusApi().then((res) => {
      if (res.ok) setGmailStatus(res.data);
    });
  }, []);

  const refreshGmailStatus = () => {
    getGmailStatusApi().then((res) => {
      if (res.ok) setGmailStatus(res.data);
    });
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const onClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [settingsOpen]);

  const openGmailModal = () => {
    setSettingsOpen(false);
    setGmailFormError('');
    setGmailForm({
      email: gmailStatus?.data?.sender_gmail || '',
      password: '',
    });
    setGmailModal(true);
  };

  const isGmailConnected = !!gmailStatus?.connected;
  const connectedEmail = gmailStatus?.data?.sender_gmail || '';

  const nav = (route) => () => setAdminRoute(route);

  return (
    <>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark admin-brand-mark--photo" aria-hidden>
            <img className="admin-brand-mark__img" src={adminBrandMark} alt="" />
          </div>
          <span className="admin-brand-text">{settings.brandName || 'Catherine'}</span>
        </div>
        <nav className="admin-nav admin-nav--vertical" aria-label="Admin sections">
          <button
            type="button"
            className={adminRoute === 'events' ? 'is-active' : ''}
            onClick={nav('events')}
          >
            Events
          </button>
          <button
            type="button"
            className={adminRoute === 'templates' ? 'is-active' : ''}
            onClick={nav('templates')}
          >
            Templates
          </button>
        </nav>

        <div className="admin-sidebar__bottom" ref={settingsRef}>
          {settingsOpen && (
            <div className="admin-settings-panel">
              <button
                type="button"
                className="admin-settings-panel__item"
                onClick={openGmailModal}
              >
                <span className={`admin-settings-panel__dot${isGmailConnected ? ' admin-settings-panel__dot--on' : ''}`} aria-hidden />
                {isGmailConnected ? 'Gmail connected' : 'Connect Gmail'}
              </button>
            </div>
          )}
          <button
            type="button"
            className={`admin-sidebar__settings-btn ${settingsOpen ? 'is-active' : ''}`}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </div>
      </aside>

      <div className="admin-body">
        <header className="admin-toolbar">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode('kiosk')}>
            Live experience
          </button>
        </header>
        <main className="admin-main">{children}</main>
      </div>

      {gmailModal && (
        <div className="gmail-modal-overlay" onClick={() => setGmailModal(false)}>
          <div className="gmail-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="gmail-modal__title">{isGmailConnected ? 'Update Gmail connection' : 'Connect Gmail'}</h3>
            <p className="gmail-modal__sub">
              {isGmailConnected
                ? `Currently connected as ${connectedEmail}. Enter new credentials to update.`
                : 'Enter your Gmail address and an App Password generated from your Google account security settings.'}
            </p>
            <div className="gmail-modal__fields">
              <div className="field">
                <label htmlFor="gm-email">Gmail address</label>
                <input
                  id="gm-email"
                  type="email"
                  className="input"
                  placeholder="you@gmail.com"
                  value={gmailForm.email}
                  onChange={(e) => setGmailForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={gmailBusy}
                />
              </div>
              <div className="field">
                <label htmlFor="gm-pass">App Password</label>
                <input
                  id="gm-pass"
                  type="password"
                  className="input"
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={gmailForm.password}
                  onChange={(e) => setGmailForm((f) => ({ ...f, password: e.target.value }))}
                  disabled={gmailBusy}
                />
              </div>
            </div>
            {gmailFormError && <p className="gmail-modal__error">{gmailFormError}</p>}
            <div className="gmail-modal__actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setGmailModal(false)}
                disabled={gmailBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={gmailBusy || !gmailForm.email || !gmailForm.password}
                onClick={async () => {
                  setGmailBusy(true);
                  setGmailFormError('');
                  try {
                    const res = await connectGmailApi({
                      senderGmail: gmailForm.email,
                      senderAppPassword: gmailForm.password,
                    });
                    if (res.ok) {
                      setGmailModal(false);
                      refreshGmailStatus();
                    } else {
                      setGmailFormError(res.error || 'Failed to connect. Check your credentials and try again.');
                    }
                  } catch {
                    setGmailFormError('Unexpected error. Please try again.');
                  } finally {
                    setGmailBusy(false);
                  }
                }}
              >
                {gmailBusy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
