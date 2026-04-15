import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from '../constants/outputFormat.js';
import countdownRobotArt from '../assets/Robot with camera and vibrant logo.png';
import { drawVideoCenterCropToCanvas } from '../utils/drawVideoToOutputFormat.js';
import { KioskHeaderTrailing } from './KioskHeaderTrailing.jsx';
import { KioskOrbitChrome } from './KioskOrbitChrome.jsx';

export function CameraScreen({ countdownSec, onCapture, onBack }) {
  const backRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const countTimerRef = useRef(null);
  const previewStartedRef = useRef(false);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(null);
  const [streamReady, setStreamReady] = useState(false);
  const [countMomentPulse, setCountMomentPulse] = useState(false);

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

  useEffect(() => {
    if (count === null) {
      setCountMomentPulse(false);
      return undefined;
    }
    setCountMomentPulse(true);
    const t = window.setTimeout(() => setCountMomentPulse(false), 880);
    return () => window.clearTimeout(t);
  }, [count]);

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
        <header className="kiosk-stage-header kiosk-stage-header--end">
          <KioskHeaderTrailing />
        </header>
        <div className="camera-screen--error__body">
          <p className="camera-screen__error-copy">Camera unavailable. Check permissions and try again.</p>
          <button type="button" className="btn btn-primary" onClick={onBack}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-screen">
      <header className="kiosk-stage-header kiosk-stage-header--split">
        <button
          ref={backRef}
          type="button"
          className="kiosk-nav-back kiosk-chrome-orbit-target"
          onClick={onBack}
        >
          <KioskOrbitChrome anchorRef={backRef} rxFallback={14} />
          <span className="kiosk-nav-back__face">
            <span className="kiosk-nav-back__chevron" aria-hidden />
            Back
          </span>
        </button>
        <KioskHeaderTrailing />
      </header>

      <div className="camera-screen__main">
        <div className="camera-screen__viewport kiosk-flow-viewport">
          <div className="kiosk-portrait-frame kiosk-flow-frame kiosk-portrait-frame--capture">
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
              <div className="camera-frame-cinematic" aria-hidden="true">
                <span className="camera-frame-cinematic__letterbox camera-frame-cinematic__letterbox--top" />
                <span className="camera-frame-cinematic__letterbox camera-frame-cinematic__letterbox--bottom" />
                <span className="camera-frame-cinematic__glow" />
                <span className="camera-frame-cinematic__corn camera-frame-cinematic__corn--tr" />
                <span className="camera-frame-cinematic__corn camera-frame-cinematic__corn--bl" />
                <span className="camera-frame-cinematic__corn camera-frame-cinematic__corn--br" />
              </div>
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
                  <div className="countdown-overlay__veil" aria-hidden />
                  <div
                    className={`countdown-overlay__halo${countMomentPulse ? ' countdown-overlay__halo--tick' : ''}`}
                    aria-hidden
                  />
                  <div className="countdown-overlay__moment">
                    <div
                      key={count}
                      className={`countdown-overlay__beat${count === 1 ? ' countdown-overlay__beat--final' : ''}`}
                    >
                      <div className="countdown-overlay__beat-glow" aria-hidden />
                      <div className="countdown-overlay__robot-wrap">
                        <img
                          src={countdownRobotArt}
                          alt=""
                          className="countdown-overlay__robot"
                          draggable={false}
                          aria-hidden
                        />
                      </div>
                      <div className="countdown-overlay__num-shell">
                        <span className="countdown-overlay__num">{count}</span>
                      </div>
                    </div>
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
