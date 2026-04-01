import React, { useCallback, useEffect, useRef, useState } from 'react';

export function CameraScreen({ countdownSec, onCapture, onBack }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const countTimerRef = useRef(null);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(null);

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
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        if (!cancelled) setError('camera');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
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
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    onCapture(dataUrl);
  }, [onCapture]);

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
      <header className="camera-screen__header">
        <button type="button" className="camera-screen__back" onClick={onBack}>
          <span className="camera-screen__back-icon" aria-hidden />
          Back
        </button>
      </header>

      <div className="camera-screen__viewport">
        <div className="camera-wrap">
          <video ref={videoRef} playsInline muted className="camera-wrap__video" />
          <div className="camera-frame-hint" aria-hidden />
          {count !== null ? (
            <div className="countdown-overlay">
              <span className="countdown-overlay__num">{count}</span>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="camera-screen__footer">
        <button
          type="button"
          className="btn btn-primary camera-screen__capture"
          onClick={runCountdown}
          disabled={count !== null}
        >
          {count !== null ? 'Hold still…' : 'Capture'}
        </button>
      </footer>
    </div>
  );
}
