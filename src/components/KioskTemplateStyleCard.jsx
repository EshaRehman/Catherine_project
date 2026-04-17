import React, { useLayoutEffect, useRef, useState } from 'react';
import { TemplateThemePreview } from './TemplateThemePreview.jsx';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

const KIOSK_CARD_RX = 24; /* keep in sync with --radius-lg */

/**
 * Kiosk template picker card: orbit stroke, hover “Select” veil, selected check corner.
 * Used on live template screen and admin create-event (wrap grid with .kiosk-templates--stage for styles).
 */
export function KioskTemplateStyleCard({
  template: t,
  selected,
  onActivate,
  /** Title under artwork (defaults to template.name) */
  title,
  /** Extra classes on the button (e.g. admin layout hooks) */
  buttonClassName = '',
  role = 'radio',
  ariaChecked,
  ariaLabel,
}) {
  const btnRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const [dims, setDims] = useState({ w: 0, h: 0, rx: KIOSK_CARD_RX });

  useLayoutEffect(() => {
    const el = btnRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const read = () => {
      const w = Math.max(1, el.offsetWidth);
      const h = Math.max(1, el.offsetHeight);
      const cs = getComputedStyle(el);
      const rPx = parseFloat(cs.borderTopLeftRadius || `${KIOSK_CARD_RX}`);
      const rxBorder = Number.isFinite(rPx) ? rPx : KIOSK_CARD_RX;
      const rx = Math.min(rxBorder, w / 2 - 0.001, h / 2 - 0.001);
      setDims((prev) =>
        prev.w === w && prev.h === h && prev.rx === rx ? prev : { w, h, rx },
      );
    };

    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const safe = String(t.id).replace(/[^a-zA-Z0-9_-]/g, '-');
  const gradId = `kiosk-orbit-grad-${safe}`;
  const { w, h, rx: rxOuter } = dims;
  const rx = Math.min(rxOuter, w / 2 - 0.001, h / 2 - 0.001);
  const displayTitle = title ?? t.name;
  const checked = ariaChecked !== undefined ? ariaChecked : selected;
  const label = ariaLabel ?? displayTitle;

  return (
    <div className="kiosk-tpl-card-shell" role="presentation">
      <button
        ref={btnRef}
        type="button"
        role={role}
        aria-checked={checked}
        aria-label={label}
        className={`kiosk-tpl-card kiosk-tpl-card--hover-select${selected ? ' kiosk-tpl-card--selected' : ''}${buttonClassName ? ` ${buttonClassName}` : ''}`}
        onClick={onActivate}
      >
        {w > 0 && h > 0 ? (
          <svg
            className="kiosk-tpl-card-shell__orbit"
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
              className="kiosk-tpl-card-shell__orbit-rect"
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
        ) : null}
        <div className="kiosk-tpl-card__visual">
          <TemplateThemePreview template={t} variant="kiosk" />
          {selected ? (
            <div className="kiosk-tpl-card__selected-corner" aria-hidden="true">
              <svg className="kiosk-tpl-card__selected-corner-svg" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12.5l4 4 8-9"
                />
              </svg>
            </div>
          ) : null}
          <div className="kiosk-tpl-card__select-layer" aria-hidden>
            <span className="kiosk-tpl-card__select-label">Select</span>
          </div>
        </div>
        <div className="kiosk-tpl-footer kiosk-tpl-footer--compact kiosk-tpl-footer--stage">
          <div className="kiosk-tpl-title kiosk-tpl-title--stage">
            <span className="text-brand-gradient">{displayTitle}</span>
          </div>
        </div>
      </button>
    </div>
  );
}
