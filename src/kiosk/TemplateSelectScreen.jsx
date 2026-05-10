import React, { useEffect, useState } from 'react';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';

export function TemplateSelectScreen({ templates, onPick, onBack }) {
  const [selectedId, setSelectedId] = useState(() => templates[0]?.id ?? null);

  useEffect(() => {
    setSelectedId((prev) => {
      if (!templates.length) return null;
      if (prev && templates.some((t) => t.id === prev)) return prev;
      return templates[0].id;
    });
  }, [templates]);

  const handleContinue = () => {
    if (selectedId) onPick(selectedId);
  };

  return (
    <div className="kiosk-templates kiosk-templates--stage">
      <header className="kiosk-stage-header">
        <button type="button" className="kiosk-nav-back" onClick={onBack}>
          <span className="kiosk-nav-back__chevron" aria-hidden />
          Back
        </button>
      </header>
      <div className="kiosk-templates__body">
        <div className="kiosk-templates__center">
          <div className="kiosk-templates__center-inner">
            <h1 className="kiosk-templates__headline" aria-label="Choose a look">
              <span className="kiosk-templates__headline-choose">CHOOSE</span>{' '}
              <span className="kiosk-templates__headline-look">A LOOK</span>
            </h1>
            <div className="kiosk-templates-grid kiosk-templates-grid--themes kiosk-templates-grid--themes-row">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`kiosk-tpl-card kiosk-tpl-card--hover-select${selectedId === t.id ? ' is-selected' : ''}`}
                  aria-label={`Select ${t.name}`}
                  aria-pressed={selectedId === t.id}
                  onClick={() => setSelectedId(t.id)}
                >
                  <div className="kiosk-tpl-card__visual">
                    <TemplateThemePreview template={t} variant="kiosk" />
                    <div className="kiosk-tpl-card__select-layer" aria-hidden>
                      <span className="kiosk-tpl-card__select-label">Select</span>
                    </div>
                  </div>
                  <div className="kiosk-tpl-footer kiosk-tpl-footer--title-only">
                    <div className="kiosk-tpl-title">{t.name}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="kiosk-templates__actions">
              <button
                type="button"
                className="kiosk-tap kiosk-tap--continue"
                onClick={handleContinue}
                disabled={!selectedId}
              >
                <span className="kiosk-tap__shine" aria-hidden />
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
