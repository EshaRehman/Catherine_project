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
        <div className="result-actions result-actions--split">
          <button
            type="button"
            className="result-choice result-choice--regen"
            onClick={onRegenerate}
          >
            <span className="result-choice__emoji" aria-hidden>🙁</span>
            <span className="result-choice__label">Try again</span>
          </button>
          <button
            type="button"
            className="result-choice result-choice--proceed"
            onClick={onQR}
          >
            <span className="result-choice__emoji" aria-hidden>😊</span>
            <span className="result-choice__label">Save photo</span>
          </button>
        </div>
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
      </div>
    </div>
  );
}
