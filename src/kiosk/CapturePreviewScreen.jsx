import React from 'react';

export function CapturePreviewScreen({ subjectDataUrl }) {
  return (
    <div className="camera-screen camera-screen--captured">
      <header className="kiosk-stage-header" aria-hidden="true">
        <span className="kiosk-nav-back kiosk-nav-back--layout-only" tabIndex={-1}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </span>
      </header>
      <div className="camera-screen__main">
        <div className="camera-screen__viewport kiosk-flow-viewport">
          <div className="kiosk-portrait-frame kiosk-flow-frame kiosk-portrait-frame--captured">
            <img className="kiosk-portrait-frame__media" src={subjectDataUrl} alt="" />
            <div className="capture-preview-badge" aria-live="polite">
              Photo captured
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
