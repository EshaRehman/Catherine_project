import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { createTemplate, updateTemplate, getTemplateById, previewImageApi } from '../utils/api.js';
import { compositePreviewMock, compositeResultPreview } from '../utils/composite.js';

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

function FileUploadRow({ id, title, cta = 'Choose file', subtitle, onChange, uploaded = false }) {
  return (
    <div className="field field--full">
      <div className="field-heading">{title}</div>
      <label className={`file-upload${uploaded ? ' file-upload--uploaded' : ''}`} htmlFor={id}>
        <input
          id={id}
          type="file"
          accept="image/*"
          className="file-upload__native"
          onChange={onChange}
        />
        <span className="file-upload__face">
          <span className="file-upload__face-row">
            {uploaded ? (
              <svg className="file-upload__check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <span className="file-upload__glyph" aria-hidden />
            )}
            <strong className="file-upload__cta">{uploaded ? 'Uploaded — click to change' : cta}</strong>
          </span>
          {subtitle && !uploaded ? <small className="file-upload__subtitle">{subtitle}</small> : null}
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

const PEOPLE_OPTIONS = [
  { value: 1, label: '1 Person' },
  { value: 2, label: '2 People' },
  { value: 3, label: '3 People' },
  { value: 4, label: '4 People' },
  { value: 5, label: '5 People' },
];

const BASE_PROMPT_MAX = 1000;
const PEOPLE_PROMPT_MAX = 1000;

const defaultPeoplePrompts = () => ({ 1: '', 2: '', 3: '', 4: '', 5: '' });

export function TemplateEditor() {
  const {
    editorTemplateId,
    editorIsNew,
    setAdminRoute,
    createDefaultTemplate,
  } = useApp();

  const [draft, setDraft] = useState(() => createDefaultTemplate());
  const [previewPhase, setPreviewPhase] = useState('idle'); // 'idle'|'camera'|'processing'|'result'
  const [resultDataUrl, setResultDataUrl] = useState(null);
  const [idlePreviewUrl, setIdlePreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [camCount, setCamCount] = useState(0);
  const [basePrompt, setBasePrompt] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [peoplePrompts, setPeoplePrompts] = useState(defaultPeoplePrompts);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'error'
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const camVideoRef = useRef(null);
  const camStreamRef = useRef(null);
  const camCountRunRef = useRef(0);
  const basePromptRef = useRef(basePrompt);
  const peoplePromptsRef = useRef(peoplePrompts);
  const numberOfPeopleRef = useRef(numberOfPeople);
  const draftRef = useRef(draft);

  const updatePeoplePrompt = (count, value) => {
    setPeoplePrompts((prev) => ({ ...prev, [count]: value }));
  };

  useEffect(() => {
    const loadData = async () => {
      setPreviewPhase('idle');
      setResultDataUrl(null);
      setPreviewError(null);
      if (editorTemplateId && !editorIsNew) {
        setLoading(true);
        const res = await getTemplateById(editorTemplateId);
        if (res.ok && res.data) {
          const t = res.data;
          const copy = JSON.parse(JSON.stringify(t));
          copy.id = copy.templateId || copy.id;
          copy.backgroundUrl = copy.backgroundUrl || copy.templateImageUrl || null;
          copy.steps = Math.min(20, Math.max(0, Number(copy.steps) || 6));
          copy.fontSize = normalizeFontSizePx(copy.fontSize);
          const lp = Math.round(Number(copy.logoScale || 0.22) * 100);
          copy.logoScale = Math.min(45, Math.max(8, lp)) / 100;
          // Unpack nested position objects saved by the API
          if (copy.textPosition) {
            copy.textX = clampInt(copy.textPosition.x ?? copy.textX ?? 50, 0, 100);
            copy.textY = clampInt(copy.textPosition.y ?? copy.textY ?? 78, 0, 100);
          }
          if (copy.logoPosition) {
            copy.logoX = clampInt(copy.logoPosition.x ?? copy.logoX ?? 88, 0, 100);
            copy.logoY = clampInt(copy.logoPosition.y ?? copy.logoY ?? 10, 0, 100);
          }
          if (!copy.overlayText) copy.overlayText = '';
          if (!copy.textColor) copy.textColor = '#ffffff';
          if (!copy.fontFamily) copy.fontFamily = "'DM Sans', system-ui, sans-serif";

          setDraft(copy);
          setBasePrompt(t.basePrompt || '');
          if (t.peoplePrompts) {
             setPeoplePrompts({...defaultPeoplePrompts(), ...t.peoplePrompts});
          }
        } else {
           // Handle error finding it
           setDraft(createDefaultTemplate());
        }
        setLoading(false);
      } else {
        setDraft(createDefaultTemplate());
      }
    };
    
    loadData();
  }, [editorTemplateId, editorIsNew]);

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

  useEffect(() => {
    if (!showResultModal) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowResultModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showResultModal]);

  // Keep refs in sync so snap() can read current values without stale closures
  useEffect(() => { basePromptRef.current = basePrompt; }, [basePrompt]);
  useEffect(() => { peoplePromptsRef.current = peoplePrompts; }, [peoplePrompts]);
  useEffect(() => { numberOfPeopleRef.current = numberOfPeople; }, [numberOfPeople]);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // Live idle preview: re-render whenever draft settings change
  useEffect(() => {
    if (previewPhase !== 'idle') {
      setIdlePreviewUrl(null);
      return;
    }
    let cancelled = false;
    compositePreviewMock(draft, 540, 960).then(url => {
      if (!cancelled) setIdlePreviewUrl(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [draft, previewPhase]);

  // Start/stop camera when entering/leaving camera phase
  useEffect(() => {
    if (previewPhase !== 'camera') return;
    let cancelled = false;
    setCamReady(false);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1320 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        camStreamRef.current = stream;
        if (camVideoRef.current) {
          camVideoRef.current.srcObject = stream;
          await camVideoRef.current.play();
          if (!cancelled) setCamReady(true);
        }
      } catch {
        if (!cancelled) { setPreviewError('Camera unavailable.'); setPreviewPhase('result'); }
      }
    })();
    return () => {
      cancelled = true;
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
      setCamReady(false);
      setCamCount(0);
    };
  }, [previewPhase]);

  // Countdown tick
  const snap = useCallback(() => {
    const video = camVideoRef.current;
    if (!video || !video.videoWidth) return;
    const outW = 1080, outH = 1320;
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, outW, outH);
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(outW / vw, outH / vh);
    const dw = vw * scale, dh = vh * scale;
    ctx.drawImage(video, 0, 0, vw, vh, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    camStreamRef.current = null;

    const combined = [basePromptRef.current, peoplePromptsRef.current[numberOfPeopleRef.current]]
      .map(s => (s || '').trim()).filter(Boolean).join(' ');

    setPreviewPhase('processing');
    setPreviewError(null);
    setResultDataUrl(null);

    previewImageApi(dataUrl, combined, undefined).then(async res => {
      if (res.ok && res.data?.output_image_base64) {
        const rawUrl = `data:image/jpeg;base64,${res.data.output_image_base64}`;
        try {
          const composited = await compositeResultPreview(rawUrl, draftRef.current);
          setResultDataUrl(composited);
        } catch {
          setResultDataUrl(rawUrl);
        }
        setPreviewError(null);
      } else {
        setPreviewError(res.error || 'Generation failed.');
      }
      setPreviewPhase('result');
    }).catch(() => {
      setPreviewError('Request failed.');
      setPreviewPhase('result');
    });
  }, []);

  useEffect(() => {
    if (camCount <= 0) return undefined;
    const myId = camCountRunRef.current;
    const id = setTimeout(() => {
      if (myId !== camCountRunRef.current) return;
      if (camCount > 1) { setCamCount(c => c - 1); }
      else { setCamCount(0); snap(); }
    }, 1000);
    return () => clearTimeout(id);
  }, [camCount, snap]);

  const startCountdown = useCallback(() => {
    if (!camReady || camCount > 0) return;
    camCountRunRef.current += 1;
    setCamCount(3);
  }, [camReady, camCount]);

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

  const save = async (asNew) => {
    setSaveStatus('saving');
    setSaveError('');

    // Build the API payload
    const payload = {
      name: draft.name || 'Untitled',
      basePrompt,
      peoplePrompts: {
        1: peoplePrompts[1] || '',
        2: peoplePrompts[2] || '',
        3: peoplePrompts[3] || '',
        4: peoplePrompts[4] || '',
        5: peoplePrompts[5] || '',
      },
      overlayText: draft.overlayText || '',
      fontFamily: draft.fontFamily || '',
      fontSize: draft.fontSize || 42,
      textColor: draft.textColor || '#ffffff',
      textPosition: {
        x: Math.round(draft.textX ?? 50),
        y: Math.round(draft.textY ?? 50),
      },
      logoUrl: draft.logoUrl || '',
      templateImageUrl: draft.backgroundUrl || '',
      logoScale: draft.logoScale ?? 0.08,
      logoLocked: false,
      logoPosition: {
        x: Math.round(draft.logoX ?? 50),
        y: Math.round(draft.logoY ?? 50),
      },
    };

    let result;
    // Check if it's an update vs create
    // If not saving as new and we have an editorTemplateId that is not an object (meaning it's from DB)
    if (!asNew && editorTemplateId && !editorIsNew) {
       result = await updateTemplate(editorTemplateId, payload);
    } else {
       result = await createTemplate(payload);
    }

    if (!result.ok) {
      setSaveStatus('error');
      setSaveError(result.error || 'Failed to save template.');
      return;
    }

    setSaveStatus(null);
    setAdminRoute('templates');
  };

  return (
    <div className="template-editor-page">
      <div className="admin-page-head template-editor-page__head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">{editorIsNew ? 'Create template' : 'Edit template'}</h1>
          <p className="admin-page-sub">Adjust the look; the live app stays visual-only.</p>
        </div>
        <div className="template-editor-page__actions">
          <button type="button" className="btn btn-ghost" onClick={() => setAdminRoute('templates')} disabled={saveStatus === 'saving'}>
            Back
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={saveStatus === 'saving' || loading}>
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
        {saveStatus === 'error' && (
          <p className="template-save-error" role="alert">
            ⚠️ {saveError}
          </p>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '20px' }}>Loading template...</div>
      ) : (
        <div className="editor-split template-editor-page__split">
          <div className="preview-stage-wrap preview-stage-wrap--editor">
            <div ref={stageRef} className="preview-stage preview-stage--compact" style={{ position: 'relative', overflow: 'hidden' }}>
              {previewPhase === 'idle' && (
                idlePreviewUrl ? (
                  <img
                    src={idlePreviewUrl}
                    alt="Template preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#1a1a1a', color: '#777' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                    <span style={{ fontSize: 12, textAlign: 'center', padding: '0 20px', lineHeight: 1.5 }}>Click "Preview generate"<br/>to test your prompts</span>
                  </div>
                )
              )}

              {previewPhase === 'camera' && (
                <>
                  <video ref={camVideoRef} playsInline muted disablePictureInPicture style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} aria-hidden />
                  {!camReady && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#888', fontSize: 13 }}>
                      Starting camera…
                    </div>
                  )}
                  {camCount > 0 && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', pointerEvents: 'none' }}>
                      <span style={{ fontSize: 96, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{camCount}</span>
                    </div>
                  )}
                </>
              )}

              {previewPhase === 'processing' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#111' }}>
                  <style>{`@keyframes tpl-spin{to{transform:rotate(360deg)}}`}</style>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'tpl-spin 1s linear infinite' }} aria-hidden>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  <span style={{ fontSize: 13, color: '#888' }}>Generating…</span>
                </div>
              )}

              {previewPhase === 'result' && resultDataUrl && (
                <img
                  src={resultDataUrl}
                  alt="Preview result"
                  onClick={() => setShowResultModal(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                />
              )}

              {previewPhase === 'result' && !resultDataUrl && previewError && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 20px', background: '#111' }}>
                  <span style={{ color: '#f87171', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>{previewError}</span>
                </div>
              )}
            </div>

            {previewPhase === 'camera' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary template-editor-page__preview-btn"
                  onClick={startCountdown}
                  disabled={!camReady || camCount > 0}
                >
                  {camCount > 0 ? `Hold still… ${camCount}` : 'Take photo'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ flexShrink: 0 }}
                  onClick={() => { camCountRunRef.current += 1; setPreviewPhase('idle'); }}
                >
                  Cancel
                </button>
              </div>
            ) : previewPhase === 'result' ? (
              <button
                type="button"
                className="btn btn-primary template-editor-page__preview-btn"
                onClick={() => { setResultDataUrl(null); setPreviewError(null); setPreviewPhase('camera'); }}
              >
                Retry
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary template-editor-page__preview-btn"
                onClick={() => setPreviewPhase('camera')}
                disabled={previewPhase === 'processing'}
              >
                {previewPhase === 'processing' ? 'Processing…' : 'Preview generate'}
              </button>
            )}
            <p className="template-editor-page__preview-hint">Opens camera to capture a test photo, then sends to the AI.</p>
          </div>

        <div className="editor-scroll panel template-editor-page__form template-editor-form">
          <section className="editor-card gen-settings-card">
            <div className="gen-settings-header">
              <h2 className="gen-settings-title">Generation Settings</h2>
              <p className="gen-settings-sub">Create your base prompt and generate prompts for 1 to 5 people.</p>
            </div>

            <div className="field gen-settings-name-field">
              <label htmlFor="tn">Template name</label>
              <input
                id="tn"
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Untitled"
              />
            </div>

            {/* Base Prompt sub-card */}
            <div className="gen-sub-card">
              <div className="gen-sub-card__header">
                <span className="gen-sub-card__icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </span>
                <div>
                  <div className="gen-sub-card__title">Base Prompt</div>
                  <div className="gen-sub-card__desc">Enter the base prompt that will be used as a scene and outfit description for the generated image.</div>
                </div>
              </div>
              <div className="gen-sub-card__body">
                <textarea
                  id="base-prompt"
                  className="textarea gen-sub-card__textarea"
                  rows={4}
                  maxLength={BASE_PROMPT_MAX}
                  value={basePrompt}
                  onChange={(e) => setBasePrompt(e.target.value)}
                  placeholder="Enter your base prompt here..."
                />
                <div className="gen-sub-card__counter">{basePrompt.length}/{BASE_PROMPT_MAX}</div>
              </div>
            </div>

            {/* Number of People sub-card */}
            <div className="gen-sub-card">
              <div className="gen-sub-card__header">
                <span className="gen-sub-card__icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <div>
                  <div className="gen-sub-card__title">Number of People</div>
                  <div className="gen-sub-card__desc">Write a description for each person in the image.</div>
                </div>
              </div>
              <div className="gen-sub-card__body">
                <select
                  id="num-people"
                  className="select gen-sub-card__select"
                  value={numberOfPeople}
                  onChange={(e) => setNumberOfPeople(Number(e.target.value))}
                >
                  {PEOPLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Generated Prompt sub-card — editable per person count */}
            <div className="gen-sub-card">
              <div className="gen-sub-card__header">
                <span className="gen-sub-card__icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </span>
                <div>
                  <div className="gen-sub-card__title">Generated Prompt</div>
                  <div className="gen-sub-card__desc">
                    Write the prompt for{' '}
                    <strong>{PEOPLE_OPTIONS.find((o) => o.value === numberOfPeople)?.label}</strong>.
                    Switch the dropdown above to edit a different count.
                  </div>
                </div>
              </div>
              <div className="gen-sub-card__body">
                <textarea
                  id="generated-prompt"
                  className="textarea gen-sub-card__textarea"
                  rows={4}
                  maxLength={PEOPLE_PROMPT_MAX}
                  value={peoplePrompts[numberOfPeople]}
                  onChange={(e) => updatePeoplePrompt(numberOfPeople, e.target.value)}
                  placeholder={`Enter prompt for ${PEOPLE_OPTIONS.find((o) => o.value === numberOfPeople)?.label.toLowerCase()}...`}
                />
                <div className="gen-sub-card__counter gen-sub-card__counter--row">
                  <span className="gen-sub-card__filled-pills">
                    {PEOPLE_OPTIONS.map((o) => (
                      <span
                        key={o.value}
                        className={`gen-pill ${o.value === numberOfPeople ? 'gen-pill--active' : ''
                          } ${peoplePrompts[o.value].trim() ? 'gen-pill--filled' : ''}`}
                        onClick={() => setNumberOfPeople(o.value)}
                        title={o.label}
                      >
                        {o.value}
                      </span>
                    ))}
                  </span>
                  <span>{peoplePrompts[numberOfPeople].length}/{PEOPLE_PROMPT_MAX}</span>
                </div>
              </div>
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
                cta="Upload Logo"
                subtitle="Drag & drop or click to upload"
                onChange={onLogoFile}
                uploaded={!!draft.logoUrl}
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

          <section className="editor-card">
            <h2 className="editor-card__title">Upload Cover</h2>
            <div className="editor-card__grid">
              <FileUploadRow
                id="tpl-cover"
                title="Cover Image"
                cta="Upload Cover Image"
                subtitle="JPG, PNG · Recommended 1080×1080 or 1080×1920"
                onChange={onBgFile}
                uploaded={!!draft.backgroundUrl}
              />
            </div>
          </section>
        </div>
      </div>
      )}

      {showResultModal && resultDataUrl && (
        <div
          onClick={() => setShowResultModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.93)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={resultDataUrl}
            alt="Generated preview"
            style={{
              maxWidth: '90vw',
              maxHeight: '95vh',
              objectFit: 'contain',
              borderRadius: 8,
              display: 'block',
            }}
          />
        </div>
      )}
    </div>
  );
}
