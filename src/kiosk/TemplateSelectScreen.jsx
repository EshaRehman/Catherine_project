import React from 'react';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { getTemplateTagline } from '../constants/templateTaglines.js';

export function TemplateSelectScreen({ templates, onPick, onBack }) {
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
          <div className="kiosk-templates-grid kiosk-templates-grid--themes kiosk-templates-grid--themes-row">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="kiosk-tpl-card kiosk-tpl-card--hover-select"
                aria-label={`Select ${t.name}`}
                onClick={() => onPick(t.id)}
              >
                <div className="kiosk-tpl-card__visual">
                  <TemplateThemePreview template={t} variant="kiosk" />
                  <div className="kiosk-tpl-card__select-layer" aria-hidden>
                    <span className="kiosk-tpl-card__select-label">Select</span>
                  </div>
                </div>
                <div className="kiosk-tpl-footer">
                  <div className="kiosk-tpl-title">{t.name}</div>
                  {getTemplateTagline(t.previewClass) ? (
                    <div className="kiosk-tpl-tagline">{getTemplateTagline(t.previewClass)}</div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
