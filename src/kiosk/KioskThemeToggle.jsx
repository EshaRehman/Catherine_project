import React from 'react';
import { useApp } from '../state/AppContext.jsx';

export function KioskThemeToggle() {
  const { adminTheme, setAdminTheme } = useApp();
  const next = adminTheme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="kiosk-theme-toggle"
      onClick={() => setAdminTheme(next)}
      title={`Switch to ${next} mode (same as Admin → Light / Dark)`}
      aria-label={`Switch to ${next} mode`}
    >
      {adminTheme === 'dark' ? (
        <span className="kiosk-theme-toggle__icon" aria-hidden>
          {/* sun */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </span>
      ) : (
        <span className="kiosk-theme-toggle__icon" aria-hidden>
          {/* moon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </span>
      )}
      <span className="kiosk-theme-toggle__label">{next === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}
