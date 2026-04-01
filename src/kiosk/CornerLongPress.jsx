import React, { useCallback, useRef, useState } from 'react';

const HOLD_MS = 4000;

export function CornerLongPress({ onActivate }) {
  const timerRef = useRef(null);
  const [charging, setCharging] = useState(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCharging(false);
  }, []);

  const start = useCallback(() => {
    clear();
    setCharging(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setCharging(false);
      onActivate();
    }, HOLD_MS);
  }, [clear, onActivate]);

  return (
    <div
      className={`kiosk-corner-hit${charging ? ' is-charging' : ''}`}
      title=""
      aria-label="Hold for admin access"
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* some platforms */
        }
        start();
      }}
      onPointerUp={(e) => {
        try {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        } catch {
          /* ignore */
        }
        clear();
      }}
      onPointerCancel={clear}
    >
      <div className="kiosk-corner-mark" />
      {charging ? <div className="kiosk-corner-ring" aria-hidden /> : null}
    </div>
  );
}
