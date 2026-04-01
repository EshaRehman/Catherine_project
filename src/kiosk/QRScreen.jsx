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
      <p style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', color: 'var(--ink)' }}>
        Scan to save
      </p>
      <div className="qr-box">
        <QRCodeSVG value={payload} size={280} level="M" />
      </div>
      <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
        This window will close automatically.
      </p>
      <button type="button" className="btn btn-ghost" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
