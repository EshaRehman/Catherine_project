import React, { useEffect, useState } from 'react';
import logo from '../assets/logo.png';

const COUNTDOWN_FROM = 8;

/* ── Verified human silhouettes (rendered & eyeballed before shipping) ──
   Both are OUTLINE only (fill:none) to match the reference. The trick that
   makes them read as people rather than sticks: stroke the whole body
   CONTOUR (a shape with real shoulder/torso/leg width), not individual
   stick limbs. Each is drawn in a fixed local box and positioned by
   bottom-centre anchor (cx, baseY) + a uniform scale; strokeWidth is
   divided by scale so the visible line weight stays constant at any size. */

// Head + shoulders bust. Local box 36w, bottom at y52.
function personBust(cx, baseY, scale, color, sw = 2.2) {
  return (
    <g
      transform={`translate(${cx - 18 * scale} ${baseY - 52 * scale}) scale(${scale})`}
      fill="none"
      stroke={color}
      strokeWidth={sw / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="16" r="9" />
      <path d="M2 52 C2 40 9 33 18 33 C27 33 34 40 34 52" />
    </g>
  );
}

// Full standing figure. Local box 40w, feet at y84.
function personFull(cx, baseY, scale, color, sw = 2.4) {
  return (
    <g
      transform={`translate(${cx - 20 * scale} ${baseY - 84 * scale}) scale(${scale})`}
      fill="none"
      stroke={color}
      strokeWidth={sw / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="20" cy="10" r="8" />
      <path d="M20 20 C12 20 8 25 8 33 C8 40 10 46 11 52 L9 84 C9 87 15 87 16 84 L20 60 L24 84 C25 87 31 87 31 84 L29 52 C30 46 32 40 32 33 C32 25 28 20 20 20 Z" />
    </g>
  );
}

const INSTRUCTIONS = [
  {
    // Kiosk screen — distance arrow — standing person
    icon: (
      <svg viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="12" width="8" height="24" rx="2.5" stroke="#00E6FF" strokeWidth="2" />
        <path d="M16 24h11m-11 0 2.6-2.6m-2.6 2.6 2.6 2.6m8.4-2.6-2.6-2.6m2.6 2.6-2.6 2.6" stroke="url(#crIconNeon)" strokeWidth="1.8" />
        {personFull(38, 42, 0.42, '#FF6B9A', 2)}
      </svg>
    ),
    body: (
      <>STAND APPROXIMATELY <em>1 METER</em> FROM THE SCREEN</>
    ),
  },
  {
    // 3-person group — max 4 per session
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        {personBust(14, 40, 0.46, '#00E6FF', 1.8)}
        {personBust(24, 38, 0.46, '#FF6B9A', 1.8)}
        {personBust(34, 40, 0.46, '#7B2CFF', 1.8)}
      </svg>
    ),
    body: (
      <>MAXIMUM <em>4 PEOPLE</em> PER SESSION</>
    ),
  },
  {
    // Viewfinder brackets around a single person — everyone fully visible
    icon: (
      <svg viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 17v-4.5A2.5 2.5 0 0 1 11.5 10H16" stroke="url(#crIconNeon)" strokeWidth="2" />
        <path d="M39 17v-4.5A2.5 2.5 0 0 0 36.5 10H32" stroke="url(#crIconNeon)" strokeWidth="2" />
        <path d="M9 31v4.5A2.5 2.5 0 0 0 11.5 38H16" stroke="url(#crIconNeon)" strokeWidth="2" />
        <path d="M39 31v4.5a2.5 2.5 0 0 1-2.5 2.5H32" stroke="url(#crIconNeon)" strokeWidth="2" />
        {personBust(24, 36, 0.5, '#FF6B9A', 1.9)}
      </svg>
    ),
    body: (
      <>ENSURE EVERYONE IS <em>FULLY VISIBLE</em></>
    ),
  },
  {
    // Viewfinder brackets around a 3-person group — everyone inside the frame
    icon: (
      <svg viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 16v-3.5A2.5 2.5 0 0 1 10.5 10H14" stroke="url(#crIconNeon)" strokeWidth="1.8" />
        <path d="M40 16v-3.5A2.5 2.5 0 0 0 37.5 10H34" stroke="url(#crIconNeon)" strokeWidth="1.8" />
        <path d="M8 32v3.5A2.5 2.5 0 0 0 10.5 38H14" stroke="url(#crIconNeon)" strokeWidth="1.8" />
        <path d="M40 32v3.5a2.5 2.5 0 0 1-2.5 2.5H34" stroke="url(#crIconNeon)" strokeWidth="1.8" />
        {personBust(17, 41, 0.4, '#00E6FF', 1.7)}
        {personBust(24, 39, 0.4, '#FF6B9A', 1.7)}
        {personBust(31, 41, 0.4, '#7B2CFF', 1.7)}
      </svg>
    ),
    body: (
      <>KEEP ALL FACES <em>INSIDE THE FRAME</em></>
    ),
  },
  {
    // Camera with a single-shot indicator — one capture per session
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="url(#crIconNeon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 14l2-3.4h10L31 14" />
        <rect x="6" y="14" width="36" height="24" rx="4" />
        <circle cx="24" cy="26" r="7" />
        <circle cx="24" cy="26" r="2.6" />
        <circle cx="34" cy="19.5" r="1.4" fill="url(#crIconNeon)" stroke="none" />
      </svg>
    ),
    body: (
      <>YOU HAVE <em>ONE CAPTURE</em> PER SESSION</>
    ),
  },
];

export function CameraReadyScreen({ onReady, onBack }) {
  const [count, setCount] = useState(COUNTDOWN_FROM);

  useEffect(() => {
    if (count <= 0) {
      onReady();
      return undefined;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [count, onReady]);

  return (
    <div className="cr-screen">
      {/* Shared neon gradient for all icon strokes */}
      <svg className="cr-defs" aria-hidden width="0" height="0">
        <defs>
          <linearGradient id="crIconNeon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFB800" />
            <stop offset="50%" stopColor="#7B2CFF" />
            <stop offset="100%" stopColor="#00E6FF" />
          </linearGradient>
        </defs>
      </svg>
      <div className="cr-starfield" aria-hidden />

      {/* Top-right neon light-trail — 4 main lines fanning from almost the
          same origin point, each with a soft blurred glow underneath, plus
          several extra faint/dull blurred strands threaded between them
          and sparkle dust scattered along the bundle. Smooth curves, short
          corner-confined reach — restored per feedback after the longer
          wavy-ribbon rewrite didn't land. */}
      <svg className="cr-streak-svg" viewBox="0 0 685 1214" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="crTrailA" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFB800" />
            <stop offset="100%" stopColor="#FF3D6E" />
          </linearGradient>
          <linearGradient id="crTrailB" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF6B9A" />
            <stop offset="60%" stopColor="#B14CFF" />
            <stop offset="100%" stopColor="#5B2CFF" />
          </linearGradient>
          <linearGradient id="crTrailC" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8A4CFF" />
            <stop offset="100%" stopColor="#00E6FF" />
          </linearGradient>
          <filter id="crTrailGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="crTrailGlowSoft" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Clearly-visible blurry/dull lines, offset from the 4 main ones —
            the earlier attempt at this (opacity ~0.12) was blurred into
            invisibility; these are brighter and use a tighter blur so they
            actually read as soft trailing lines instead of vanishing. */}
        <path d="M 680 -15 C 645 55, 660 100, 615 155" fill="none" stroke="url(#crTrailA)" strokeWidth="7" strokeLinecap="round" opacity="0.4" filter="url(#crTrailGlowSoft)" />
        <path d="M 715 -15 C 685 100, 645 175, 590 245" fill="none" stroke="url(#crTrailB)" strokeWidth="8" strokeLinecap="round" opacity="0.38" filter="url(#crTrailGlowSoft)" />
        <path d="M 690 10 C 650 110, 665 170, 605 235" fill="none" stroke="url(#crTrailC)" strokeWidth="7" strokeLinecap="round" opacity="0.35" filter="url(#crTrailGlowSoft)" />

        {/* Dull/faint blurred strands threaded between the 4 main lines —
            same near-shared origin, low opacity, no sharp core of their own */}
        <path d="M 695 -12 C 659 70, 639 130, 599 194" fill="none" stroke="url(#crTrailA)" strokeWidth="7" strokeLinecap="round" opacity="0.14" filter="url(#crTrailGlow)" />
        <path d="M 708 -8 C 676 78, 646 154, 610 218" fill="none" stroke="url(#crTrailB)" strokeWidth="8" strokeLinecap="round" opacity="0.16" filter="url(#crTrailGlow)" />
        <path d="M 702 8 C 670 98, 656 170, 620 238" fill="none" stroke="url(#crTrailB)" strokeWidth="7" strokeLinecap="round" opacity="0.13" filter="url(#crTrailGlow)" />
        <path d="M 692 5 C 654 77, 666 137, 630 193" fill="none" stroke="url(#crTrailC)" strokeWidth="6" strokeLinecap="round" opacity="0.12" filter="url(#crTrailGlow)" />

        {/* Wide glow beneath each of the 4 main lines — shortened ~20% */}
        <path d="M 700 -10 C 664 54, 632 94, 588 138" fill="none" stroke="url(#crTrailA)" strokeWidth="12" strokeLinecap="round" opacity="0.28" filter="url(#crTrailGlow)" />
        <path d="M 705 -5 C 669 87, 629 175, 557 263" fill="none" stroke="url(#crTrailB)" strokeWidth="14" strokeLinecap="round" opacity="0.3" filter="url(#crTrailGlow)" />
        <path d="M 698 0 C 656 128, 628 208, 576 288" fill="none" stroke="url(#crTrailC)" strokeWidth="12" strokeLinecap="round" opacity="0.26" filter="url(#crTrailGlow)" />
        <path d="M 703 5 C 653 81, 669 145, 629 209" fill="none" stroke="url(#crTrailB)" strokeWidth="10" strokeLinecap="round" opacity="0.24" filter="url(#crTrailGlow)" />

        {/* The 4 main SHARP lines — shortened ~20%, still from (700,0) */}
        <path d="M 700 -10 C 664 54, 632 94, 588 138" fill="none" stroke="url(#crTrailA)" strokeWidth="2" strokeLinecap="round" opacity="1" />
        <path d="M 705 -5 C 669 87, 629 175, 557 263" fill="none" stroke="url(#crTrailB)" strokeWidth="2.4" strokeLinecap="round" opacity="1" />
        <path d="M 698 0 C 656 128, 628 208, 576 288" fill="none" stroke="url(#crTrailC)" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
        <path d="M 703 5 C 653 81, 669 145, 629 209" fill="none" stroke="url(#crTrailB)" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />

        {/* Bright shared origin spark + trailing sparkle dust, pulled in to
            match the shortened lines */}
        <circle cx="700" cy="0" r="9" fill="#FFB800" opacity="0.3" filter="url(#crTrailGlow)" />
        <circle cx="700" cy="0" r="3" fill="#fff" opacity="0.95" />
        <circle cx="652" cy="76" r="1.6" fill="#FFD36B" opacity="0.9" />
        <circle cx="620" cy="144" r="1.8" fill="#C99BFF" opacity="0.9" />
        <circle cx="584" cy="232" r="1.6" fill="#7FE9FF" opacity="0.85" />
        <circle cx="672" cy="44" r="1.2" fill="#fff" opacity="0.8" />
        <circle cx="636" cy="48" r="1" fill="#FFD36B" opacity="0.75" />
        <circle cx="680" cy="112" r="1.3" fill="#C99BFF" opacity="0.85" />
        <circle cx="644" cy="184" r="1.1" fill="#7FE9FF" opacity="0.75" />
        <circle cx="664" cy="152" r="1.1" fill="#FFD36B" opacity="0.7" />
        <circle cx="624" cy="216" r="1" fill="#fff" opacity="0.65" />
        <circle cx="604" cy="104" r="1.2" fill="#C99BFF" opacity="0.7" />
        <circle cx="692" cy="172" r="1" fill="#FFD36B" opacity="0.65" />
        <circle cx="568" cy="268" r="1.3" fill="#7FE9FF" opacity="0.7" />
      </svg>

      <header className="kiosk-stage-header">
        <button type="button" className="kiosk-nav-back cr-back" onClick={onBack}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </button>
      </header>

      <div className="cr-body">
        <img className="cr-logo" src={logo} alt="AI Photo Booth Co" />

        <div className="cr-headline">
          <span className="cr-headline__line cr-headline__line--plain">POSITION</span>
          <span className="cr-headline__line cr-headline__line--grad">YOURSELF</span>
          <span className="cr-headline__script">Carefully</span>
        </div>

        <div className="cr-divider" aria-hidden>
          <span className="cr-divider__star">
            <svg viewBox="0 0 24 24"><path d="M12 0 L13.6 9.4 L24 12 L13.6 14.6 L12 24 L10.4 14.6 L0 12 L10.4 9.4 Z" fill="currentColor" /></svg>
          </span>
        </div>

        <ul className="cr-list" aria-label="Positioning instructions">
          {INSTRUCTIONS.map((item, i) => (
            <li key={i} className="cr-row">
              <span className="cr-row__icon" aria-hidden>{item.icon}</span>
              <span className="cr-row__text">{item.body}</span>
            </li>
          ))}
        </ul>

        <div className="cr-diagrams">
          <div className="cr-diagram">
            <div className="cr-diagram__label cr-diagram__label--distance">DISTANCE</div>
            <svg className="cr-diagram__art" viewBox="0 0 200 90" fill="none" aria-hidden>
              <rect x="16" y="12" width="20" height="62" rx="4" stroke="#7B2CFF" strokeWidth="2" />
              <line x1="26" y1="20" x2="26" y2="66" stroke="#00E6FF" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="46" y1="45" x2="150" y2="45" stroke="#EAEAEA" strokeWidth="1.6" strokeDasharray="5 5" opacity="0.85" />
              <path d="M46 45l7-4.5m-7 4.5 7 4.5M150 45l-7-4.5m7 4.5-7 4.5" stroke="#EAEAEA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
              {personFull(172, 82, 0.72, '#FF6B9A', 2.4)}
            </svg>
            <div className="cr-diagram__cap">1 METER</div>
          </div>

          <div className="cr-diagram__sep" aria-hidden />

          <div className="cr-diagram">
            <div className="cr-diagram__label cr-diagram__label--framing">FRAMING</div>
            <svg className="cr-diagram__art" viewBox="0 0 200 90" fill="none" aria-hidden>
              <path d="M20 30v-8a3 3 0 0 1 3-3h9" stroke="#FFB800" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M168 19h9a3 3 0 0 1 3 3v8" stroke="#00E6FF" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M20 62v8a3 3 0 0 0 3 3h9" stroke="#7B2CFF" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M180 62v8a3 3 0 0 1-3 3h-9" stroke="#00E6FF" strokeWidth="2.4" strokeLinecap="round" />
              {personBust(60, 74, 0.64, '#00E6FF', 2.2)}
              {personBust(84, 74, 0.64, '#FF6B9A', 2.2)}
              {personBust(108, 74, 0.64, '#B14CFF', 2.2)}
              {personBust(132, 74, 0.64, '#00E6FF', 2.2)}
            </svg>
            <div className="cr-diagram__cap">MAX 4 PEOPLE</div>
          </div>
        </div>

        <div className="cr-countdown" aria-live="polite" aria-atomic="true">
          <span className="cr-countdown__label">STARTING IN</span>
          <span className="cr-countdown__num" key={count}>{count}</span>
          <span className="cr-countdown__label">SEC</span>
        </div>
      </div>
    </div>
  );
}
