import React, { useEffect, useRef, useState } from 'react';
import { KioskTemplateStyleCard } from '../components/KioskTemplateStyleCard.jsx';
import { KioskHeaderTrailing } from './KioskHeaderTrailing.jsx';
import { KioskOrbitChrome } from './KioskOrbitChrome.jsx';

export function TemplateSelectScreen({ templates, onPick, onBack }) {
  const backRef = useRef(null);
  const [selectedId, setSelectedId] = useState(() => templates[0]?.id ?? null);

  useEffect(() => {
    if (!templates.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev != null && templates.some((t) => t.id === prev) ? prev : templates[0].id,
    );
  }, [templates]);

  return (
    <div className="kiosk-templates kiosk-templates--stage">
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
      <div className="kiosk-templates__body">
        <div className="kiosk-templates__center">
          <div className="kiosk-templates__center-inner">
            <p className="kiosk-templates__hint">
              <span className="kiosk-templates__hint-choose">Choose</span>{' '}
              <span className="text-brand-gradient">A Look</span>
            </p>
            <div
              className="kiosk-templates-grid kiosk-templates-grid--themes kiosk-templates-grid--themes-row"
              role="radiogroup"
              aria-label="Portrait styles"
            >
              {templates.map((t) => (
                <KioskTemplateStyleCard
                  key={t.id}
                  template={t}
                  selected={t.id === selectedId}
                  onActivate={() => setSelectedId(t.id)}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary kiosk-templates__continue"
              disabled={selectedId == null}
              onClick={() => selectedId != null && onPick(selectedId)}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
