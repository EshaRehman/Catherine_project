import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { compositePreviewMock } from '../utils/composite.js';

const FONTS = [
  { label: 'DM Sans', value: "'DM Sans', system-ui, sans-serif" },
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, sans-serif' },
];

function normalizeFontSizePx(n) {
  const v = Math.min(96, Math.max(12, Math.round(Number(n) || 42)));
  const snapped = Math.round((v - 12) / 2) * 2 + 12;
  return Math.min(96, Math.max(12, snapped));
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}

function FileUploadRow({ id, title, cta = 'Choose file', subtitle, onChange }) {
  return (
    <div className="field field--full">
      <div className="field-heading">{title}</div>
      <label className="file-upload" htmlFor={id}>
        <input
          id={id}
          type="file"
          accept="image/*"
          className="file-upload__native"
          onChange={onChange}
        />
        <span className="file-upload__face">
          <span className="file-upload__glyph" aria-hidden />
          <span className="file-upload__copy">
            <strong>{cta}</strong>
            {subtitle ? <small>{subtitle}</small> : null}
          </span>
        </span>
      </label>
    </div>
  );
}

function SliderWithInput({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
  hint,
}) {
  const safe = clampInt(value, min, max);
  return (
    <div className="field field--full slider-field">
      <div className="slider-field__top">
        <label htmlFor={id}>{label}</label>
        <input
          type="number"
          className="input slider-field__number"
          min={min}
          max={max}
          step={step}
          value={safe}
          disabled={disabled}
          onChange={(e) => onChange(clampInt(e.target.value, min, max))}
          aria-label={`${label} value`}
        />
      </div>
      <input
        id={id}
        type="range"
        className="range-input"
        min={min}
        max={max}
        step={step}
        value={safe}
        disabled={disabled}
        onChange={(e) => onChange(clampInt(e.target.value, min, max))}
      />
      <div className="slider-field__scale" aria-hidden>
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {hint ? <p className="field-help">{hint}</p> : null}
    </div>
  );
}

