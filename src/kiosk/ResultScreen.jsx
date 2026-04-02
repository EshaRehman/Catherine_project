import React from 'react';

/** Template art only (not composite). Layout matches camera/processing so the frame stays put. */
export function ResultScreen({ template, onQR, onRegenerate }) {
  const pc = template?.previewClass || 'tpl-preview--thrones';
  const url = template?.backgroundUrl;

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
          </div>
        </div>
        <div className="result-bar result-bar--two">
          <button type="button" className="btn btn-ghost result-bar__btn" onClick={onRegenerate}>
            Regenerate
          </button>
          <button type="button" className="btn btn-primary result-bar__btn" onClick={onQR}>
            QR code
          </button>
        </div>
      </div>
    </div>
  );
}
