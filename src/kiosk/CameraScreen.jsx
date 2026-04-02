import React, { useCallback, useEffect, useRef, useState } from 'react';

export function CameraScreen({ countdownSec, onCapture, onBack }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const countTimerRef = useRef(null);
  const previewStartedRef = useRef(false);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(null);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
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

  // Never show raw <video> — Chromium/Electron paints grey + camera icon on the element surface.
  // Keep video hidden and mirror frames to a canvas (black until frames arrive).
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

  useEffect(
    () => () => {
      if (countTimerRef.current) clearInterval(countTimerRef.current);
    },
    [],
  );

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !streamReady) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    onCapture(dataUrl);
  }, [onCapture, streamReady]);

  const runCountdown = useCallback(() => {
    if (countTimerRef.current) clearInterval(countTimerRef.current);
    let n = countdownSec;
    setCount(n);
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        countTimerRef.current = null;
        setCount(null);
        snap();
      } else {
        setCount(n);
      }
    }, 1000);
    countTimerRef.current = id;
  }, [countdownSec, snap]);

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
              <div className="camera-wrap__controls">
                <button
                  type="button"
                  className={`camera-shutter${count !== null ? ' camera-shutter--counting' : ''}`}
                  onClick={runCountdown}
                  disabled={count !== null || !streamReady}
                  aria-label={
                    count !== null
                      ? 'Hold still, capturing'
                      : streamReady
                        ? 'Capture photo'
                        : 'Camera starting'
                  }
                >
                  <span className="camera-shutter__ring" aria-hidden />
                  <span className="camera-shutter__disc" aria-hidden />
                </button>
                <p className="camera-shutter__status" aria-live="polite">
                  {count !== null ? 'Hold still…' : !streamReady ? 'Starting camera…' : ''}
                </p>
              </div>
              {count !== null ? (
                <div className="countdown-overlay">
                  <span className="countdown-overlay__num">{count}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
