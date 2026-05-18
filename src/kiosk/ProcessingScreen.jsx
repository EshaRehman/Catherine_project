import React, { useEffect, useRef } from 'react';
import { generateImage } from '../utils/api.js';
import processingVideoUrl from './processingVideoMedia.js';

export function ProcessingScreen({ subjectDataUrl, template, onDone }) {
  const videoRef = useRef(null);

  useEffect(() => {
    let alive = true;

    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.loop = true;  // keep looping while API is working
      video.currentTime = 0;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }

    // templateId is stored on the template object — use templateId (DB key) or id
    const templateId = template?.templateId || template?.id;

    const run = async () => {
      const result = await generateImage(subjectDataUrl, templateId);
      if (!alive) return;

      if (result.ok && result.data?.output_image_base64) {
        // API returned a base64 image — prefix it as a data URL
        const base64 = result.data.output_image_base64;
        const finalUrl = base64.startsWith('data:')
          ? base64
          : `data:image/png;base64,${base64}`;
        
        // Stop the looping video cleanly
        if (video) { video.loop = false; video.pause(); }
        onDone(finalUrl);
      } else {
        // On error, fall back to the raw captured photo
        console.error('[ProcessingScreen] generate failed:', result.error);
        if (video) { video.loop = false; video.pause(); }
        onDone(subjectDataUrl);
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
            <video
              ref={videoRef}
              className="kiosk-portrait-frame__media"
              src={processingVideoUrl}
              autoPlay
              loop
              muted
              playsInline
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}
