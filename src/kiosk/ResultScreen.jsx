import React from 'react';
import { KioskHeaderTrailing } from './KioskHeaderTrailing.jsx';

function RegenerateIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 20v-6h6M3.51 9a9 9 0 1 1 2.12 9.36L1 14"
      />
    </svg>
  );
}

/** Template art only (not composite). Layout matches camera/processing so the frame stays put. */
export function ResultScreen({ template, onQR, onRegenerate }) {
  const pc = template?.previewClass || 'tpl-preview--thrones';
  const url = template?.backgroundUrl;

  return (
    <div className="result-screen">
      <header className="kiosk-stage-header kiosk-stage-header--split">
        <span className="kiosk-nav-back kiosk-nav-back--layout-only" aria-hidden="true" tabIndex={-1}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </span>
        <KioskHeaderTrailing />
      </header>
      <div className="result-screen__main">
        <div className="result-screen__viewport kiosk-flow-viewport">
          <div className="kiosk-portrait-frame kiosk-flow-frame kiosk-portrait-frame--result">
            {url ? (
              <img className="kiosk-portrait-frame__media" src={url} alt="" />
            ) : (
              <div className={`kiosk-portrait-frame__media kiosk-portrait-frame__plate ${pc}`} />
            )}
            <div className="kiosk-portrait-frame__result-shade" aria-hidden />
            <button
              type="button"
              className="result-frame__regen"
              onClick={onRegenerate}
              aria-label="Regenerate portrait"
            >
              <RegenerateIcon className="result-frame__regen-icon" />
            </button>
          </div>
        </div>
        <div className="result-bar result-bar--result-actions">
          <button type="button" className="btn btn-primary result-bar__btn result-bar__btn--primary" onClick={onQR}>
            QR Code
          </button>
        </div>
      </div>
    </div>
  );
}
