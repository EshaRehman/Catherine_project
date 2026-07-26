import React, { useState } from 'react';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';

export function TemplateSelectScreen({ templates, onPick, onBack }) {
  // Tapping the card body only previews it (reveals the Select pill +
  // highlight ring, same as before). Only tapping Select itself commits —
  // briefly flash its border, then advance to the next screen.
  const [activeId, setActiveId] = useState(null);
  const [committingId, setCommittingId] = useState(null);

  const handleConfirm = (id) => {
    if (committingId) return; // ignore further taps once one is committing
    setActiveId(id);
    setCommittingId(id);
    setTimeout(() => onPick(id), 200);
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
                <div
                  key={t.id}
                  className={`kiosk-tpl-card kiosk-tpl-card--hover-select${activeId === t.id ? ' is-selected' : ''}${committingId === t.id ? ' is-picking' : ''}`}
                  role="group"
                  aria-label={t.name}
                  tabIndex={0}
                  onClick={() => setActiveId(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveId(t.id);
                    }
                  }}
                >
                  <div className="kiosk-tpl-card__visual">
                    <TemplateThemePreview template={t} variant="kiosk" />
                    <div className="kiosk-tpl-card__select-layer">
                      <button
                        type="button"
                        className="kiosk-tpl-card__select-label"
                        aria-label={`Select ${t.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConfirm(t.id);
                        }}
                      >
                        Select
                      </button>
                    </div>
                  </div>
                  <div className="kiosk-tpl-footer kiosk-tpl-footer--title-only">
                    <div className="kiosk-tpl-title">{t.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
