import React, { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { getTemplateTagline } from '../constants/templateTaglines.js';
import { ConfirmModal } from '../components/ConfirmModal.jsx';

export function TemplatesPage() {
  const [deleteTarget, setDeleteTarget] = useState(null);
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
      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete template"
        message={
          deleteTarget
            ? `“${deleteTarget.name}” will be removed. This can’t be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deleteTarget) deleteTemplate(deleteTarget.id);
        }}
        onClose={() => setDeleteTarget(null)}
      />
      <div className="admin-page-head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">Templates</h1>
          <p className="admin-page-sub">Manage themes, backgrounds, and preview looks.</p>
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

      <div className="card-grid card-grid--templates">
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
                  onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
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
