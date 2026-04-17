import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { BackgroundCoverAdjustModal } from './BackgroundCoverAdjustModal.jsx';
import { OUTPUT_EDITOR_MOCK_HEIGHT, OUTPUT_EDITOR_MOCK_WIDTH } from '../constants/outputFormat.js';
import { compositePreviewMock } from '../utils/composite.js';

/** Google Fonts loaded in `index.html` — stack falls back to system-ui. */
const FONTS = [
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'DM Sans', value: "'DM Sans', system-ui, sans-serif" },
  { label: 'Roboto', value: "'Roboto', system-ui, sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', system-ui, sans-serif" },
  { label: 'Lato', value: "'Lato', system-ui, sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', system-ui, sans-serif" },
  { label: 'Poppins', value: "'Poppins', system-ui, sans-serif" },
  { label: 'Nunito', value: "'Nunito', system-ui, sans-serif" },
  { label: 'Raleway', value: "'Raleway', system-ui, sans-serif" },
  { label: 'Source Sans 3', value: "'Source Sans 3', system-ui, sans-serif" },
  { label: 'Work Sans', value: "'Work Sans', system-ui, sans-serif" },
  { label: 'Rubik', value: "'Rubik', system-ui, sans-serif" },
  { label: 'Quicksand', value: "'Quicksand', system-ui, sans-serif" },
  { label: 'Barlow', value: "'Barlow', system-ui, sans-serif" },
  { label: 'Fira Sans', value: "'Fira Sans', system-ui, sans-serif" },
  { label: 'Ubuntu', value: "'Ubuntu', system-ui, sans-serif" },
  { label: 'Noto Sans', value: "'Noto Sans', system-ui, sans-serif" },
  { label: 'Merriweather', value: "'Merriweather', Georgia, serif" },
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { label: 'Oswald', value: "'Oswald', system-ui, sans-serif" },
  { label: 'Bebas Neue', value: "'Bebas Neue', Impact, system-ui, sans-serif" },
  { label: 'Pacifico', value: "'Pacifico', cursive" },
  { label: 'Caveat', value: "'Caveat', cursive" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, sans-serif' },
];

