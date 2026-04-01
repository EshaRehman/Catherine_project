import React from 'react';
import { useApp } from '../state/AppContext.jsx';

function PreviewThumb({ template }) {
  if (template.backgroundUrl) {
    return <img className="card-preview-img" src={template.backgroundUrl} alt="" />;
  }
  return (
    <div className={`card-preview ${template.previewClass || 'tpl-preview--luxury'}`} />
  );
}

export function TemplatesPage() {
  const {
    templates,
    setTemplates,
    openTemplateEditor,
    deleteTemplate,
    duplicateTemplate,
    createDefaultTemplate,
  } = useApp();

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Templates</h1>
          <p className="admin-page-sub">
            F1 Racing, Cyberpunk Portrait, and Luxury Editorial are included by default.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const t = createDefaultTemplate({ previewClass: 'tpl-preview--luxury' });
            setTemplates((prev) => [...prev, t]);
            openTemplateEditor(t.id, true);
          }}
        >
          + Create template
        </button>
      </div>

      <div className="card-grid">
        {templates.map((t) => (
          <article key={t.id} className="card">
            <div className="card-preview">
              <PreviewThumb template={t} />
            </div>
            <div className="card-body">
              <h2 className="card-title">{t.name}</h2>
              <p className="card-meta">
                {t.previewClass === 'tpl-preview--f1' && 'Motion · neon · race aesthetic'}
                {t.previewClass === 'tpl-preview--cyber' && 'Neon · futuristic city'}
                {t.previewClass === 'tpl-preview--luxury' && 'Editorial · soft light · fashion'}
              </p>
              <div className="card-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openTemplateEditor(t.id, false)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => duplicateTemplate(t.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (window.confirm(`Delete template “${t.name}”?`)) deleteTemplate(t.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
