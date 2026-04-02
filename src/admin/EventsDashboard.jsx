import React, { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';

function PreviewThumb({ template }) {
  const fallback = { backgroundUrl: null, previewClass: 'tpl-preview--thrones' };
  return <TemplateThemePreview template={template || fallback} variant="admin" />;
}

export function EventsDashboard() {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const {
    events,
    getTemplate,
    openEventForm,
    deleteEvent,
    settings,
    setSettings,
    setMode,
  } = useApp();

  const goLiveAndOpenKiosk = (eventId) => {
    setSettings((s) => ({ ...s, activeEventId: eventId }));
    setMode('kiosk');
  };

  const liveEvent = settings.activeEventId
    ? events.find((e) => e.id === settings.activeEventId)
    : null;

  return (
    <>
      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete event"
        message={
          deleteTarget
            ? `“${deleteTarget.name}” will be removed. This can’t be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deleteTarget) deleteEvent(deleteTarget.id);
        }}
        onClose={() => setDeleteTarget(null)}
      />
      <div className="admin-page-head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">Events</h1>
          <p className="admin-page-sub">Manage experiences and assigned looks.</p>
          {settings.activeEventId && !liveEvent ? (
            <p className="admin-page-sub field-error" role="alert">
              Kiosk was set to an event that no longer exists. Clear it or pick an event below.
            </p>
          ) : liveEvent ? (
            <p className="admin-page-sub admin-page-sub--live">
              Kiosk is live on <strong>{liveEvent.name}</strong> (only its templates).
            </p>
          ) : (
            <p className="admin-page-sub admin-page-sub--live-muted">
              No event is live — the kiosk shows every template until you choose one below.
            </p>
          )}
        </div>
        <div className="admin-page-head__actions">
          {settings.activeEventId ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSettings((s) => ({ ...s, activeEventId: null }))}
            >
              Clear live kiosk
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => openEventForm(null)}>
            + Create event
          </button>
        </div>
      </div>

      <div className="card-grid card-grid--events">
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
            const isLive = settings.activeEventId === ev.id;
            return (
              <article key={ev.id} className="card">
                <div className="card-preview">
                  <PreviewThumb template={tpl} />
                </div>
                <div className="card-body">
                  <div className="card-title-row">
                    <h2 className="card-title">{ev.name}</h2>
                    {isLive ? (
                      <span className="event-live-badge" title="This event drives the kiosk">
                        Live
                      </span>
                    ) : null}
                  </div>
                  <p className="card-meta">
                    {dateStr}
                    {ev.status ? ` · ${ev.status}` : ''}
                  </p>
                  <div className="card-actions">
                    {isLive ? (
                      <button
                        type="button"
                        className="event-on-kiosk-chip"
                        onClick={() => setMode('kiosk')}
                        title="Switch to guest kiosk"
                      >
                        On kiosk
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => goLiveAndOpenKiosk(ev.id)}
                      >
                        Go live
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEventForm(ev.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteTarget({ id: ev.id, name: ev.name })}
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
