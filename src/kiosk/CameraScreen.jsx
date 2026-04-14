import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from '../constants/outputFormat.js';
import countdownRobotArt from '../assets/Robot with camera and vibrant logo.png';
import { drawVideoCenterCropToCanvas } from '../utils/drawVideoToOutputFormat.js';

const CAMERA_ORBIT_RX = 24; /* keep in sync with --radius-lg */

export function CameraScreen({ countdownSec, onCapture, onBack }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const countTimerRef = useRef(null);
  const orbitFrameRef = useRef(null);
  const previewStartedRef = useRef(false);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(null);
  const [streamReady, setStreamReady] = useState(false);
  const [orbitDims, setOrbitDims] = useState({ w: 0, h: 0, rx: CAMERA_ORBIT_RX });

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
    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        const drawn = drawVideoCenterCropToCanvas(video, canvas, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        if (drawn && !previewStartedRef.current) {
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

  useLayoutEffect(() => {
    const el = orbitFrameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const read = () => {
      const w = Math.max(1, el.offsetWidth);
      const h = Math.max(1, el.offsetHeight);
      const cs = getComputedStyle(el);
      const rPx = parseFloat(cs.borderTopLeftRadius || `${CAMERA_ORBIT_RX}`);
      const rxBorder = Number.isFinite(rPx) ? rPx : CAMERA_ORBIT_RX;
      const rx = Math.min(rxBorder, w / 2 - 0.001, h / 2 - 0.001);
      setOrbitDims((prev) => (prev.w === w && prev.h === h && prev.rx === rx ? prev : { w, h, rx }));
    };

    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !streamReady) return;
    const canvas = document.createElement('canvas');
    if (!drawVideoCenterCropToCanvas(video, canvas, OUTPUT_WIDTH, OUTPUT_HEIGHT)) return;
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
          <div ref={orbitFrameRef} className="kiosk-portrait-frame kiosk-flow-frame">
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
              {orbitDims.w > 0 && orbitDims.h > 0 ? (
                <svg
                  className="camera-viewfinder-orbit"
                  viewBox={`0 0 ${orbitDims.w} ${orbitDims.h}`}
                  preserveAspectRatio="none"
                  aria-hidden
                  focusable="false"
                >
                  <defs>
                    <linearGradient
                      id="camera-orbit-grad"
                      gradientUnits="userSpaceOnUse"
                      x1={0}
                      y1={0}
                      x2={orbitDims.w}
                      y2={orbitDims.h}
                    >
                      <stop offset="0%" stopColor="#fb923c" />
                      <stop offset="34%" stopColor="#fde047" />
                      <stop offset="62%" stopColor="#2dd4bf" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                  <rect
                    className="camera-viewfinder-orbit__rect"
                    x={0}
                    y={0}
                    width={orbitDims.w}
                    height={orbitDims.h}
                    rx={orbitDims.rx}
                    ry={orbitDims.rx}
                    pathLength={100}
                    fill="none"
                    stroke="url(#camera-orbit-grad)"
                  />
                </svg>
              ) : null}
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
                <div className="countdown-overlay" role="status" aria-live="polite">
                  <div className="countdown-overlay__halo" aria-hidden />
                  <div className="countdown-overlay__moment">
                    <img
                      src={countdownRobotArt}
                      alt=""
                      className="countdown-overlay__robot"
                      draggable={false}
                      aria-hidden
                    />
                    <span key={count} className="countdown-overlay__num">
                      {count}
                    </span>
                    <p className="countdown-overlay__tagline">Hold still</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
