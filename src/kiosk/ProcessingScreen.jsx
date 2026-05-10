import React, { useEffect, useRef } from 'react';
import { compositePortrait } from '../utils/composite.js';
import processingVideoUrl from './processingVideoMedia.js';

/** Wait until the processing clip finishes (ended), with duration-based + hard timeouts as fallbacks. */
function waitForProcessingVideo(video) {
  return new Promise((resolve) => {
    if (!video) {
      resolve();
      return;
    }

    let settled = false;
    let timeoutId;
    let hardCapId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      clearTimeout(hardCapId);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onErr);
    };

    const done = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onEnded = () => done();
    const onErr = () => done();

    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onErr);

    const armFallback = () => {
      const d = video.duration;
      const ms =
        Number.isFinite(d) && d > 0
          ? Math.min(120_000, Math.ceil((d + 1) * 1000))
          : 15_000;
      timeoutId = setTimeout(done, ms);
    };

    if (video.readyState >= 1) {
      armFallback();
    } else {
      video.addEventListener('loadedmetadata', armFallback, { once: true });
    }

    hardCapId = setTimeout(done, 125_000);

    if (video.ended) done();
  });
}

export function ProcessingScreen({ subjectDataUrl, template, onDone }) {
  const videoRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const video = videoRef.current;
      if (video) {
        video.muted = true;
        video.currentTime = 0;
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }

      const compositePromise = compositePortrait({
        subjectDataUrl,
        template,
      }).catch(() => subjectDataUrl);

      await waitForProcessingVideo(video);
      if (!alive) return;

      const url = await compositePromise;
      if (!alive) return;
      onDone(url);
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
