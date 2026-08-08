import React, { useEffect, useRef, useState } from 'react';
import { generateImage } from '../utils/api.js';
import { compositeResultPreview } from '../utils/composite.js';
import processingVideoUrl from './processingVideoMedia.js';

/** Must match the longest transition on .kiosk-portrait-frame__reveal in index.css. */
const REVEAL_MS = 1400;

/**
 * Recognises the one generate failure that is the guest's to fix: YOLO found
 * nobody in the frame. Matches the 400 detail raised by
 * routes/generate.py ("No people detected in the uploaded image"); the wording
 * is deliberately matched loosely so a reworded message still lands here.
 *
 * Every other failure (ComfyUI down, OpenAI error, bad template) is not
 * something retrying will fix, so those keep the existing behaviour rather than
 * bouncing the guest round the camera loop forever.
 */
const isNoPersonError = (error) =>
  typeof error === 'string' && /no\s+(?:people|person|persons)\s+detected/i.test(error);

export function ProcessingScreen({ subjectDataUrl, template, eventId, onDone, onNoPerson }) {
  const videoRef = useRef(null);
  const timerRef = useRef(null);

  // The finished picture is shown here first and cross-dissolved over the
  // animation; only once that has played do we hand off to ResultScreen, which
  // then mounts already showing the same image, so there is no cut.
  const [revealUrl, setRevealUrl] = useState(null);
  const [revealed, setRevealed] = useState(false);

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

    /** Cross-dissolve to `url`, then hand off. */
    const reveal = async (url, cloudinaryUrl) => {
      // Decode before showing it: painting an undecoded image mid-transition
      // stutters the fade, and on a slow decode the frame flashes empty.
      try {
        const img = new Image();
        img.src = url;
        if (img.decode) await img.decode();
      } catch {
        /* fall through — a decode failure shouldn't strand the guest */
      }
      if (!alive) return;

      setRevealUrl(url);
      // Two frames: one to mount at opacity 0, one to let the browser register
      // that start value before we flip it, or the transition never runs.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (alive) setRevealed(true);
        });
      });

      timerRef.current = setTimeout(() => {
        if (!alive) return;
        if (video) { video.loop = false; video.pause(); }
        onDone(url, cloudinaryUrl);
      }, REVEAL_MS);
    };

    const run = async () => {
      const result = await generateImage(subjectDataUrl, templateId, eventId);
      if (!alive) return;

      if (result.ok && result.data?.output_image_base64) {
        const base64 = result.data.output_image_base64;
        const rawUrl = base64.startsWith('data:')
          ? base64
          : `data:image/png;base64,${base64}`;

        let finalUrl = rawUrl;
        try {
          finalUrl = await compositeResultPreview(rawUrl, template, 1080, 1320);
        } catch {
          finalUrl = rawUrl;
        }
        if (!alive) return;

        await reveal(finalUrl, result.data.cloudinary_url || null);
      } else {
        console.error('[ProcessingScreen] generate failed:', result.error);
        if (video) { video.loop = false; video.pause(); }

        if (isNoPersonError(result.error) && onNoPerson) {
          // Nothing was generated, so there is no picture to reveal. Handing
          // subjectDataUrl to onDone here is what made the kiosk present the
          // guest's own untouched photo as the finished result.
          onNoPerson();
          return;
        }
        onDone(subjectDataUrl, null);
      }
    };

    run();

    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [subjectDataUrl, template, onDone, onNoPerson]);

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
          <div
            className={`kiosk-portrait-frame kiosk-flow-frame kiosk-portrait-frame--processing${
              revealed ? ' is-revealing' : ''
            }`}
          >
            <video
              ref={videoRef}
              className="kiosk-portrait-frame__media kiosk-portrait-frame__loop"
              src={processingVideoUrl}
              autoPlay
              loop
              muted
              playsInline
              aria-hidden
            />
            {revealUrl && (
              <img
                className={`kiosk-portrait-frame__reveal${revealed ? ' is-in' : ''}`}
                src={revealUrl}
                alt=""
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
