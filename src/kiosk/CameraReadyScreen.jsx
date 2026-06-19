import React, { useEffect, useState } from 'react';

const COUNTDOWN_FROM = 8;

const INSTRUCTIONS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    text: 'Stand in the center of the frame',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
    text: 'Face the camera, full face visible',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.5 2 3 5 3 8h18c0-3-3.5-6-9-6z" />
        <path d="M3 8h18v2H3z" />
        <circle cx="12" cy="14" r="4" />
      </svg>
    ),
    text: 'Remove hats or anything covering your face',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    text: 'Everyone fit inside the frame',
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
    <div className="camera-ready-screen">
      <header className="kiosk-stage-header">
        <button type="button" className="kiosk-nav-back" onClick={onBack}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </button>
      </header>

      <div className="camera-ready-screen__body">
        <h1 className="camera-ready-screen__title">
          GET READY FOR <span className="camera-ready-screen__title-highlight">YOUR PHOTO</span>
        </h1>

        <ul className="camera-ready-screen__instructions" aria-label="Photo tips">
          {INSTRUCTIONS.map((item, i) => (
            <li key={i} className="camera-ready-screen__instruction">
              <span className="camera-ready-screen__instruction-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="camera-ready-screen__instruction-text">{item.text}</span>
            </li>
          ))}
        </ul>

        <p className="camera-ready-screen__countdown" aria-live="polite" aria-atomic="true">
          Starting in{' '}
          <span className="camera-ready-screen__count" key={count}>
            {count}
          </span>{' '}
          seconds…
        </p>
      </div>
    </div>
  );
}
