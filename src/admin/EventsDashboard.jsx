import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { EmailZipModal } from '../components/EmailZipModal.jsx';
import {
  cleanupJobExportsNow,
  downloadJobZipForEvent,
  emailJobZipExport,
  listJobExports,
} from '../services/jobExports.js';

function PreviewThumb({ template }) {
  const fallback = { backgroundUrl: null, previewClass: 'tpl-preview--thrones' };
  return <TemplateThemePreview template={template || fallback} variant="admin" />;
}

export function EventsDashboard() {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exportCounts, setExportCounts] = useState({});
  const [zipBusyId, setZipBusyId] = useState(null);
  const [emailModal, setEmailModal] = useState(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const {
    events,
    getTemplate,
    openEventForm,
    deleteEvent,
    settings,
    setSettings,
    setMode,
  } = useApp();

  const refreshExportCounts = useCallback(async () => {
    const r = await listJobExports();
    const jobs = Array.isArray(r?.jobs) ? r.jobs : [];
    const counts = {};
    for (const j of jobs) {
      const id = j.eventId || '__general__';
      counts[id] = (counts[id] || 0) + 1;
    }
    setExportCounts(counts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await cleanupJobExportsNow().catch(() => {});
      if (!cancelled) await refreshExportCounts();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshExportCounts, events.length]);

  const goLiveAndOpenKiosk = (eventId) => {
    setSettings((s) => ({ ...s, activeEventId: eventId }));
    setMode('kiosk');
  };

  const liveEvent = settings.activeEventId
    ? events.find((e) => e.id === settings.activeEventId)
    : null;

  const onDownloadZip = async (ev) => {
    setZipBusyId(ev.id);
    try {
      const r = await downloadJobZipForEvent(ev.id, ev.name || 'event');
      if (!r?.ok && r?.error) {
        window.alert(r.error);
      }
    } finally {
      setZipBusyId(null);
      await refreshExportCounts();
    }
  };

  const handleEmailSend = async (to) => {
    if (!emailModal) return { ok: false, error: 'Nothing to send.' };
    setEmailBusy(true);
    try {
      return await emailJobZipExport({
        eventId: emailModal.id,
        defaultBaseName: emailModal.name,
        to,
      });
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <>
      <EmailZipModal
        open={emailModal !== null}
        title="Email exports"
        eventLabel={emailModal?.name || ''}
        onClose={() => setEmailModal(null)}
        onSend={handleEmailSend}
        busy={emailBusy}
      />
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
          <p className="admin-page-sub">Live event: kiosk + ZIP / email exports.</p>
          {settings.activeEventId && !liveEvent ? (
            <p className="admin-page-sub field-error" role="alert">
              That live event was deleted. Clear or pick another.
            </p>
          ) : liveEvent ? (
            <p className="admin-page-sub admin-page-sub--live">
              Live: <strong>{liveEvent.name}</strong>
            </p>
          ) : null}
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
        {events.length > 0
          ? events.map((ev) => {
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
              <article key={ev.id} className="card admin-card">
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
                    {exportCounts[ev.id] ? ` · ${exportCounts[ev.id]} saved export(s)` : ''}
                  </p>
                  <div className="card-actions card-actions--events">
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
                    {isLive ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={zipBusyId === ev.id}
                          onClick={() => onDownloadZip(ev)}
                          title="Save every portrait captured while this event is live into one ZIP"
                        >
                          {zipBusyId === ev.id ? 'Preparing…' : 'Download all (ZIP)'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEmailModal({ id: ev.id, name: ev.name || 'event' })}
                          title="Send the ZIP to an email address"
                        >
                          Email ZIP…
                        </button>
                      </>
                    ) : null}
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
          : null}
      </div>
    </>
  );
}
