import React from 'react';
import { useApp } from '../state/AppContext.jsx';

export function AdminShell({ children }) {
  const {
    setMode,
    adminRoute,
    setAdminRoute,
    settings,
    adminTheme,
    setAdminTheme,
  } = useApp();

  const nav = (route) => () => setAdminRoute(route);

  return (
    <>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark" aria-hidden>
            <svg className="admin-brand-mark__svg" viewBox="0 0 40 40" fill="none" aria-hidden>
              <circle cx="26" cy="12" r="5.5" stroke="rgba(255,255,255,0.92)" strokeWidth="1.35" />
              <path
                d="M6 30.5 L22.5 14"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M5 31.5 L4 33"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
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
      </aside>
      <div className="admin-body">
        <header className="admin-toolbar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setAdminTheme(adminTheme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            {adminTheme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode('kiosk')}>
            Live experience
          </button>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </>
  );
}
