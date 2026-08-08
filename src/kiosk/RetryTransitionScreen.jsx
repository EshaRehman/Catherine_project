import React, { useEffect, useRef } from 'react';
import retryVideoUrl from './retryVideoMedia.js';

/**
 * Plays the retry clip once, then hands off to the camera.
 *
 * Used for both routes back to the camera:
 *   - the guest pressing "Try again" on the result
 *   - a capture the AI rejected because it found nobody in the frame
 *
 * The clip is 8s, which is a long time to stand still, so playback is capped:
 * whichever comes first, `ended` or MAX_MS, advances the flow. The cap also
 * covers the case where autoplay is refused or the file fails to decode — the
 * kiosk must never strand a guest on a still frame, so onDone is guaranteed to
 * fire.
 */
const MAX_MS = 3200;

export function RetryTransitionScreen({ onDone }) {
  const videoRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    // Guard so `ended` and the timeout cannot both advance the flow.
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
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
    }

    const timer = setTimeout(finish, MAX_MS);

    return () => {
      clearTimeout(timer);
      if (video) {
        video.removeEventListener('ended', finish);
        video.removeEventListener('error', finish);
        video.pause();
      }
    };
  }, [onDone]);

  return (
    <div className="kiosk-retry-screen">
      <video
        ref={videoRef}
        className="kiosk-retry-screen__media"
        src={retryVideoUrl}
        autoPlay
        muted
        playsInline
        aria-hidden
      />
    </div>
  );
}
