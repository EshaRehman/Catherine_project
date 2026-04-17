import React, { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';

function IconEdit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
      />
    </svg>
  );
}

function IconDuplicate() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
      <path
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"
      />
    </svg>
  );
}

export function TemplatesPage() {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { templates, openTemplateEditor, deleteTemplate, duplicateTemplate } = useApp();

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
          <h1 className="admin-page-title">
            Template <span className="text-brand-gradient">library</span>
          </h1>
          <p className="admin-page-sub">Manage themes, backgrounds, and preview looks.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openTemplateEditor(null)}>
          + Create template
        </button>
      </div>

      <div className="card-grid card-grid--templates">
        {templates.map((t) => (
          <article key={t.id} className="card admin-card">
            <div className="card-preview">
              <TemplateThemePreview template={t} variant="admin" />
            </div>
            <div className="card-body">
              <h2 className="card-title card-title--template-lib">
                <span className="text-brand-gradient">
                  {t.name?.trim() ? t.name.trim() : 'Unnamed template'}
                </span>
              </h2>
              <div className="card-actions card-actions--template-lib" role="group" aria-label="Template actions">
                <button
                  type="button"
                  className="btn btn-icon btn-ghost btn-sm"
                  onClick={() => openTemplateEditor(t.id)}
                  aria-label={`Edit ${t.name || 'template'}`}
                  title="Edit"
                >
                  <IconEdit />
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost btn-sm"
                  onClick={() => duplicateTemplate(t.id)}
                  aria-label={`Duplicate ${t.name || 'template'}`}
                  title="Duplicate"
                >
                  <IconDuplicate />
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost btn-sm btn-icon--danger"
                  onClick={() => setDeleteTarget({ id: t.id, name: t.name || 'template' })}
                  aria-label={`Delete ${t.name || 'template'}`}
                  title="Delete"
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
