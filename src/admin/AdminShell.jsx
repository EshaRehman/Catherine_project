import React from 'react';
import { useApp } from '../state/AppContext.jsx';
import brandLogo from '../assets/Robot with camera and vibrant logo.png';

export function AdminShell({ children }) {
  const { setMode, adminRoute, setAdminRoute, adminTheme, setAdminTheme } = useApp();

  const nav = (route) => () => setAdminRoute(route);

  return (
    <>
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-brand">
          <div className="admin-brand-live" aria-hidden="true">
            <div className="admin-brand-live__halo" />
            <div className="admin-brand-mark admin-brand-mark--logo">
              <img src={brandLogo} alt="" className="admin-brand-mark__img" />
            </div>
          </div>
        </div>
        <div className="admin-sidebar__sections">
          <p className="admin-nav-section-label">Workspace</p>
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
        </div>
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
