import React, { useEffect, useRef } from 'react';
import retryVideoUrl from './retryVideoMedia.js';

/**
 * Plays the retry clip once, then hands off to the camera.
 *
 * Used for both routes back to the camera:
 *   - the guest pressing "Try again" on the result
 *   - a capture the AI rejected because it found nobody in the frame
 *
 * The clip plays in full — `ended` is what advances the flow. It used to be
 * capped at 3.2s on the assumption 8s was too long to stand still, but that cut
 * the animation off mid-play, so the guest saw it jump to the camera partway
 * through.
 *
 * The timeout is now only a safety net for the cases where `ended` never
 * arrives: autoplay refused, decode failure, a stalled buffer. It is derived
 * from the clip's real duration once metadata loads (plus a margin for slow
 * decode), so it can never fire before the clip has genuinely finished.
 * FALLBACK_MS covers the window before metadata is known — and if the file is
 * missing entirely, `error` fires immediately anyway. The kiosk must never
 * strand a guest on a still frame, so onDone is guaranteed to fire either way.
 */
const FALLBACK_MS = 12000;
const SAFETY_MARGIN_MS = 2000;

export function RetryTransitionScreen({ onDone }) {
  const videoRef = useRef(null);
  const doneRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    // Guard so `ended` and the safety timeout cannot both advance the flow.
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };

    const arm = (ms) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(finish, ms);
    };

    // Once the real duration is known, push the net out past the end of the
    // clip so it can only ever catch a playback that never finishes.
    const onMeta = () => {
      const d = videoRef.current?.duration;
      if (Number.isFinite(d) && d > 0) arm(d * 1000 + SAFETY_MARGIN_MS);
    };

    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.loop = false;
      video.currentTime = 0;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      video.addEventListener('ended', finish);
      video.addEventListener('error', finish);
      video.addEventListener('loadedmetadata', onMeta);
      // Metadata may already be in place if the clip was cached.
      if (video.readyState >= 1) onMeta();
    }

    arm(FALLBACK_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (video) {
        video.removeEventListener('ended', finish);
        video.removeEventListener('error', finish);
        video.removeEventListener('loadedmetadata', onMeta);
        video.pause();
      }
    };
  }, [onDone]);

  /* Same shell as ProcessingScreen — .camera-screen + .kiosk-flow-viewport +
     .kiosk-flow-frame — so the clip plays in the identical portrait box, at the
     identical size and screen position. It used to run full-bleed, which made
     the flow jump from a framed stage to an edge-to-edge video and back. The
     header is layout-only (no live Back control) exactly as on the processing
     stage, purely so the frame sits in the same slot. */
  return (
    <div className="camera-screen camera-screen--retry">
      <header className="kiosk-stage-header" aria-hidden="true">
        <span className="kiosk-nav-back kiosk-nav-back--layout-only" tabIndex={-1}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </span>
      </header>
      <div className="camera-screen__main">
        <div className="camera-screen__viewport kiosk-flow-viewport">
          <div className="kiosk-portrait-frame kiosk-flow-frame kiosk-portrait-frame--retry">
            <video
              ref={videoRef}
              className="kiosk-portrait-frame__media"
              src={retryVideoUrl}
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
