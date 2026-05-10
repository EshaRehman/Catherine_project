import React from 'react';
import { useApp } from '../state/AppContext.jsx';
import adminBrandMark from '../assets/admin-brand-mark.jpeg';

export function AdminShell({ children }) {
  const { setMode, adminRoute, setAdminRoute, settings } = useApp();

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
      </aside>
      <div className="admin-body">
        <header className="admin-toolbar">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode('kiosk')}>
            Live experience
          </button>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </>
  );
}
