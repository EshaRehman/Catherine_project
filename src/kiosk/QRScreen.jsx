import React, { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const AUTO_MS = 12000;

export function QRScreen({ payload, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, AUTO_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="qr-screen">
      <p className="qr-screen__lead">
        <span className="qr-screen__lead-muted">Scan to </span>
        <span className="text-brand-gradient">save</span>
      </p>
      <div className="qr-box">
        <QRCodeSVG value={payload} size={280} level="M" />
      </div>
      <p className="qr-screen__sub">This window will close automatically.</p>
      <button type="button" className="btn btn-ghost" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
