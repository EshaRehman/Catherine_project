import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export function QRScreen({ payload, onDone }) {
  return (
    <div className="qr-screen">
      <div className="qr-screen__inner">
        <h1 className="qr-screen__title">Scan to save</h1>
        <p className="qr-screen__subtitle">
          Point your phone camera at the code, then tap the link to download your photo.
        </p>
        <div className="qr-box qr-box--large">
          <QRCodeSVG value={payload} size={420} level="M" />
        </div>
        <button
          type="button"
          className="kiosk-tap kiosk-tap--qr-done"
          onClick={onDone}
        >
          <span className="kiosk-tap__shine" aria-hidden />
          Done
        </button>
      </div>
    </div>
  );
}
