import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { KioskHeaderTrailing } from './KioskHeaderTrailing.jsx';

/** Larger QR for distance scanning; level H for readability at size. */
const QR_SIZE = 336;

export function QRScreen({ payload, onDone }) {
  return (
    <div className="qr-screen">
      <header className="kiosk-stage-header kiosk-stage-header--end qr-screen__header">
        <KioskHeaderTrailing />
      </header>
      <div className="qr-screen__main">
        <div className="qr-screen__stack">
          <h1 className="qr-screen__title">
            Scan to <span className="text-brand-gradient">save</span>
          </h1>
          <div className="qr-box">
            <QRCodeSVG value={payload} size={QR_SIZE} level="H" />
          </div>
          <button type="button" className="btn btn-primary qr-screen__done" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
