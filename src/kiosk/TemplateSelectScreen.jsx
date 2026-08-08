import React, { useState } from 'react';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';

export function TemplateSelectScreen({ templates, onPick, onBack }) {
  // One tap commits. This used to be two-step — the card body only revealed the
  // Select pill and you had to hit the pill itself to advance — but on a touch
  // kiosk that reads as an unresponsive card: guests tapped the artwork, saw a
  // highlight, and tapped again. The Select pill is kept for the affordance and
  // still works; it just no longer gates the flow.
  //
  // The trade-off is deliberate: a mis-tap now advances instead of only
  // highlighting. handleConfirm's committingId guard means the first tap wins and
  // further taps are ignored, so a double-tap cannot fire onPick twice.
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
                  onClick={() => handleConfirm(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleConfirm(t.id);
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
