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
              {/* Cleaner, centered “C” style cue mark */}
              <path
                d="M28 13.6c-1.7-1.6-4-2.6-6.7-2.6-5.6 0-10.1 4.9-10.1 11s4.5 11 10.1 11c2.7 0 5-.9 6.7-2.6"
                stroke="rgba(255,255,255,0.92)"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="13.2" cy="23.1" r="1.9" fill="rgba(255,255,255,0.55)" />
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
            title="Appearance: switches admin and live kiosk (light / dark)"
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
