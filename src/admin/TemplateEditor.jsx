import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/* Prompts run 1-4. A photo with more than 4 people falls back to the 4-person
   prompt (see MAX_PEOPLE in the backend's routes/generate.py). */
const PEOPLE_OPTIONS = [
  { value: 1, label: '1 Person' },
  { value: 2, label: '2 People' },
  { value: 3, label: '3 People' },
  { value: 4, label: '4 People' },
];

const BASE_PROMPT_MAX = 10000;
const PEOPLE_PROMPT_MAX = 10000;

const defaultPeoplePrompts = () => ({ 1: '', 2: '', 3: '', 4: '' });

/**
 * Build a background from the template name alone.
 *
 * The API requires templateImageUrl (TemplateCreate sets min_length=1), but a
 * background is only ever a card/backdrop image — nothing about generation
 * depends on it. Rather than refuse the save, stand in a titled panel so a
 * template can be created from its prompts alone and a real image dropped in
 * later. Drawn at the booth's 1080x1320 capture aspect.
 */
function makeNamePlaceholderBackground(name) {
  const W = 1080, H = 1320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#161a2e');
  bg.addColorStop(0.55, '#1d1b33');
  bg.addColorStop(1, '#241a2c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft glow so the flat gradient does not read as a broken/missing image.
  const glow = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, W * 0.72);
  glow.addColorStop(0, 'rgba(124, 92, 255, 0.30)');
  glow.addColorStop(1, 'rgba(124, 92, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // Wrap the name by words so a long title stays inside the frame.
  const title = (name || 'Untitled').trim() || 'Untitled';
  ctx.font = '700 92px "DM Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxW = W - 200;
  const lines = [];
  let line = '';
  for (const word of title.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  const lineH = 108;
  let y = H / 2 - ((lines.length - 1) * lineH) / 2;
  ctx.fillStyle = '#ffffff';
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += lineH;
  }

  /* Deliberately no caption line. This image is a real background — the kiosk
     shows it behind the result, where it gets cropped mid-word and reads as a
     broken asset. The name alone is the whole design. */

  return canvas.toDataURL('image/jpeg', 0.9);
}

const SCENE_VAR_FIELDS = [
  { key: 'poses',       label: 'Poses',       placeholder: 'e.g. commanding', token: '{pose}' },
  { key: 'expressions', label: 'Expressions', placeholder: 'e.g. smiling',    token: '{expression}' },
  { key: 'angles',      label: 'Camera angles', placeholder: 'e.g. front-on', token: '{angle}' },
  { key: 'sizes',       label: 'Sizes',       placeholder: 'e.g. 50%',        token: '{size}' },
  { key: 'placements',  label: 'Placements',  placeholder: 'e.g. center',     token: '{placement}' },
];

/* Per-variable state, derived from whether the prompts actually reference the
   token. Kept in one place so the wording and the colour always agree.
     ok      — token used, options present: substitution will work
     missing — token used, no options: substitute_scene_vars leaves the token in
               the prompt, so the AI is literally sent "{pose}"
     unused  — options present, no prompt references the token: dead data
     idle    — neither: nothing to say */
const VAR_STATUS = {
  ok:      { color: '#5cd6a0', text: (t) => `Used by your prompt — one option replaces ${t} at generation time.` },
  missing: { color: '#ff8f6b', text: (t) => `Your prompt uses ${t} but there are no options, so the AI is sent the literal text ${t}. Add at least one option.` },
  unused:  { color: '#e0b356', text: (t) => `No prompt references ${t}, so these options are never used.` },
  idle:    { color: null,      text: () => 'Not used by this template.' },
};

function TagInput({ label, token, placeholder, items, onChange, status = 'idle' }) {
  const [input, setInput] = useState('');

  const add = () => {
    const val = input.trim();
    if (!val || items.includes(val)) return;
    onChange([...items, val]);
    setInput('');
  };

  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="field field--full">
      <div className="field-heading">
        {label} <code style={{ fontSize: 11, opacity: 0.6, fontWeight: 400, marginLeft: 4 }}>{token}</code>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={add}>
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map((item, idx) => (
            <span
              key={idx}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 6, padding: '3px 8px', fontSize: 12, color: '#ccc',
              }}
            >
              {item}
              <button
                type="button"
                onClick={() => remove(idx)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 13, padding: 0, lineHeight: 1 }}
                aria-label={`Remove ${item}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="field-help" style={VAR_STATUS[status].color ? { color: VAR_STATUS[status].color } : undefined}>
        {VAR_STATUS[status].text(token)}
      </p>
    </div>
  );
}

export function TemplateEditor() {
  const {
    editorTemplateId,
    editorIsNew,
    setAdminRoute,
    createDefaultTemplate,
    settings,
  } = useApp();

  const [draft, setDraft] = useState(() => createDefaultTemplate());
  const [previewPhase, setPreviewPhase] = useState('idle'); // 'idle'|'camera'|'processing'|'result'
  const [rawResultDataUrl, setRawResultDataUrl] = useState(null);  // raw AI output (no overlay)
  const [resultDataUrl, setResultDataUrl] = useState(null);        // composited (used only for modal)
  const [idlePreviewUrl, setIdlePreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  /* null when closed, otherwise the list of person counts with no prompt yet. */
  const [promptGate, setPromptGate] = useState(null);
  const [stageScale, setStageScale] = useState(1); // preview stage width / 1080
  const [camReady, setCamReady] = useState(false);
  const [camCount, setCamCount] = useState(0);
  const [basePrompt, setBasePrompt] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [peoplePrompts, setPeoplePrompts] = useState(defaultPeoplePrompts);
  const [poses, setPoses] = useState([]);
  const [expressions, setExpressions] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [angles, setAngles] = useState([]);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'error'
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const camVideoRef = useRef(null);
  const promptTextareaRef = useRef(null);
  const camStreamRef = useRef(null);
  const camCountRunRef = useRef(0);
  const basePromptRef = useRef(basePrompt);
  const peoplePromptsRef = useRef(peoplePrompts);
  const numberOfPeopleRef = useRef(numberOfPeople);
  const draftRef = useRef(draft);
  const posesRef = useRef(poses);
  const expressionsRef = useRef(expressions);
  const sizesRef = useRef(sizes);
  const placementsRef = useRef(placements);
  const anglesRef = useRef(angles);
  const aiModeRef = useRef(settings.aiMode);

  const updatePeoplePrompt = (count, value) => {
    setPeoplePrompts((prev) => ({ ...prev, [count]: value }));
  };

  /* Everything that lives outside `draft`. The load effect below MUST run this
     on every path that is not "loaded an existing template", otherwise the
     previous template's prompts and scene variables stay on screen and get
     saved onto whatever is opened next — including across a local/paid mode
     switch, and including onto a brand-new template. */
  const resetPromptFields = useCallback(() => {
    setBasePrompt('');
    setPeoplePrompts(defaultPeoplePrompts());
    setNumberOfPeople(1);
    setPoses([]);
    setExpressions([]);
    setSizes([]);
    setPlacements([]);
    setAngles([]);
  }, []);

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
          /* Always assign, never conditionally: a template with no saved
             peoplePrompts must clear the form, not inherit the last one's
             prompts and then save them over this template. */
          setPeoplePrompts({ ...defaultPeoplePrompts(), ...(t.peoplePrompts || {}) });
          setNumberOfPeople(1);
          setPoses(Array.isArray(t.poses) ? t.poses : []);
          setExpressions(Array.isArray(t.expressions) ? t.expressions : []);
          setSizes(Array.isArray(t.sizes) ? t.sizes : []);
          setPlacements(Array.isArray(t.placements) ? t.placements : []);
          setAngles(Array.isArray(t.angles) ? t.angles : []);
        } else {
           // Handle error finding it
           setDraft(createDefaultTemplate());
           resetPromptFields();
        }
        setLoading(false);
      } else {
        setDraft(createDefaultTemplate());
        resetPromptFields();
      }
    };

    loadData();
  }, [editorTemplateId, editorIsNew, createDefaultTemplate, resetPromptFields]);

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

  useEffect(() => {
    if (!promptGate) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPromptGate(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promptGate]);

  // Keep refs in sync so snap() can read current values without stale closures
  useEffect(() => { basePromptRef.current = basePrompt; }, [basePrompt]);
  useEffect(() => { peoplePromptsRef.current = peoplePrompts; }, [peoplePrompts]);
  useEffect(() => { numberOfPeopleRef.current = numberOfPeople; }, [numberOfPeople]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { posesRef.current = poses; }, [poses]);
  useEffect(() => { expressionsRef.current = expressions; }, [expressions]);
  useEffect(() => { sizesRef.current = sizes; }, [sizes]);
  useEffect(() => { placementsRef.current = placements; }, [placements]);
  useEffect(() => { anglesRef.current = angles; }, [angles]);
  useEffect(() => { aiModeRef.current = settings.aiMode; }, [settings.aiMode]);

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

    const pickRandom = (arr) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    let combined = (peoplePromptsRef.current[numberOfPeopleRef.current] || '').trim();
    const sceneVarMap = {
      '{pose}': posesRef.current,
      '{expression}': expressionsRef.current,
      '{size}': sizesRef.current,
      '{placement}': placementsRef.current,
      '{angle}': anglesRef.current,
    };
    for (const [token, options] of Object.entries(sceneVarMap)) {
      if (combined.includes(token) && options.length) {
        combined = combined.replace(token, pickRandom(options));
      }
    }

    setPreviewPhase('processing');
    setPreviewError(null);
    setRawResultDataUrl(null);
    setResultDataUrl(null);

    previewImageApi(dataUrl, combined, undefined, aiModeRef.current).then(async res => {
      if (res.ok && res.data?.output_image_base64) {
        const rawUrl = `data:image/jpeg;base64,${res.data.output_image_base64}`;
        // Store raw AI output — overlay is rendered live as HTML so it stays fully editable
        setRawResultDataUrl(rawUrl);
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

  // Track preview stage width so we can scale font/logo sizes correctly in the live overlay
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setStageScale(entry.contentRect.width / 1080);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Open zoom modal: composite the raw result with current draft settings on-demand
  const openModal = useCallback(async () => {
    if (!rawResultDataUrl) return;
    setShowResultModal(true);
    setResultDataUrl(null); // clear stale
    try {
      const url = await compositeResultPreview(rawResultDataUrl, draft);
      setResultDataUrl(url);
    } catch {
      setResultDataUrl(rawResultDataUrl);
    }
  }, [rawResultDataUrl, draft]);

  /* Mirrors what the backend actually does at generation time
     (substitute_scene_vars in routes/generate.py) so the editor can flag a
     template that would generate badly *before* it is saved. The curated
     templates never hit these cases; a hand-built one easily can. */
  const promptCheck = useMemo(() => {
    const counts = PEOPLE_OPTIONS.map((o) => o.value);
    const emptyCounts = counts.filter((v) => !(peoplePrompts[v] || '').trim());
    const allPromptText = counts.map((v) => peoplePrompts[v] || '').join('\n');
    const stateMap = { poses, expressions, sizes, placements, angles };

    const perField = {};
    const tokensMissingOptions = [];
    const optionsNeverUsed = [];
    for (const field of SCENE_VAR_FIELDS) {
      const tokenUsed = allPromptText.includes(field.token);
      const hasOptions = stateMap[field.key].length > 0;
      if (tokenUsed && hasOptions) perField[field.key] = 'ok';
      else if (tokenUsed) { perField[field.key] = 'missing'; tokensMissingOptions.push(field); }
      else if (hasOptions) { perField[field.key] = 'unused'; optionsNeverUsed.push(field); }
      else perField[field.key] = 'idle';
    }
    return { emptyCounts, perField, tokensMissingOptions, optionsNeverUsed };
  }, [peoplePrompts, poses, expressions, sizes, placements, angles]);

  const save = async (asNew) => {
    /* The one hard requirement: a prompt for every person count. Everything
       else on this page is optional. Without all four, a photo with that many
       guests reaches the AI with an empty prompt (see get_people_prompt_for_count
       — the key exists, so the backend does not error, it just generates from
       nothing). Blocked here with a dialog naming the missing counts. */
    if (promptCheck.emptyCounts.length > 0) {
      setSaveStatus(null);
      setSaveError('');
      setPromptGate(promptCheck.emptyCounts);
      return;
    }

    setSaveStatus('saving');
    setSaveError('');

    /* Save with or without a background. The API insists on a non-empty
       templateImageUrl, so when none was uploaded, stand in a panel carrying
       the template name instead of blocking the save. Mirrored back into the
       draft so the editor shows what was actually stored. */
    let backgroundUrl = draft.backgroundUrl;
    if (!backgroundUrl) {
      backgroundUrl = makeNamePlaceholderBackground(draft.name);
      setDraft((d) => ({ ...d, backgroundUrl }));
    }

    // Build the API payload
    const payload = {
      name: draft.name || 'Untitled',
      mode: settings.aiMode,
      basePrompt: '',
      peoplePrompts: {
        1: peoplePrompts[1] || '',
        2: peoplePrompts[2] || '',
        3: peoplePrompts[3] || '',
        4: peoplePrompts[4] || '',
      },
      poses,
      expressions,
      sizes,
      placements,
      angles,
      overlayText: draft.overlayText || '',
      fontFamily: draft.fontFamily || '',
      fontSize: draft.fontSize || 42,
      textColor: draft.textColor || '#ffffff',
      textPosition: {
        x: Math.round(draft.textX ?? 50),
        y: Math.round(draft.textY ?? 50),
      },
      logoUrl: draft.logoUrl || '',
      templateImageUrl: backgroundUrl,
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

              {previewPhase === 'result' && rawResultDataUrl && (
                <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                  {/* Raw AI output as base */}
                  <img
                    src={rawResultDataUrl}
                    alt="Preview result"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />

                  {/* Live text overlay — drag to reposition */}
                  {draft.overlayText?.trim() && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${draft.textX}%`,
                        top: `${draft.textY}%`,
                        transform: 'translate(-50%, -50%)',
                        fontFamily: draft.fontFamily || 'sans-serif',
                        fontSize: Math.max(8, Math.round((draft.fontSize || 42) * stageScale)),
                        fontWeight: 700,
                        color: draft.textColor || '#fff',
                        textShadow: '0 1px 6px rgba(0,0,0,0.6)',
                        WebkitTextStroke: `${Math.max(1, Math.round((draft.fontSize || 42) * stageScale * 0.04))}px rgba(0,0,0,0.35)`,
                        cursor: 'grab',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'all',
                        zIndex: 5,
                        outline: '1.5px dashed rgba(255,255,255,0.4)',
                        outlineOffset: 4,
                        padding: '2px 4px',
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragRef.current = 'text';
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      title="Drag to move text"
                    >
                      {draft.overlayText}
                    </div>
                  )}

                  {/* Live logo overlay — drag to reposition */}
                  {draft.logoUrl && (
                    <img
                      src={draft.logoUrl}
                      draggable={false}
                      alt=""
                      style={{
                        position: 'absolute',
                        left: `${draft.logoX}%`,
                        top: `${draft.logoY}%`,
                        transform: 'translate(-50%, -50%)',
                        width: `${(draft.logoScale || 0.2) * 100}%`,
                        height: 'auto',
                        cursor: 'grab',
                        userSelect: 'none',
                        pointerEvents: 'all',
                        zIndex: 5,
                        outline: '1.5px dashed rgba(255,255,255,0.4)',
                        outlineOffset: 3,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragRef.current = 'logo';
                        e.currentTarget.setPointerCapture(e.pointerId);
                        e.preventDefault();
                      }}
                      title="Drag to move logo"
                    />
                  )}

                  {/* Zoom hint */}
                  <button
                    type="button"
                    onClick={openModal}
                    style={{
                      position: 'absolute', bottom: 6, right: 6,
                      background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)',
                      color: '#fff', fontSize: 10, padding: '3px 7px', borderRadius: 5,
                      cursor: 'pointer', zIndex: 10,
                    }}
                  >
                    🔍 Zoom
                  </button>
                </div>
              )}

              {previewPhase === 'result' && !rawResultDataUrl && previewError && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 20px', background: '#111' }}>
                  <span style={{ color: '#f87171', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>⚠️ {previewError}</span>
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
                onClick={() => { setRawResultDataUrl(null); setResultDataUrl(null); setPreviewError(null); setPreviewPhase('camera'); }}
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
              {/* 1 to 4, matching PEOPLE_OPTIONS and the backend's MAX_PEOPLE.
                  A photo with more than 4 people reuses the 4-person prompt. */}
              <p className="gen-settings-sub">Create your base prompt and generate prompts for 1 to 4 people.</p>
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

            {/* Base Prompt per person count sub-card */}
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
                  <div className="gen-sub-card__desc">Select a person count then write the full prompt for that count. Use <code style={{ fontSize: 11 }}>{'{pose}'}</code>, <code style={{ fontSize: 11 }}>{'{expression}'}</code>, <code style={{ fontSize: 11 }}>{'{size}'}</code>, <code style={{ fontSize: 11 }}>{'{placement}'}</code> as placeholders.</div>
                </div>
              </div>
              <div className="gen-sub-card__body">
                <select
                  className="select gen-sub-card__select"
                  value={numberOfPeople}
                  onChange={(e) => setNumberOfPeople(Number(e.target.value))}
                >
                  {PEOPLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <textarea
                  ref={promptTextareaRef}
                  className="textarea gen-sub-card__textarea"
                  style={{ marginTop: 10 }}
                  rows={6}
                  maxLength={PEOPLE_PROMPT_MAX}
                  value={peoplePrompts[numberOfPeople]}
                  onChange={(e) => updatePeoplePrompt(numberOfPeople, e.target.value)}
                  placeholder={`Enter base prompt for ${PEOPLE_OPTIONS.find((o) => o.value === numberOfPeople)?.label.toLowerCase()}…`}
                />
                <div className="gen-sub-card__counter gen-sub-card__counter--row">
                  <span className="gen-sub-card__filled-pills">
                    {PEOPLE_OPTIONS.map((o) => (
                      <span
                        key={o.value}
                        className={`gen-pill ${o.value === numberOfPeople ? 'gen-pill--active' : ''} ${peoplePrompts[o.value].trim() ? 'gen-pill--filled' : ''}`}
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

            {/* Scene Variables sub-card */}
            <div className="gen-sub-card">
              <div className="gen-sub-card__header">
                <span className="gen-sub-card__icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                  </svg>
                </span>
                <div>
                  <div className="gen-sub-card__title">Scene Variables</div>
                  <div className="gen-sub-card__desc">
                    Add options for each variable. At generation time one is picked at random and replaces the matching token in your base prompt (e.g. <code style={{ fontSize: 11 }}>{'{pose}'}</code>).
                  </div>
                </div>
              </div>
              <div className="gen-sub-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {SCENE_VAR_FIELDS.map((field) => {
                  const stateMap = { poses, expressions, sizes, placements, angles };
                  const setterMap = { poses: setPoses, expressions: setExpressions, sizes: setSizes, placements: setPlacements, angles: setAngles };
                  return (
                    <TagInput
                      key={field.key}
                      label={field.label}
                      token={field.token}
                      placeholder={field.placeholder}
                      items={stateMap[field.key]}
                      onChange={setterMap[field.key]}
                      status={promptCheck.perField[field.key]}
                    />
                  );
                })}
              </div>
            </div>

            {/* Pre-save check. Only rendered when something is actually wrong,
                so a correctly built template shows no clutter. */}
            {(promptCheck.emptyCounts.length > 0 || promptCheck.tokensMissingOptions.length > 0) && (
              <div className="gen-sub-card" style={{ borderColor: 'rgba(255,143,107,0.35)' }}>
                <div className="gen-sub-card__header">
                  <span className="gen-sub-card__icon" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4M12 17h.01" />
                    </svg>
                  </span>
                  <div>
                    <div className="gen-sub-card__title">Needs attention before this template is used</div>
                    <div className="gen-sub-card__desc">
                      A missing prompt blocks saving. The rest is advisory — it would still save,
                      but the generation would come out wrong.
                    </div>
                  </div>
                </div>
                <div className="gen-sub-card__body">
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#e2c4b6' }}>
                    {promptCheck.emptyCounts.length > 0 && (
                      <li>
                        No prompt written for{' '}
                        <strong>{promptCheck.emptyCounts.map((c) => `${c} ${c === 1 ? 'person' : 'people'}`).join(', ')}</strong>.
                        {' '}A photo with that many people would be sent an empty prompt. Fill all four using the number pills above.
                      </li>
                    )}
                    {promptCheck.tokensMissingOptions.map((f) => (
                      <li key={f.key}>
                        Your prompt uses <code>{f.token}</code> but <strong>{f.label}</strong> has no options —
                        the AI would receive the literal text <code>{f.token}</code>. Add an option or remove the token.
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

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

      {/* Save gate: a prompt is required for all four person counts. Clicking a
          count closes the dialog and drops the caret straight into that prompt. */}
      {promptGate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="prompt-gate-title"
          onClick={() => setPromptGate(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(6,7,15,0.78)',
            backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440,
              background: 'linear-gradient(180deg, #191c2e 0%, #14161f 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
              padding: '22px 22px 18px',
              color: '#e8e8ee',
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span
                aria-hidden
                style={{
                  flexShrink: 0, width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(255,143,107,0.14)',
                  border: '1px solid rgba(255,143,107,0.32)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ff8f6b',
                }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <h3 id="prompt-gate-title" style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                  Add a prompt for every person count
                </h3>
                <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.5, color: '#a8abbd' }}>
                  A template needs its own prompt for 1, 2, 3 and 4 people. Without one, a photo
                  with that many guests is sent to the AI with an empty prompt. Everything else
                  on this page is optional.
                </p>
              </div>
            </div>

            <p style={{ margin: '18px 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7f8296' }}>
              Still missing
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {promptGate.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setNumberOfPeople(count);
                    setPromptGate(null);
                    /* Land the operator in the box that needs filling. A short
                       timeout rather than requestAnimationFrame: rAF can fire
                       before React has committed the swapped-in textarea, and
                       the focus is then lost. Focus first with preventScroll so
                       the browser's instant jump does not fight the smooth
                       scroll that follows. */
                    setTimeout(() => {
                      const el = promptTextareaRef.current;
                      if (!el) return;
                      el.focus({ preventScroll: true });
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 60);
                  }}
                  style={{
                    background: 'rgba(255,143,107,0.10)',
                    border: '1px solid rgba(255,143,107,0.30)',
                    color: '#ffb59a',
                    borderRadius: 9, padding: '8px 13px',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {count} {count === 1 ? 'person' : 'people'} →
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPromptGate(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showResultModal && (
        <div
          onClick={() => setShowResultModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.93)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          {resultDataUrl ? (
            <img
              src={resultDataUrl}
              alt="Generated preview"
              style={{ maxWidth: '90vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8, display: 'block' }}
            />
          ) : (
            <div style={{ color: '#888', fontSize: 13 }}>Compositing…</div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowResultModal(false); }}
            style={{
              position: 'fixed', top: 16, right: 18,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', width: 36, height: 36, borderRadius: 8,
              cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      )}
    </div>
  );
}
