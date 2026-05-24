import React, { useCallback, useEffect, useRef, useState } from 'react';

const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1000;

export function CameraScreen({ onCapture, onBack }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const previewStartedRef = useRef(false);
  const countdownRunRef = useRef(0);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1620 },
            height: { ideal: 1320 },
            aspectRatio: { ideal: 1620 / 1320 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          const el = videoRef.current;
          el.srcObject = stream;
          await el.play();
        }
      } catch (e) {
        if (!cancelled) setError('camera');
      }
    })();
    return () => {
      cancelled = true;
      setStreamReady(false);
      previewStartedRef.current = false;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let ctx = null;
    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        if (!ctx) ctx = canvas.getContext('2d', { alpha: false });
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          ctx = canvas.getContext('2d', { alpha: false });
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(video, 0, 0, w, h);
        if (!previewStartedRef.current) {
          previewStartedRef.current = true;
          setStreamReady(true);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !streamReady) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Visible viewport shown to user: 1620×1320
    const viewW = 1620;
    const viewH = 1320;

    // Image sent to API: center crop of the viewport — 1080×1320 (portrait)
    const outW = 1080;
    const outH = 1320;

    // Scale video to cover the full 1620×1320 visible frame
    const scale = Math.max(viewW / vw, viewH / vh);
    const scaledW = vw * scale;
    const scaledH = vh * scale;

    // Center the scaled video within the 1620×1320 frame
    const dxView = (viewW - scaledW) / 2;
    const dyView = (viewH - scaledH) / 2;

    // Crop offset: take the center 1080px horizontally (270px from each side)
    const cropX = (viewW - outW) / 2; // = 270
    const cropY = (viewH - outH) / 2; // = 0

    // Draw into the 1080×1320 canvas shifted by the crop offset
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(video, 0, 0, vw, vh, dxView - cropX, dyView - cropY, scaledW, scaledH);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    onCapture(dataUrl);
  }, [onCapture, streamReady]);

  useEffect(() => {
    if (count <= 0) return undefined;
    const myId = countdownRunRef.current;
    const id = setTimeout(() => {
      if (myId !== countdownRunRef.current) return;
      if (count > 1) {
        setCount(count - 1);
      } else {
        setCount(0);
        snap();
      }
    }, COUNTDOWN_STEP_MS);
    return () => clearTimeout(id);
  }, [count, snap]);

  const startCountdown = useCallback(() => {
    if (!streamReady || count > 0) return;
    countdownRunRef.current += 1;
    setCount(COUNTDOWN_FROM);
  }, [streamReady, count]);

  if (error === 'camera') {
    return (
      <div className="camera-screen camera-screen--error">
        <p className="camera-screen__error-copy">Camera unavailable. Check permissions and try again.</p>
        <button type="button" className="btn btn-primary" onClick={onBack}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="camera-screen">
      <header className="kiosk-stage-header">
        <button type="button" className="kiosk-nav-back" onClick={onBack}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </button>
      </header>

      <div className="camera-screen__main">
        <div className="camera-screen__viewport kiosk-flow-viewport">
          <div className="kiosk-portrait-frame kiosk-flow-frame">
            <div className="camera-wrap">
              <div className="camera-wrap__sink" aria-hidden />
              <video
                ref={videoRef}
                playsInline
                muted
                disablePictureInPicture
                disableRemotePlayback
                className="camera-wrap__video"
                aria-hidden
              />
              <canvas ref={canvasRef} className="camera-wrap__preview" aria-hidden />
              <div className="camera-frame-hint" aria-hidden />
              {count > 0 ? (
                <div className="camera-countdown" aria-live="polite" aria-atomic="true">
                  <div key={count} className="camera-countdown__sparkles" aria-hidden>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <svg
                        key={n}
                        className={`camera-countdown__sparkle camera-countdown__sparkle--s${n}`}
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          d="M12 0 L13.6 9.4 L24 12 L13.6 14.6 L12 24 L10.4 14.6 L0 12 L10.4 9.4 Z"
                          fill="currentColor"
                        />
                      </svg>
                    ))}
                  </div>
                  <span key={`d${count}`} className="camera-countdown__digit">
                    {count}
                  </span>
                </div>
              ) : null}
              <div className="camera-wrap__controls">
                <button
                  type="button"
                  className={`camera-shutter${count > 0 ? ' camera-shutter--counting' : ''}`}
                  onClick={startCountdown}
                  disabled={count > 0 || !streamReady}
                  aria-label={
                    count > 0
                      ? 'Countdown in progress'
                      : streamReady
                        ? 'Capture photo'
                        : 'Camera starting'
                  }
                >
                  <span className="camera-shutter__ring" aria-hidden />
                  <span className="camera-shutter__disc" aria-hidden />
                </button>
                <p className="camera-shutter__status" aria-live="polite">
                  {count > 0 ? 'Hold still…' : !streamReady ? 'Starting camera…' : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