function PositionMiniPad({ title, marker, x, y, onPlace }) {
  const padRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const pointFromEvent = (clientX, clientY) => {
    const el = padRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = clampInt(((clientX - r.left) / r.width) * 100, 0, 100);
    const y = clampInt(((clientY - r.top) / r.height) * 100, 0, 100);
    return { x, y };
  };

  const onPadPointerDown = (e) => {
    e.preventDefault();
    const p = pointFromEvent(e.clientX, e.clientY);
    if (!p) return;
    onPlace(p.x, p.y);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };

  const onPadPointerMove = (e) => {
    if (!dragging) return;
    const p = pointFromEvent(e.clientX, e.clientY);
    if (!p) return;
    onPlace(p.x, p.y);
  };

  const onPadPointerUp = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };

  return (
    <div className="field">
      <div className="position-pad-toolbar">
        <label>{title}</label>
        <div className="position-mini-meta">
          {x}, {y}
        </div>
      </div>
      <div
        ref={padRef}
        className="position-pad position-pad--mini"
        onPointerDown={onPadPointerDown}
        onPointerMove={onPadPointerMove}
        onPointerUp={onPadPointerUp}
        onPointerCancel={onPadPointerUp}
        role="application"
        aria-label={`${title} position pad`}
      >
        <span
          className={`position-dot ${marker === 'T' ? 'position-dot--text' : 'position-dot--logo'}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          aria-hidden
        >
          {marker}
        </span>
      </div>
      <p className="field-help">Click or drag to place.</p>
    </div>
  );
}

export function TemplateEditor() {
  const {
    editorTemplateId,
    getTemplate,
    saveTemplate,
    setAdminRoute,
    createDefaultTemplate,
  } = useApp();

  const [draft, setDraft] = useState(() => createDefaultTemplate());
  const [previewUrl, setPreviewUrl] = useState(null);
  const [generating, setGenerating] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const t = editorTemplateId ? getTemplate(editorTemplateId) : null;
    if (t) {
      const copy = JSON.parse(JSON.stringify(t));
      copy.steps = Math.min(20, Math.max(0, Number(copy.steps) || 6));
      copy.fontSize = normalizeFontSizePx(copy.fontSize);
      const lp = Math.round(Number(copy.logoScale || 0.22) * 100);
      copy.logoScale = Math.min(45, Math.max(8, lp)) / 100;
      setDraft(copy);
    } else setDraft(createDefaultTemplate());
    setPreviewUrl(null);
  }, [editorTemplateId]);

  const readFileDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const onBgFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await readFileDataUrl(f);
    setDraft((d) => ({ ...d, backgroundUrl: url }));
  };

  const onLogoFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await readFileDataUrl(f);
    setDraft((d) => ({ ...d, logoUrl: url }));
  };

  const previewGenerate = async () => {
    setGenerating(true);
    setPreviewUrl(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      const url = await compositePreviewMock(draft, 360, 640);
      setPreviewUrl(url);
    } finally {
      setGenerating(false);
    }
  };

  const pctFromEvent = useCallback((clientX, clientY) => {
    const el = stageRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 100;
    const y = ((clientY - r.top) / r.height) * 100;
    return {
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    };
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const mode = dragRef.current;
      if (!mode) return;
      const p = pctFromEvent(e.clientX, e.clientY);
      if (!p) return;
      if (mode === 'text') {
        setDraft((d) => ({ ...d, textX: p.x, textY: p.y }));
      } else if (mode === 'logo') {
        setDraft((d) => ({ ...d, logoX: p.x, logoY: p.y }));
      } else if (mode === 'resize') {
        const el = stageRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const cx = (draft.logoX / 100) * r.width + r.left;
        const cy = (draft.logoY / 100) * r.height + r.top;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const base = Math.min(r.width, r.height);
        const scale = Math.min(0.45, Math.max(0.08, dist / base));
        setDraft((d) => ({ ...d, logoScale: scale }));
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [pctFromEvent, draft.logoX, draft.logoY]);

  const save = (asNew) => {
    saveTemplate(draft, { asNew });
    setAdminRoute('templates');
  };

  const bgStyle = draft.backgroundUrl
    ? { backgroundImage: `url(${draft.backgroundUrl})` }
    : {};

  const min = draft.previewClass || 'tpl-preview--thrones';

  return (
    <div className="template-editor-page">
      <div className="admin-page-head template-editor-page__head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">Template editor</h1>
          <p className="admin-page-sub">Adjust the look; the live app stays visual-only.</p>
        </div>
        <div className="template-editor-page__actions">
          <button type="button" className="btn btn-ghost" onClick={() => setAdminRoute('templates')}>
            Back
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save(false)}>
            Save
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => save(true)}>
            Save as new
          </button>
        </div>
      </div>

      <div className="editor-split template-editor-page__split">
        <div className="preview-stage-wrap preview-stage-wrap--editor">
          <div ref={stageRef} className="preview-stage preview-stage--compact" style={{ position: 'relative' }}>
            {previewUrl ? (
              <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <>
                <div
                  className={`preview-stage-inner ${draft.backgroundUrl ? '' : min}`}
                  style={{
                    ...bgStyle,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                {draft.overlayText ? (
                  <div
                    role="presentation"
                    className="drag-overlay"
                    style={{
                      left: `${draft.textX}%`,
                      top: `${draft.textY}%`,
                      transform: 'translate(-50%, -50%)',
                      fontFamily: draft.fontFamily,
                      fontSize: `clamp(10px, ${draft.fontSize * 0.28}px, 32px)`,
                      color: draft.textColor,
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      dragRef.current = 'text';
                    }}
                  >
                    {draft.overlayText}
                  </div>
                ) : null}
                {draft.logoUrl ? (
                  <div
                    className="logo-drag"
                    style={{
                      left: `${draft.logoX}%`,
                      top: `${draft.logoY}%`,
                      transform: 'translate(-50%, -50%)',
                      width: `${draft.logoScale * 100}%`,
                      maxWidth: '45%',
                      aspectRatio: '1',
                    }}
                    onPointerDown={(e) => {
                      if (e.target.dataset.handle === 'resize') return;
                      e.preventDefault();
                      dragRef.current = 'logo';
                    }}
                  >
                    <img src={draft.logoUrl} alt="" />
                    <div
                      data-handle="resize"
                      className="logo-drag__handle"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        dragRef.current = 'resize';
                      }}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary template-editor-page__preview-btn"
            onClick={previewGenerate}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Preview generate'}
          </button>
          <p className="template-editor-page__preview-hint">Mock layout preview — connect your inference API for real output.</p>
        </div>

        <div className="editor-scroll panel template-editor-page__form template-editor-form">
          <section className="editor-card">
            <h2 className="editor-card__title">Generation Settings</h2>
            <div className="editor-card__grid">
              <div className="field">
                <label htmlFor="tn">Template name</label>
                <input
                  id="tn"
                  className="input"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <FileUploadRow
                id="tpl-bg"
                title="Background image"
                cta="+ Upload Background"
                subtitle="Drag & drop or click to upload"
                onChange={onBgFile}
              />
              <div className="field field--full">
                <label htmlFor="pr">Prompt</label>
                <textarea
                  id="pr"
                  className="textarea textarea--compact"
                  rows={3}
                  value={draft.prompt}
                  onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                />
              </div>
              <SliderWithInput
                id="steps"
                label="Steps (Generation quality)"
                value={draft.steps}
                min={0}
                max={20}
                onChange={(value) => setDraft({ ...draft, steps: value })}
                hint="Higher values can improve quality but take longer."
              />
            </div>
          </section>

          <section className="editor-card">
            <h2 className="editor-card__title">Text Overlay</h2>
            <div className="editor-card__grid">
              <div className="field">
                <label htmlFor="ov">Text</label>
                <input
                  id="ov"
                  className="input"
                  value={draft.overlayText}
                  onChange={(e) => setDraft({ ...draft, overlayText: e.target.value })}
                  placeholder="F1 EXPERIENCE"
                />
              </div>
              <div className="field">
                <label htmlFor="font">Font</label>
                <select
                  id="font"
                  className="select"
                  value={draft.fontFamily}
                  onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value })}
                >
                  {FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="fsz">Font size</label>
                <input
                  id="fsz"
                  type="number"
                  className="input"
                  min={12}
                  max={96}
                  step={2}
                  value={draft.fontSize}
                  onChange={(e) =>
                    setDraft({ ...draft, fontSize: normalizeFontSizePx(e.target.value) })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="tc">Text color</label>
                <div className="color-field">
                  <input
                    id="tc"
                    type="color"
                    className="input-color"
                    value={draft.textColor?.startsWith('#') ? draft.textColor : '#ffffff'}
                    onChange={(e) => setDraft({ ...draft, textColor: e.target.value })}
                  />
                  <input
                    type="text"
                    className="input color-field__hex"
                    value={draft.textColor || '#ffffff'}
                    onChange={(e) => setDraft({ ...draft, textColor: e.target.value })}
                    aria-label="Text color hex value"
                  />
                </div>
              </div>
              <PositionMiniPad
                title="Text position"
                marker="T"
                x={draft.textX}
                y={draft.textY}
                onPlace={(x, y) => setDraft((d) => ({ ...d, textX: x, textY: y }))}
              />
            </div>
          </section>

          <section className="editor-card">
            <h2 className="editor-card__title">Logo Settings</h2>
            <div className="editor-card__grid">
              <FileUploadRow
                id="tpl-logo"
                title="Logo"
                cta="+ Upload Logo"
                subtitle="Drag & drop or click to upload"
                onChange={onLogoFile}
              />
              <div className="field">
                <label htmlFor="logo-scale">Scale</label>
                <input
                  id="logo-scale"
                  type="number"
                  className="input"
                  min={8}
                  max={45}
                  step={1}
                  value={Math.round(draft.logoScale * 100)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      logoScale: clampInt(e.target.value, 8, 45) / 100,
                    })
                  }
                />
              </div>
              <PositionMiniPad
                title="Logo position"
                marker="L"
                x={draft.logoX}
                y={draft.logoY}
                onPlace={(x, y) => setDraft((d) => ({ ...d, logoX: x, logoY: y }))}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
