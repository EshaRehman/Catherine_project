import React, { useEffect } from 'react';
import { KioskHeaderTrailing } from './KioskHeaderTrailing.jsx';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from '../constants/outputFormat.js';
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
          width: OUTPUT_WIDTH,
          height: OUTPUT_HEIGHT,
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
      <header className="kiosk-stage-header kiosk-stage-header--split">
        <span className="kiosk-nav-back kiosk-nav-back--layout-only" aria-hidden="true" tabIndex={-1}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </span>
        <KioskHeaderTrailing />
      </header>
      <div className="camera-screen__main">
        <div className="camera-screen__viewport kiosk-flow-viewport">
          <div className="kiosk-portrait-frame kiosk-flow-frame kiosk-portrait-frame--processing">
            <div className="processing-viewfinder">
              <span className="processing-viewfinder__ambient" aria-hidden />
              <div className="processing-orbit" aria-hidden />
              <p className="processing-copy">
                <span className="processing-copy__plain">Generating your </span>
                <span className="text-brand-gradient">portrait</span>
                <span className="processing-copy__plain">…</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
