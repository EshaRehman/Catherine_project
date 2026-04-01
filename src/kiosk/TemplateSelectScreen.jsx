import React from 'react';

function PreviewBlock({ template }) {
  if (template.backgroundUrl) {
    return (
      <img
        className="kiosk-tpl-visual card-preview-img"
        src={template.backgroundUrl}
        alt=""
      />
    );
  }
  return (
    <div
      className={`kiosk-tpl-visual ${template.previewClass || 'tpl-preview--luxury'}`}
    />
  );
}

export function TemplateSelectScreen({ templates, onPick, onBack }) {
  return (
    <div className="kiosk-templates">
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← Back
        </button>
      </div>
      <div className="kiosk-templates-grid">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className="kiosk-tpl-card"
            onClick={() => onPick(t.id)}
          >
            <PreviewBlock template={t} />
            <div className="kiosk-tpl-name">{t.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
