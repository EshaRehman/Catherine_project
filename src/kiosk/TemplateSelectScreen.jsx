import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { KioskHeaderTrailing } from './KioskHeaderTrailing.jsx';
import { KioskOrbitChrome } from './KioskOrbitChrome.jsx';

const KIOSK_CARD_RX = 24; /* keep in sync with --radius-lg */

/** Style picker: full border stroke; gradient rotates so colors travel smoothly around the card. */
function KioskStyleCardShell({ template: t, selected, onSelect }) {
  const btnRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const [dims, setDims] = useState({ w: 0, h: 0, rx: KIOSK_CARD_RX });

  useLayoutEffect(() => {
    const el = btnRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const read = () => {
      /*
       * Use layout box, not getBoundingClientRect(): the shell scales on hover, and
       * getBoundingClientRect() includes that transform — so w/h would grow while the
       * shell’s layout box stays the same and the orbit SVG would no longer match the card.
       */
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

  return (
    <div className="kiosk-tpl-card-shell" role="presentation">
      <button
        ref={btnRef}
        type="button"
        role="radio"
        aria-checked={selected}
        className={`kiosk-tpl-card kiosk-tpl-card--hover-select${selected ? ' kiosk-tpl-card--selected' : ''}`}
        aria-label={t.name}
        onClick={() => onSelect(t.id)}
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
                {/* Two passes through the palette along the vector so rotation reads as faster, clearer bands */}
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
            <span className="text-brand-gradient">{t.name}</span>
          </div>
        </div>
      </button>
    </div>
  );
}

export function TemplateSelectScreen({ templates, onPick, onBack }) {
  const backRef = useRef(null);
  const [selectedId, setSelectedId] = useState(() => templates[0]?.id ?? null);

  useEffect(() => {
    if (!templates.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev != null && templates.some((t) => t.id === prev) ? prev : templates[0].id,
    );
  }, [templates]);

  return (
    <div className="kiosk-templates kiosk-templates--stage">
      <header className="kiosk-stage-header kiosk-stage-header--split">
        <button
          ref={backRef}
          type="button"
          className="kiosk-nav-back kiosk-chrome-orbit-target"
          onClick={onBack}
        >
          <KioskOrbitChrome anchorRef={backRef} rxFallback={14} />
          <span className="kiosk-nav-back__face">
            <span className="kiosk-nav-back__chevron" aria-hidden />
            Back
          </span>
        </button>
        <KioskHeaderTrailing />
      </header>
      <div className="kiosk-templates__body">
        <div className="kiosk-templates__center">
          <div className="kiosk-templates__center-inner">
            <p className="kiosk-templates__hint">
              <span className="kiosk-templates__hint-choose">Choose</span>{' '}
              <span className="text-brand-gradient">A Look</span>
            </p>
            <div
              className="kiosk-templates-grid kiosk-templates-grid--themes kiosk-templates-grid--themes-row"
              role="radiogroup"
              aria-label="Portrait styles"
            >
              {templates.map((t) => (
                <KioskStyleCardShell
                  key={t.id}
                  template={t}
                  selected={t.id === selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary kiosk-templates__continue"
              disabled={selectedId == null}
              onClick={() => selectedId != null && onPick(selectedId)}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
