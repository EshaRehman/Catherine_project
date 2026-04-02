import React from 'react';

export function ResultScreen({ imageUrl, onQR, onRegenerate }) {
  return (
    <div className="result-screen">
      <div className="result-screen__column">
        <div className="result-screen__viewport">
          <div className="kiosk-portrait-frame kiosk-portrait-frame--result">
            <img className="kiosk-portrait-frame__media" src={imageUrl} alt="" />
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
