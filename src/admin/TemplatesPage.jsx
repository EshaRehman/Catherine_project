import React from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { getTemplateTagline } from '../constants/templateTaglines.js';

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
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const t = createDefaultTemplate({ previewClass: 'tpl-preview--thrones' });
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
              <TemplateThemePreview template={t} variant="admin" />
            </div>
            <div className="card-body">
              <h2 className="card-title">{t.name}</h2>
              <p className="card-meta">
                {getTemplateTagline(t.previewClass) || 'Custom template'}
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
