import React from 'react';
import { useApp } from '../state/AppContext.jsx';

function PreviewThumb({ template }) {
  if (!template) {
    return <div className="card-preview tpl-preview--luxury" />;
  }
  if (template.backgroundUrl) {
    return <img className="card-preview-img" src={template.backgroundUrl} alt="" />;
  }
  return (
    <div className={`card-preview ${template.previewClass || 'tpl-preview--luxury'}`} />
  );
}

export function EventsDashboard() {
  const {
    events,
    getTemplate,
    openEventForm,
    deleteEvent,
    duplicateEvent,
  } = useApp();

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Events</h1>
          <p className="admin-page-sub">Manage experiences and assigned looks.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openEventForm(null)}>
          + Create event
        </button>
      </div>

      <div className="card-grid">
        {events.length === 0 ? (
          <p className="admin-page-sub" style={{ gridColumn: '1 / -1' }}>
            No events yet. Create one to connect templates to the live flow.
          </p>
        ) : (
          events.map((ev) => {
            const firstId = ev.templateIds?.[0];
            const tpl = firstId ? getTemplate(firstId) : null;
            const dateStr = ev.createdAt
              ? new Date(ev.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '';
            return (
              <article key={ev.id} className="card">
                <div className="card-preview">
                  <PreviewThumb template={tpl} />
                </div>
                <div className="card-body">
                  <h2 className="card-title">{ev.name}</h2>
                  <p className="card-meta">
                    {dateStr}
                    {ev.status ? ` · ${ev.status}` : ''}
                  </p>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEventForm(ev.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => duplicateEvent(ev.id)}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (window.confirm(`Delete “${ev.name}”?`)) deleteEvent(ev.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </>
  );
}
