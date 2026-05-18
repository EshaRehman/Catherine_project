import React from 'react';

/** Final generated image stage; falls back to template plate only if needed. */
export function ResultScreen({ imageDataUrl, template, onQR, onRegenerate }) {
  const pc = template?.previewClass || 'tpl-preview--thrones';
  const url = imageDataUrl || template?.backgroundUrl;

  return (
    <div className="result-screen">
      <header className="kiosk-stage-header" aria-hidden="true">
        <span className="kiosk-nav-back kiosk-nav-back--layout-only" tabIndex={-1}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </span>
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
              className="result-regen"
              onClick={onRegenerate}
              aria-label="Regenerate"
              title="Regenerate"
            >
              <svg
                className="result-regen__icon"
                viewBox="0 0 24 24"
                aria-hidden
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="result-actions">
          <button type="button" className="kiosk-tap kiosk-tap--qr" onClick={onQR}>
            <span className="kiosk-tap__shine" aria-hidden />
            QR code
          </button>
        </div>
      </div>
    </div>
  );
}
