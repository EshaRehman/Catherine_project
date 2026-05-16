import React, { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { getTemplateTagline } from '../constants/templateTaglines.js';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { getTemplates, deleteTemplate as apiDeleteTemplate } from '../utils/api.js';

export function TemplatesPage() {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dbTemplates, setDbTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const {
    openTemplateEditor,
    createDefaultTemplate,
  } = useApp();

  const loadTemplates = async () => {
    setLoading(true);
    setError('');
    const res = await getTemplates();
    console.log('getTemplates response:', res);
    
    if (res.ok) {
      let templatesArray = [];
      if (Array.isArray(res.data)) templatesArray = res.data;
      else if (res.data && Array.isArray(res.data.data)) templatesArray = res.data.data;
      else if (res.data && Array.isArray(res.data.templates)) templatesArray = res.data.templates;
      
      // Map the backend's templateId to the frontend's id property
      setDbTemplates(templatesArray.map(t => ({ ...t, id: t.templateId || t.id })));
    } else {
      setError(res.error || `Failed to load templates. Raw response: ${JSON.stringify(res)}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await apiDeleteTemplate(deleteTarget.id);
    if (res.ok) {
      setDbTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    } else {
      alert(`Failed to delete: ${res.error}`);
    }
    setDeleteTarget(null);
  };

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
        onConfirm={handleDelete}
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
            // Let the editor know this is a new template, so it doesn't try to fetch by ID
            openTemplateEditor(t.id, true);
          }}
        >
          + Create template
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '20px', color: '#dc2626', background: 'rgba(220,38,38,0.1)', padding: '10px', borderRadius: '8px' }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <p>Loading templates...</p>
      ) : (
        <div className="card-grid card-grid--templates">
          {dbTemplates.map((t) => (
            <article key={t.id} className="card">
              <div className="card-preview">
                {/* Fallback to tpl-preview--thrones if previewClass is missing */}
                <TemplateThemePreview template={{...t, previewClass: t.previewClass || 'tpl-preview--thrones'}} variant="admin" />
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
      )}
    </>
  );
}
