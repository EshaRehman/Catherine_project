import React, { useEffect, useRef, useState } from 'react';
import { finalizeImage, generateImage } from '../utils/api.js';
import { compositeResultPreview } from '../utils/composite.js';
import processingVideoUrl from './processingVideoMedia.js';

/** Must match the longest transition on .kiosk-portrait-frame__reveal in index.css. */
const REVEAL_MS = 1400;

/* Cap on how long the guest waits for the branded re-upload. It runs alongside
   the reveal animation, so in practice it has a 1.4s head start and adds
   nothing; this only bites when the venue's uplink is struggling, and then a
   slightly-wrong download beats a booth that appears to have frozen. */
const FINALIZE_TIMEOUT_MS = 10_000;

/** Does this template actually paint anything over the AI output? */
const templateHasOverlay = (template) =>
  Boolean(
    (template?.overlayText && String(template.overlayText).trim()) || template?.logoUrl,
  );

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'timeout' }), ms)),
  ]);

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

  /* Held in refs, and deliberately kept out of the effect's dependency list.
     The parent passes these as inline arrows, so every parent re-render gives
     them fresh identities; with them in the deps, any such re-render tore down
     the in-flight request and started a *second* generation — a wasted minute
     of GPU time, and the first result silently discarded. The generation must
     be tied to the capture it is for, nothing else. */
  const onDoneRef = useRef(onDone);
  const onNoPersonRef = useRef(onNoPerson);
  useEffect(() => {
    onDoneRef.current = onDone;
    onNoPersonRef.current = onNoPerson;
  }, [onDone, onNoPerson]);

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

    /**
     * Cross-dissolve to `url`, then hand off.
     *
     * `pendingDownload` is the branded re-upload, still in flight. It is
     * resolved at the end of the reveal rather than before it so the upload
     * overlaps the animation the guest is already watching.
     */
    const reveal = async (url, pendingDownload, fallbackUrl) => {
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

      timerRef.current = setTimeout(async () => {
        if (!alive) return;
        if (video) { video.loop = false; video.pause(); }

        let downloadUrl = fallbackUrl;
        if (pendingDownload) {
          const res = await withTimeout(pendingDownload, FINALIZE_TIMEOUT_MS);
          if (res?.ok && res.data?.cloudinary_url) {
            downloadUrl = res.data.cloudinary_url;
          } else {
            /* Loud on purpose. The guest still gets a scannable code, but it
               points at the un-branded original — the operator needs to see
               this in the log rather than discover it from a customer. */
            console.error(
              '[ProcessingScreen] branded upload failed; QR will serve the un-branded image:',
              res?.error,
            );
          }
        }

        if (!alive) return;
        onDoneRef.current(url, downloadUrl);
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
        let composited = false;
        try {
          finalUrl = await compositeResultPreview(rawUrl, template, 1080, 1350);
          composited = true;
        } catch (err) {
          /* This used to swallow the error and hand back the bare AI output,
             which looks exactly like "the template has no branding" — the
             guest gets an unbranded picture and nothing anywhere says why. */
          console.error(
            '[ProcessingScreen] branding composite FAILED — guest gets the un-branded AI output:',
            err,
          );
          finalUrl = rawUrl;
        }

        /* The other way branding goes missing, and the quieter one: the
           template genuinely carries no caption and no logo, so there is
           nothing to paint. Says so out loud, with the values, because from
           the guest's side it is indistinguishable from the failure above. */
        if (!templateHasOverlay(template)) {
          console.warn(
            `[ProcessingScreen] template "${template?.name || '?'}" has no branding to paint —`,
            'overlayText:', JSON.stringify(template?.overlayText ?? null),
            '| logoUrl:', template?.logoUrl
              ? `${String(template.logoUrl).slice(0, 48)}… (${String(template.logoUrl).length} chars)`
              : null,
            '— if you set these in the template editor, the kiosk is holding a stale copy.',
          );
        }
        if (!alive) return;

        /* The server uploaded the bare AI output; the logo and caption were
           only just painted on, here. Send the composite back so the URL in
           the QR code resolves to the picture the guest is looking at. Skipped
           when the template has no overlay, since the two would be identical
           and the upload would be pure latency. */
        const eventCount = result.data.event_count;
        const needsBranding =
          composited && templateHasOverlay(template) && Boolean(eventId) && eventCount > 0;

        const pendingDownload = needsBranding
          ? finalizeImage({ eventId, eventCount, imageBase64: finalUrl }).catch((err) => ({
              ok: false,
              error: err?.message || 'finalize failed',
            }))
          : null;

        await reveal(finalUrl, pendingDownload, result.data.cloudinary_url || null);
      } else {
        console.error('[ProcessingScreen] generate failed:', result.error);
        if (video) { video.loop = false; video.pause(); }

        if (isNoPersonError(result.error) && onNoPersonRef.current) {
          // Nothing was generated, so there is no picture to reveal. Handing
          // subjectDataUrl to onDone here is what made the kiosk present the
          // guest's own untouched photo as the finished result.
          onNoPersonRef.current();
          return;
        }
        onDoneRef.current(subjectDataUrl, null);
      }
    };

    run();

    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    /* onDone/onNoPerson intentionally absent - see the refs above. */
  }, [subjectDataUrl, template, eventId]);

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
