import React from 'react';

export function IdleScreen({ onStart, disabled }) {
  return (
    <div className="kiosk-idle kiosk-idle--rich">
      <div className="kiosk-idle__blobs" aria-hidden>
        <span className="kiosk-idle__blob kiosk-idle__blob--a" />
        <span className="kiosk-idle__blob kiosk-idle__blob--b" />
        <span className="kiosk-idle__blob kiosk-idle__blob--c" />
      </div>
      <div className="kiosk-idle__grain" aria-hidden />

      <div className="kiosk-idle__content">
        <h1 className="kiosk-idle__title">Your portrait awaits</h1>
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
