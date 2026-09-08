import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/* A QR code tops out at a few kilobytes. The upstream fallback for a failed
   upload is the composited image itself, which is a several-hundred-kilobyte
   data: URL — encoding that produces either a thrown error or a code no phone
   can read. Only a real link is worth drawing. */
const isScannableLink = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

export function QRScreen({ payload, onDone }) {
  const scannable = isScannableLink(payload);

  return (
    <div className="qr-screen">
      <button
        type="button"
        className="kiosk-tap kiosk-tap--qr-done"
        onClick={onDone}
      >
        <span className="kiosk-tap__shine" aria-hidden />
        Done
      </button>
      <div className="qr-screen__inner">
        <h1 className="qr-screen__title">{scannable ? 'Scan to save' : 'Photo saved'}</h1>
        <p className="qr-screen__subtitle">
          {scannable
            ? 'Point your phone camera at the code, then tap the link to download your photo.'
            : 'Your photo is safely stored with the booth. Ask the host for a copy — a phone download is not available right now.'}
        </p>
        {scannable ? (
          <div className="qr-box qr-box--large">
            <QRCodeSVG value={payload} size={420} level="M" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
