import React, { useCallback, useId, useRef, useState } from 'react';
import { KioskOrbitChrome } from './KioskOrbitChrome.jsx';

const HOLD_MS = 4000;

/**
 * Long-press to open admin. Hold feedback is a smooth rounded-rect stroke that
 * draws around the edge (same palette as marketing references), not a spinning ring.
 */
export function CornerLongPress({ onActivate }) {
  const anchorRef = useRef(null);
  const rafRef = useRef(null);
  const startTimeRef = useRef(0);
  const completedRef = useRef(false);
  const holdGradId = useId().replace(/:/g, '');
  const [charging, setCharging] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);

  const cancelRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    cancelRaf();
    completedRef.current = false;
    startTimeRef.current = 0;
    setCharging(false);
    setHoldProgress(0);
  }, [cancelRaf]);

  const tick = useCallback(() => {
    if (startTimeRef.current === 0) return;

    const elapsed = performance.now() - startTimeRef.current;
    const linear = Math.min(1, elapsed / HOLD_MS);
    setHoldProgress(linear);

    if (linear >= 1) {
      rafRef.current = null;
      if (!completedRef.current) {
        completedRef.current = true;
        setCharging(false);
        setHoldProgress(0);
        onActivate();
      }
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [onActivate]);

  const start = useCallback(() => {
    cancelRaf();
    completedRef.current = false;
    setCharging(true);
    setHoldProgress(0);
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [cancelRaf, tick]);

  const strokeDashoffset = 100 * (1 - holdProgress);

  return (
    <div
      ref={anchorRef}
      className={`kiosk-corner-hit kiosk-chrome-orbit-target${charging ? ' is-charging' : ''}`}
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
      <KioskOrbitChrome anchorRef={anchorRef} rxFallback={14} />
      {charging ? (
        <svg
          className="kiosk-corner-hit__progress-svg"
          viewBox="0 0 48 44"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient
              id={holdGradId}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={48}
              y2={44}
            >
              <stop offset="0%" stopColor="#f58220" />
              <stop offset="35%" stopColor="#ffc20e" />
              <stop offset="70%" stopColor="#00a99d" />
              <stop offset="100%" stopColor="#00adef" />
            </linearGradient>
          </defs>
          <rect
            className="kiosk-corner-hit__progress-rect"
            x={2}
            y={2}
            width={44}
            height={40}
            rx={12}
            ry={12}
            fill="none"
            stroke={`url(#${holdGradId})`}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 24 22)"
          />
        </svg>
      ) : null}
      <span className="kiosk-corner-hit__face" aria-hidden="true">
        <span className="kiosk-corner-hit__mark" />
      </span>
    </div>
  );
}
