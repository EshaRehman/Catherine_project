import React from 'react';
import { useApp } from '../state/AppContext.jsx';
import { KioskHeaderTrailing } from './KioskHeaderTrailing.jsx';

export function IdleScreen({ onStart, disabled }) {
  const { adminTheme } = useApp();
  const themeClass = adminTheme === 'light' ? 'kiosk-idle--theme-light' : '';

  return (
    <div className={`kiosk-idle ${themeClass}`.trim()}>
      <div className="kiosk-idle__backdrop kiosk-idle__backdrop--rich" aria-hidden>
        <div className="kiosk-idle__ambient" />
        <div className="kiosk-idle__blobs">
          <span className="kiosk-idle__blob kiosk-idle__blob--a" />
          <span className="kiosk-idle__blob kiosk-idle__blob--b" />
          <span className="kiosk-idle__blob kiosk-idle__blob--c" />
        </div>
        <div className="kiosk-idle__grain" />
      </div>

      <header className="kiosk-idle__header kiosk-stage-header kiosk-stage-header--end">
        <KioskHeaderTrailing />
      </header>

      <div className="kiosk-idle__content">
        <h1 className="kiosk-idle__title">
          {disabled ? (
            <>
              <span className="kiosk-idle__title-plain">Your </span>
              <span className="text-brand-gradient">portrait</span>
              <span className="kiosk-idle__title-plain"> awaits</span>
            </>
          ) : (
            <>
              <span className="kiosk-idle__title-plain">Step in. </span>
              <span className="text-brand-gradient">Become the artwork.</span>
            </>
          )}
        </h1>
        <p className="kiosk-idle__sub">
          {disabled
            ? 'No looks are available for the live experience yet.'
            : 'One tap to begin.'}
        </p>
        {disabled ? (
          <p className="kiosk-idle__hint">
            In admin, add templates to an event and set that event as active — then return with{' '}
            <strong>Live experience</strong>.
          </p>
        ) : null}
        <div className="kiosk-idle__rule" aria-hidden />
        <button type="button" className="kiosk-tap" onClick={onStart} disabled={disabled}>
          <span className="kiosk-tap__shine" aria-hidden />
          Tap to start
        </button>
      </div>
    </div>
  );
}
