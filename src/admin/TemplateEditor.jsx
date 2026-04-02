import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { compositePreviewMock } from '../utils/composite.js';

const FONTS = [
  { label: 'DM Sans', value: "'DM Sans', system-ui, sans-serif" },
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, sans-serif' },
];

const FONT_SIZE_OPTIONS = (() => {
  const o = [];
  for (let px = 12; px <= 96; px += 2) o.push(px);
  return o;
})();

/** Logo scale as percent (matches former slider 8–45%) */
const LOGO_SCALE_OPTIONS = (() => {
  const o = [];
  for (let p = 8; p <= 45; p += 1) o.push(p);
  return o;
})();

function normalizeFontSizePx(n) {
  const v = Math.min(96, Math.max(12, Math.round(Number(n) || 42)));
  const snapped = Math.round((v - 12) / 2) * 2 + 12;
  return Math.min(96, Math.max(12, snapped));
}

function FileUploadRow({ id, title, onChange }) {
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
          Choose file
        </span>
      </label>
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
      copy.steps = Math.min(20, Math.max(2, Number(copy.steps) || 12));
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
      } else if (mode === 'logo' && !draft.logoLocked) {
        setDraft((d) => ({ ...d, logoX: p.x, logoY: p.y }));
      } else if (mode === 'resize' && !draft.logoLocked) {
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
  }, [pctFromEvent, draft.logoLocked, draft.logoX, draft.logoY]);

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
                    className={`logo-drag${draft.logoLocked ? ' is-locked' : ''}`}
                    style={{
                      left: `${draft.logoX}%`,
                      top: `${draft.logoY}%`,
                      transform: 'translate(-50%, -50%)',
                      width: `${draft.logoScale * 100}%`,
                      maxWidth: '45%',
                      aspectRatio: '1',
                    }}
                    onPointerDown={(e) => {
                      if (draft.logoLocked) return;
                      if (e.target.dataset.handle === 'resize') return;
                      e.preventDefault();
                      dragRef.current = 'logo';
                    }}
                  >
                    <img src={draft.logoUrl} alt="" />
                    {!draft.logoLocked ? (
                      <div
                        data-handle="resize"
                        className="logo-drag__handle"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          dragRef.current = 'resize';
                        }}
                      />
                    ) : null}
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

        <div className="editor-scroll panel template-editor-page__form">
          <div className="editor-form-grid">
            <div className="section-title editor-form-grid__span">Basic info</div>
            <div className="field">
              <label htmlFor="tn">Template name</label>
              <input
                id="tn"
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <FileUploadRow id="tpl-bg" title="Background image" onChange={onBgFile} />

            <div className="section-title editor-form-grid__span">Prompt settings</div>
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

            <div className="section-title editor-form-grid__span">Generation</div>
            <div className="field field--full field--slider-line">
              <div className="field__slider-line">
                <label htmlFor="steps">Steps</label>
                <span className="field__slider-value">{draft.steps}</span>
                <input
                  id="steps"
                  type="range"
                  className="range-input"
                  min={2}
                  max={20}
                  value={draft.steps}
                  onChange={(e) =>
                    setDraft({ ...draft, steps: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="section-title editor-form-grid__span">Text overlay</div>
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
            <div className="field field--full">
              <div className="field__inline-pair">
                <div className="field__inline-pair__item">
                  <label htmlFor="fsz">Font size</label>
                  <select
                    id="fsz"
                    className="select"
                    value={draft.fontSize}
                    onChange={(e) =>
                      setDraft({ ...draft, fontSize: Number(e.target.value) })
                    }
                  >
                    {FONT_SIZE_OPTIONS.map((px) => (
                      <option key={px} value={px}>
                        {px}px
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field__inline-pair__item">
                  <label htmlFor="tc">Text color</label>
                  <input
                    id="tc"
                    type="color"
                    className="input-color input-color--inline"
                    value={draft.textColor?.startsWith('#') ? draft.textColor : '#ffffff'}
                    onChange={(e) => setDraft({ ...draft, textColor: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="field field--full">
              <p className="field__muted-label">Text position (or drag on preview)</p>
              <div className="field__slider-line">
                <span className="field__axis" aria-hidden>
                  X
                </span>
                <span className="field__slider-value">{draft.textX}</span>
                <input
                  type="range"
                  className="range-input"
                  min={0}
                  max={100}
                  value={draft.textX}
                  onChange={(e) => setDraft({ ...draft, textX: Number(e.target.value) })}
                  aria-label="Text horizontal position"
                />
              </div>
              <div className="field__slider-line field__slider-line--tight">
                <span className="field__axis" aria-hidden>
                  Y
                </span>
                <span className="field__slider-value">{draft.textY}</span>
                <input
                  type="range"
                  className="range-input"
                  min={0}
                  max={100}
                  value={draft.textY}
                  onChange={(e) => setDraft({ ...draft, textY: Number(e.target.value) })}
                  aria-label="Text vertical position"
                />
              </div>
            </div>

            <div className="section-title editor-form-grid__span">Logo</div>
            <FileUploadRow id="tpl-logo" title="Logo image" onChange={onLogoFile} />
            <div className="field field--full">
              <p className="field__muted-label">Logo position (or drag on preview)</p>
              <div className="field__slider-line">
                <span className="field__axis" aria-hidden>
                  X
                </span>
                <span className="field__slider-value">{draft.logoX}</span>
                <input
                  type="range"
                  className="range-input"
                  min={0}
                  max={100}
                  value={draft.logoX}
                  disabled={draft.logoLocked}
                  onChange={(e) =>
                    setDraft({ ...draft, logoX: Number(e.target.value) })
                  }
                  aria-label="Logo horizontal position"
                />
              </div>
              <div className="field__slider-line field__slider-line--tight">
                <span className="field__axis" aria-hidden>
                  Y
                </span>
                <span className="field__slider-value">{draft.logoY}</span>
                <input
                  type="range"
                  className="range-input"
                  min={0}
                  max={100}
                  value={draft.logoY}
                  disabled={draft.logoLocked}
                  onChange={(e) =>
                    setDraft({ ...draft, logoY: Number(e.target.value) })
                  }
                  aria-label="Logo vertical position"
                />
              </div>
            </div>
            <div className="field field--full field--slider-line">
              <div className="field__slider-line">
                <label htmlFor="logo-scale">Logo scale</label>
                <select
                  id="logo-scale"
                  className="select select--inline"
                  value={Math.round(draft.logoScale * 100)}
                  onChange={(e) =>
                    setDraft({ ...draft, logoScale: Number(e.target.value) / 100 })
                  }
                >
                  {LOGO_SCALE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}%
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field field--full">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.logoLocked}
                  onChange={(e) => setDraft({ ...draft, logoLocked: e.target.checked })}
                />
                Lock logo position
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
