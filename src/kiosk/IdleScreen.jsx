import React, { useRef, useEffect } from 'react';
import idleHeroVideo from './idleHeroMedia.js';

export function IdleScreen({ onStart, disabled }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, []);

  return (
    <div className="kiosk-idle kiosk-idle--video">
      <video
        ref={videoRef}
        className="kiosk-idle__video kiosk-idle__video--fullscreen"
        src={idleHeroVideo}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
      />
      <div className="kiosk-idle__footer">
        {disabled ? (
          <p className="kiosk-idle__hint">
            In admin, add templates to an event and set that event as active — then return with{' '}
            <strong>Live experience</strong>.
          </p>
        ) : null}
        <button type="button" className="kiosk-tap kiosk-tap--idle-bottom" onClick={onStart} disabled={disabled}>
          <span className="kiosk-tap__shine" aria-hidden />
          Tap to start
        </button>
      </div>
    </div>
  );
}