function IconUpload() {
  return (
    <svg
      className="editor-image-slot__upload-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

function normalizeFontSizePx(n) {
  const v = Math.min(96, Math.max(12, Math.round(Number(n) || 42)));
  const snapped = Math.round((v - 12) / 2) * 2 + 12;
  return Math.min(96, Math.max(12, snapped));
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}

/** Compact image target: dashed tile, centered thumbnail (contain), clear control top-right of field. */
function EditorImageSlot({ id, title, thumbUrl, filled, inputKey, onChange, onClear, emptyLabel }) {
  return (
    <div className={`editor-image-slot editor-image-slot--minimal ${filled ? 'editor-image-slot--filled' : ''}`}>
      <div className="editor-image-slot__chrome">
        <label className="editor-image-slot__zone" htmlFor={id}>
          <input
            key={inputKey}
            id={id}
            type="file"
            accept="image/*"
            className="editor-image-slot__input"
            aria-label={title}
            onChange={onChange}
          />
          {thumbUrl ? (
            <span className="editor-image-slot__thumb-frame">
              <img src={thumbUrl} alt="" className="editor-image-slot__img" />
            </span>
          ) : (
            <span className="editor-image-slot__empty">
              <IconUpload />
              <span className="editor-image-slot__empty-text">{emptyLabel}</span>
            </span>
          )}
        </label>
        {filled ? (
          <button
            type="button"
            className="editor-image-slot__x"
            aria-label={`Remove ${title}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }}
          >
            <svg
              className="editor-image-slot__x-icon"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Number input: edit freely (incl. backspace); commit clamped value on blur; spinners stay native. */
function BlurCommitNumberInput({
  id,
  className,
  min,
  max,
  step,
  value,
  disabled,
  inputMode,
  ariaLabel,
  onCommit,
}) {
  const [txt, setTxt] = useState(null);
  useEffect(() => {
    setTxt(null);
  }, [value]);

  const display = txt !== null ? txt : String(value);

  return (
    <input
      id={id}
      type="number"
      className={className}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      inputMode={inputMode}
      aria-label={ariaLabel}
      value={display}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const raw = txt;
        setTxt(null);
        const v = (raw ?? '').trim();
        if (v === '' || v === '-') {
          onCommit(value);
          return;
        }
        const n = parseInt(String(v).replace(/\D/g, ''), 10);
        if (Number.isNaN(n)) {
          onCommit(value);
          return;
        }
        onCommit(clampInt(n, min, max));
      }}
    />
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
        <label htmlFor={`${id}-num`}>{label}</label>
        <BlurCommitNumberInput
          id={`${id}-num`}
          className="input slider-field__number slider-field__number--compact"
          min={min}
          max={max}
          step={step}
          value={safe}
          disabled={disabled}
          inputMode="numeric"
          ariaLabel={`${label} value`}
          onCommit={(n) => onChange(n)}
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
    <div className="field field--full">
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

function EditorFontPicker({ id, label, value, fonts, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = fonts.find((f) => f.value === value) ?? {
    label: 'Saved font',
    value,
  };

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className={`field editor-font-picker${open ? ' is-open' : ''}`}
      ref={rootRef}
    >
      <label className="editor-font-picker__label" id={`${id}-lbl`} htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        className="editor-font-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-lbl`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="editor-font-picker__trigger-text" style={{ fontFamily: value }}>
          {selected.label}
        </span>
        <span className="editor-font-picker__chev" aria-hidden />
      </button>
      {open ? (
        <div className="editor-font-picker__panel" role="listbox" aria-labelledby={`${id}-lbl`}>
          <div className="editor-font-picker__scroll">
            {fonts.map((f) => (
              <button
                key={f.value}
                type="button"
                role="option"
                aria-selected={f.value === value}
                className={`editor-font-picker__option ${f.value === value ? 'is-selected' : ''}`}
                style={{ fontFamily: f.value }}
                onClick={() => {
                  onChange(f.value);
                  setOpen(false);
                }}
              >
                <span className="editor-font-picker__option-label">{f.label}</span>
                {f.value === value ? (
                  <span className="editor-font-picker__check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeDraft(raw) {
  const copy = JSON.parse(JSON.stringify(raw));
  copy.steps = Math.min(20, Math.max(0, Number(copy.steps) || 6));
  copy.fontSize = normalizeFontSizePx(copy.fontSize);
  const lp = Math.round(Number(copy.logoScale || 0.22) * 100);
  copy.logoScale = Math.min(45, Math.max(8, lp)) / 100;
  return copy;
}

function draftFingerprint(d) {
  return JSON.stringify(normalizeDraft(d));
}

export function TemplateEditor() {
  const {
    editorTemplateId,
    getTemplate,
    saveTemplate,
    setAdminRoute,
    createDefaultTemplate,
  } = useApp();

  const [draft, setDraft] = useState(() =>
    createDefaultTemplate({ name: '', previewClass: 'tpl-preview--thrones' }),
  );
  const [previewUrl, setPreviewUrl] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [bgCropSrc, setBgCropSrc] = useState(null);
  const [editorHydrated, setEditorHydrated] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const baselineFingerprintRef = useRef('');

  const isEditing = Boolean(editorTemplateId);

  useEffect(() => {
    let next;
    if (editorTemplateId) {
      const t = getTemplate(editorTemplateId);
      next = t
        ? normalizeDraft(t)
        : normalizeDraft(createDefaultTemplate({ name: '', previewClass: 'tpl-preview--thrones' }));
    } else {
      next = normalizeDraft(createDefaultTemplate({ name: '', previewClass: 'tpl-preview--thrones' }));
    }
    baselineFingerprintRef.current = draftFingerprint(next);
    setDraft(next);
    setPreviewUrl(null);
    setEditorHydrated(true);
  }, [editorTemplateId, getTemplate, createDefaultTemplate]);

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
    setBgCropSrc(url);
    e.target.value = '';
  };

  const onLogoFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await readFileDataUrl(f);
    setDraft((d) => ({ ...d, logoUrl: url }));
    e.target.value = '';
  };

  const previewGenerate = async () => {
    setGenerating(true);
    setPreviewUrl(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      const url = await compositePreviewMock(
        draft,
        OUTPUT_EDITOR_MOCK_WIDTH,
        OUTPUT_EDITOR_MOCK_HEIGHT,
      );
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

  const isDirty =
    editorHydrated && draftFingerprint(draft) !== baselineFingerprintRef.current;

  const handleCancel = () => {
    if (isDirty) setDiscardConfirmOpen(true);
    else setAdminRoute('templates');
  };

  const confirmDiscard = () => {
    setAdminRoute('templates');
  };

  const handleSave = () => {
    const name = draft.name.trim();
    if (!name) {
      window.alert('Please enter a template name before saving.');
      return;
    }
    saveTemplate({ ...draft, name });
    setAdminRoute('templates');
  };

  const bgStyle = draft.backgroundUrl
    ? { backgroundImage: `url(${draft.backgroundUrl})` }
    : {};

  const min = draft.previewClass || 'tpl-preview--thrones';

  return (
    <div className="template-editor-page">
      <BackgroundCoverAdjustModal
        open={Boolean(bgCropSrc)}
        imageSrc={bgCropSrc}
        onClose={() => setBgCropSrc(null)}
        onApply={(dataUrl) => setDraft((d) => ({ ...d, backgroundUrl: dataUrl }))}
      />
      <ConfirmModal
        open={discardConfirmOpen}
        title="Discard changes?"
        message="You have unsaved changes. If you leave now, they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={confirmDiscard}
        onClose={() => setDiscardConfirmOpen(false)}
      />
      <div className="admin-page-head template-editor-page__head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">
            {isEditing ? (
              <>
                Edit <span className="text-brand-gradient">template</span>
              </>
            ) : (
              <>
                Create <span className="text-brand-gradient">template</span>
              </>
            )}
          </h1>
          <p className="admin-page-sub">
            {isEditing
              ? 'Adjust the look; changes apply after you save.'
              : 'Configure the look, then save to add it to your library. Nothing is stored until you save.'}
          </p>
        </div>
        <div className="template-editor-page__actions">
          <button type="button" className="btn btn-ghost" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>

      <div className="editor-split template-editor-page__split">
        <div className="preview-stage-wrap preview-stage-wrap--editor template-editor-page__preview-col">
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
            title="Builds a single flat mock image from your current layout (background, text, logo). The stage above is for editing; this shows an export-style preview when you want to see it flattened."
          >
            {generating ? 'Generating…' : 'Generate preview'}
          </button>
        </div>

        <div className="panel template-editor-page__form template-editor-form admin-form-panel">
          <section className="editor-card">
            <h2 className="editor-card__title">
              Generation <span className="text-brand-gradient">settings</span>
            </h2>
            <p className="editor-card__intro">Name your template, set the scene, and tune generation strength.</p>
            <div className="editor-card__grid editor-card__grid--stack">
              <div className="editor-row editor-row--pair editor-row--name-bg">
                <div className="field field--pair-cell">
                  <label className="editor-pair-label" htmlFor="tn">
                    Template name
                  </label>
                  <input
                    id="tn"
                    className="input input--pair-tall"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. F1 Racing, Winter Gala"
                    autoComplete="off"
                  />
                </div>
                <div className="field field--upload-tile field--pair-cell">
                  <span className="editor-pair-label">Background</span>
                  <EditorImageSlot
                    id="tpl-bg"
                    title="Background image"
                    emptyLabel="Upload image"
                    thumbUrl={draft.backgroundUrl || null}
                    filled={Boolean(draft.backgroundUrl)}
                    inputKey={`bg-${editorTemplateId || 'new'}-${draft.backgroundUrl ? '1' : '0'}`}
                    onChange={onBgFile}
                    onClear={() => setDraft((d) => ({ ...d, backgroundUrl: null }))}
                  />
                </div>
              </div>
              <div className="field field--full">
                <label htmlFor="pr">Prompt</label>
                <textarea
                  id="pr"
                  className="textarea textarea--editor-prompt"
                  rows={4}
                  value={draft.prompt}
                  onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                  placeholder="Describe the look you want for generated portraits…"
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
            <h2 className="editor-card__title">
              Text <span className="text-brand-gradient">overlay</span>
            </h2>
            <p className="editor-card__intro">Guest-facing headline, typography, and placement on the preview.</p>
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
              <EditorFontPicker
                id="font"
                label="Font"
                value={draft.fontFamily}
                fonts={FONTS}
                onChange={(fontFamily) => setDraft((d) => ({ ...d, fontFamily }))}
              />
              <div className="field">
                <label htmlFor="fsz">Font size</label>
                <BlurCommitNumberInput
                  id="fsz"
                  className="input input--num-wide"
                  min={12}
                  max={96}
                  step={2}
                  value={draft.fontSize}
                  inputMode="numeric"
                  ariaLabel="Font size in pixels"
                  onCommit={(n) =>
                    setDraft((d) => ({ ...d, fontSize: normalizeFontSizePx(n) }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="tc">Text color</label>
                <div className="color-field color-field--editor-swatch">
                  <input
                    id="tc"
                    type="color"
                    className="input-color input-color--bare"
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
            <h2 className="editor-card__title">
              Logo <span className="text-brand-gradient">settings</span>
            </h2>
            <p className="editor-card__intro">
              Optional mark on the preview, drag it on the stage to reposition.
            </p>
            <div className="editor-card__grid editor-card__grid--stack">
              <div className="editor-row editor-row--pair editor-row--logo-scale">
                <div className="field field--upload-tile field--pair-cell">
                  <span className="editor-pair-label">Logo</span>
                  <EditorImageSlot
                    id="tpl-logo"
                    title="Logo"
                    emptyLabel="Upload logo"
                    thumbUrl={draft.logoUrl || null}
                    filled={Boolean(draft.logoUrl)}
                    inputKey={`logo-${editorTemplateId || 'new'}-${draft.logoUrl ? '1' : '0'}`}
                    onChange={onLogoFile}
                    onClear={() => setDraft((d) => ({ ...d, logoUrl: null }))}
                  />
                </div>
                <div className="field field--scale-inline field--pair-cell">
                  <label className="editor-pair-label" htmlFor="logo-scale">
                    Scale
                  </label>
                  <BlurCommitNumberInput
                    id="logo-scale"
                    className="input input--num-wide input--pair-tall"
                    min={8}
                    max={45}
                    step={1}
                    value={Math.round(draft.logoScale * 100)}
                    inputMode="numeric"
                    ariaLabel="Logo scale percent"
                    onCommit={(n) =>
                      setDraft((d) => ({ ...d, logoScale: clampInt(n, 8, 45) / 100 }))
                    }
                  />
                </div>
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
