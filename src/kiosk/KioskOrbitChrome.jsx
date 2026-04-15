import React, { useId, useLayoutEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

const DEFAULT_RX = 14;

/**
 * Animated gradient border (same technique as style cards) for kiosk chrome controls.
 * Renders inside `anchorRef` element as first child; anchor must be `position: relative` (see `.kiosk-chrome-orbit-target`).
 */
export function KioskOrbitChrome({ anchorRef, rxFallback = DEFAULT_RX }) {
  const reducedMotion = usePrefersReducedMotion();
  const reactId = useId().replace(/:/g, '');
  const [dims, setDims] = useState({ w: 0, h: 0, rx: rxFallback });

  useLayoutEffect(() => {
    const el = anchorRef?.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const read = () => {
      const w = Math.max(1, el.offsetWidth);
      const h = Math.max(1, el.offsetHeight);
      const cs = getComputedStyle(el);
      const rPx = parseFloat(cs.borderTopLeftRadius || `${rxFallback}`);
      const rxBorder = Number.isFinite(rPx) ? rPx : rxFallback;
      const rx = Math.min(rxBorder, w / 2 - 0.001, h / 2 - 0.001);
      setDims((prev) => (prev.w === w && prev.h === h && prev.rx === rx ? prev : { w, h, rx }));
    };

    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchorRef, rxFallback]);

  const gradId = `kiosk-chrome-orbit-grad-${reactId}`;
  const { w, h, rx: rxOuter } = dims;
  const rx = Math.min(rxOuter, w / 2 - 0.001, h / 2 - 0.001);

  if (w <= 0 || h <= 0) return null;

  return (
    <svg
      className="kiosk-chrome-orbit__svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={w}
          y2={h}
        >
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="12%" stopColor="#fde047" />
          <stop offset="25%" stopColor="#2dd4bf" />
          <stop offset="38%" stopColor="#c084fc" />
          <stop offset="50%" stopColor="#fb923c" />
          <stop offset="62%" stopColor="#fde047" />
          <stop offset="75%" stopColor="#2dd4bf" />
          <stop offset="88%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#fb923c" />
          {!reducedMotion ? (
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from={`0 ${w / 2} ${h / 2}`}
              to={`360 ${w / 2} ${h / 2}`}
              dur="4s"
              repeatCount="indefinite"
            />
          ) : null}
        </linearGradient>
      </defs>
      <rect
        className="kiosk-chrome-orbit__rect"
        x={0}
        y={0}
        width={w}
        height={h}
        rx={rx}
        ry={rx}
        fill="none"
        stroke={`url(#${gradId})`}
      />
    </svg>
  );
}
