import React, { useEffect } from 'react';
import { compositePortrait } from '../utils/composite.js';

export function ProcessingScreen({ subjectDataUrl, template, onDone }) {
  useEffect(() => {
    let alive = true;
    const run = async () => {
      await new Promise((r) => setTimeout(r, 1800));
      if (!alive) return;
      try {
        const url = await compositePortrait({
          subjectDataUrl,
          template,
        });
        if (alive) onDone(url);
      } catch {
        if (alive) onDone(subjectDataUrl);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [subjectDataUrl, template, onDone]);

  return (
    <div className="camera-screen camera-screen--processing">
      <header className="kiosk-stage-header" aria-hidden="true">
        <span className="kiosk-nav-back kiosk-nav-back--layout-only" tabIndex={-1}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </span>
      </header>
      <div className="camera-screen__main">
        <div className="camera-screen__viewport kiosk-flow-viewport">
          <div className="kiosk-portrait-frame kiosk-flow-frame kiosk-portrait-frame--processing">
            <div className="processing-viewfinder">
              <div className="processing-orbit" aria-hidden />
              <p className="processing-copy">Creating your transformation…</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
