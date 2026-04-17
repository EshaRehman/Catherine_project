import React, { useEffect, useId, useRef, useState } from 'react';
import {
  OUTPUT_ASPECT_W,
  OUTPUT_ASPECT_H,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
} from '../constants/outputFormat.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Cover scale + offsets in viewport px; returns clamped layout for drawing. */
function layoutCover(iw, ih, W, H, zoom, ox, oy) {
  if (!iw || !ih || !W || !H) return null;
  const s0 = Math.max(W / iw, H / ih);
  const s = s0 * Math.max(1, zoom);
  const sw = iw * s;
  const sh = ih * s;
  const x0 = (W - sw) / 2;
  const y0 = (H - sh) / 2;
  let x = x0 + ox;
  let y = y0 + oy;
  const minX = W - sw;
  const maxX = 0;
  const minY = H - sh;
  const maxY = 0;
  x = Math.min(maxX, Math.max(minX, x));
  y = Math.min(maxY, Math.max(minY, y));
  return {
    s,
    sw,
    sh,
    x,
    y,
    ox: x - x0,
    oy: y - y0,
    iw,
    ih,
  };
}

/**
 * After choosing a file, lets the admin pan/zoom inside a 4∶5 frame (same as kiosk output),
 * then exports a flattened JPEG at OUTPUT_WIDTH×OUTPUT_HEIGHT for use as template.backgroundUrl.
 */
export function BackgroundCoverAdjustModal({ open, imageSrc, onApply, onClose }) {
  const titleId = useId();
  const viewportRef = useRef(null);
  const [natural, setNatural] = useState({ iw: 0, ih: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  /** Pan + zoom together so zoom changes can re-clamp offsets in one update */
  const [view, setView] = useState({ zoom: 1, ox: 0, oy: 0 });
  const dragRef = useRef(null);

  useEffect(() => {
    if (!open || !imageSrc) return;
    let canceled = false;
    setNatural({ iw: 0, ih: 0 });
    setView({ zoom: 1, ox: 0, oy: 0 });
    loadImage(imageSrc)
      .then((img) => {
        if (!canceled) setNatural({ iw: img.naturalWidth, ih: img.naturalHeight });
      })
      .catch(() => {
        if (!canceled) setNatural({ iw: 0, ih: 0 });
      });
    return () => {
      canceled = true;
    };
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open) return;
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setViewport({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [open]);

  const { iw, ih } = natural;
  const { w: W, h: H } = viewport;

  useEffect(() => {
    if (!iw || !ih || !W || !H) return;
    setView((v) => {
      const n = layoutCover(iw, ih, W, H, v.zoom, v.ox, v.oy);
      if (!n) return v;
      if (n.ox === v.ox && n.oy === v.oy) return v;
      return { ...v, ox: n.ox, oy: n.oy };
    });
  }, [iw, ih, W, H, view.zoom]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const lay = layoutCover(iw, ih, W, H, view.zoom, view.ox, view.oy);

  const onPointerDown = (e) => {
    if (!lay) return;
    e.preventDefault();
    dragRef.current = {
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      startOx: lay.ox,
      startOy: lay.oy,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId || !iw || !ih || !W || !H) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    setView((v) => {
      const n = layoutCover(iw, ih, W, H, v.zoom, d.startOx + dx, d.startOy + dy);
      return n ? { ...v, ox: n.ox, oy: n.oy } : v;
    });
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (d && d.pid === e.pointerId) dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onWheel = (e) => {
    e.preventDefault();
    if (!iw || !ih || !W || !H) return;
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    setView((v) => {
      const nz = Math.min(3, Math.max(1, Math.round((v.zoom + delta) * 100) / 100));
      const n = layoutCover(iw, ih, W, H, nz, v.ox, v.oy);
      return n ? { zoom: nz, ox: n.ox, oy: n.oy } : { ...v, zoom: nz };
    });
  };

  const handleApply = async () => {
    if (!imageSrc || !lay || !iw || !ih || !W || !H) return;
    try {
      const img = await loadImage(imageSrc);
      const { sw, sh, x, y } = lay;
      const visLeft = Math.max(0, x);
      const visTop = Math.max(0, y);
      const visRight = Math.min(W, x + sw);
      const visBottom = Math.min(H, y + sh);
      const visW = visRight - visLeft;
      const visH = visBottom - visTop;
      if (visW < 1 || visH < 1) return;

      const srcX = ((visLeft - x) / sw) * iw;
      const srcY = ((visTop - y) / sh) * ih;
      const srcW = (visW / sw) * iw;
      const srcH = (visH / sh) * ih;

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      onApply(dataUrl);
      onClose();
    } catch {
      window.alert('Could not process that image. Try a different file.');
    }
  };

  if (!open || !imageSrc) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const ready = Boolean(lay && iw > 0 && ih > 0 && W > 0 && H > 0);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div
        className="modal modal--cover-adjust"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Position background</h2>
        <p className="modal--cover-adjust__intro">
          Frame matches kiosk output ({OUTPUT_ASPECT_W}∶{OUTPUT_ASPECT_H}, {OUTPUT_WIDTH}×{OUTPUT_HEIGHT}
          px). Drag to choose what stays visible; zoom to crop tighter. Apply saves this crop as the
          template background.
        </p>
        <div
          ref={viewportRef}
          className="cover-adjust-viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {ready ? (
            <img
              src={imageSrc}
              alt=""
              className="cover-adjust-viewport__img"
              draggable={false}
              style={{
                width: lay.sw,
                height: lay.sh,
                left: lay.x,
                top: lay.y,
              }}
            />
          ) : (
            <div className="cover-adjust-viewport__loading">Loading…</div>
          )}
        </div>
        <div className="cover-adjust-toolbar">
          <label className="cover-adjust-zoom-label" htmlFor="cover-zoom">
            Zoom
          </label>
          <input
            id="cover-zoom"
            type="range"
            className="cover-adjust-zoom"
            min={1}
            max={3}
            step={0.01}
            value={view.zoom}
            onChange={(e) => {
              const nz = Number(e.target.value);
              setView((v) => {
                const n = layoutCover(iw, ih, W, H, nz, v.ox, v.oy);
                return n ? { zoom: nz, ox: n.ox, oy: n.oy } : { ...v, zoom: nz };
              });
            }}
          />
          <span className="cover-adjust-zoom-value">{Math.round(view.zoom * 100)}%</span>
        </div>
        <p className="cover-adjust-hint">Scroll wheel on the frame to zoom. Drag to pan.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleApply} disabled={!ready}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
