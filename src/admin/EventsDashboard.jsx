import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { EmailJobModal } from '../components/EmailJobModal.jsx';
import { getEvents, getTemplates, deleteEventApi, downloadZipApi } from '../utils/api.js';



export function EventsDashboard() {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [emailTarget, setEmailTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [statusToast, setStatusToast] = useState(null);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [dbEvents, setDbEvents] = useState([]);
  const [dbTemplates, setDbTemplates] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  
  const {
    openEventForm,
    deleteEvent,
    settings,
    setSettings,
    setMode,
    photoCounts,
    jobsSupported,
    downloadEventJob,
    emailEventJob,
  } = useApp();

  const loadEventsAndTemplates = async () => {
    setLoadingEvents(true);
    const [resEvents, resTemplates] = await Promise.all([
      getEvents(),
      getTemplates()
    ]);

    if (resTemplates.ok) {
      let templatesArray = [];
      if (Array.isArray(resTemplates.data)) templatesArray = resTemplates.data;
      else if (resTemplates.data && Array.isArray(resTemplates.data.data)) templatesArray = resTemplates.data.data;
      else if (resTemplates.data && Array.isArray(resTemplates.data.templates)) templatesArray = resTemplates.data.templates;
      setDbTemplates(templatesArray.map(t => ({ ...t, id: t.templateId || t.id, backgroundUrl: t.backgroundUrl || t.templateImageUrl || null })));
    }

    if (resEvents.ok) {
      let eventsArray = [];
      if (Array.isArray(resEvents.data)) eventsArray = resEvents.data;
      else if (resEvents.data && Array.isArray(resEvents.data.events)) eventsArray = resEvents.data.events;
      else if (resEvents.data && Array.isArray(resEvents.data.data)) eventsArray = resEvents.data.data;
      
      setDbEvents(eventsArray.map(e => ({ 
        ...e, 
        id: e.eventId || e.id,
        templateIds: e.templates ? e.templates.map(t => t.templateId || t.id) : (e.templateIds || [])
      })));
    }
    setLoadingEvents(false);
  };

  useEffect(() => {
    loadEventsAndTemplates();
  }, []);

  useEffect(() => {
    if (!jobsSupported || typeof window === 'undefined' || !window.catherine?.gmail?.getStatus) {
      setGmailStatus(null);
      return;
    }
    let cancelled = false;
    window.catherine.gmail.getStatus().then((s) => {
      if (!cancelled) setGmailStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [jobsSupported]);

  const sendViaGmail = !!(gmailStatus?.linked && jobsSupported);

  const goLiveAndOpenKiosk = (eventId) => {
    setSettings((s) => ({ ...s, activeEventId: eventId }));
    setMode('kiosk');
  };

  const liveEvent = settings.activeEventId
    ? dbEvents.find((e) => e.id === settings.activeEventId)
    : null;

  const showToast = (msg, kind = 'info') => {
    setStatusToast({ msg, kind, key: Date.now() });
    window.setTimeout(() => {
      setStatusToast((curr) => (curr && curr.msg === msg ? null : curr));
    }, 4500);
  };

  const handleDownload = (ev) => {
    downloadZipApi(ev.id);
  };

  const handleEmailSubmit = async ({ recipient, message }) => {
    if (!emailTarget) return { ok: false };
    setBusyId(emailTarget.id);
    try {
      const res = await emailEventJob({
        eventId: emailTarget.id,
        eventName: emailTarget.name,
        recipient,
        message,
      });
      if (res?.ok) {
        if (res.via === 'gmail') {
          showToast(`Sent ${res.count} photo${res.count === 1 ? '' : 's'} to ${recipient} from Gmail.`);
        } else {
          const note = res.mailtoOpened
            ? `Zip saved (${res.count}). Your mail app should now be open.`
            : `Zip saved (${res.count}) at ${res.path}.`;
          showToast(note);
        }
        setEmailTarget(null);
      } else if (res?.reason === 'attachment-too-large') {
        showToast(
          `Zip is too large for Gmail (over ~${res.maxMb || 24} MB). Save a smaller export or use a file link.`,
          'error',
        );
      } else if (res?.reason === 'gmail-send-failed') {
        showToast(res.detail ? `Gmail send failed: ${res.detail}` : 'Gmail send failed.', 'error');
      }
      return res;
    } catch {
      return { ok: false };
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteEvent = async () => {
    if (deleteTarget) {
      setBusyId(deleteTarget.id);
      try {
        const res = await deleteEventApi(deleteTarget.id);
        if (res.ok) {
          setDbEvents(prev => prev.filter(e => e.id !== deleteTarget.id));
          showToast(`Event deleted successfully.`);
        } else {
          showToast(res.error || 'Failed to delete event from database.', 'error');
        }
      } catch (err) {
        showToast('Error connecting to the database.', 'error');
      } finally {
        setBusyId(null);
      }
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete event"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed. Saved photos for this event will also be deleted. This can’t be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteEvent}
        onClose={() => setDeleteTarget(null)}
      />
      <EmailJobModal
        open={emailTarget !== null}
        eventName={emailTarget?.name || ''}
        eventId={emailTarget?.id || ''}
        photoCount={emailTarget ? photoCounts[emailTarget.id] || 0 : 0}
        sendViaGmail={sendViaGmail}
        onCancel={() => setEmailTarget(null)}
        onSubmit={handleEmailSubmit}
      />
      <div className="admin-page-head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">Events</h1>
        </div>
        <div className="admin-page-head__actions">
          <button type="button" className="btn btn-primary" onClick={() => openEventForm(null)}>
            + Create event
          </button>
        </div>
      </div>

      {statusToast ? (
        <div
          key={statusToast.key}
          className={`admin-toast admin-toast--${statusToast.kind === 'error' ? 'error' : 'info'}`}
          role="status"
        >
          {statusToast.msg}
        </div>
      ) : null}

      <div className="card-grid card-grid--events">
        {loadingEvents ? (
          <p className="admin-page-sub" style={{ gridColumn: '1 / -1' }}>Loading events...</p>
        ) : dbEvents.length === 0 ? (
          <p className="admin-page-sub" style={{ gridColumn: '1 / -1' }}>
            No events yet. Create one to connect templates to the live flow.
          </p>
        ) : (
          dbEvents.map((ev) => {
            const firstId = ev.templateIds?.[0];
            const tpl = firstId ? dbTemplates.find((t) => t.id === firstId) : null;
            const dateStr = ev.createdAt
              ? new Date(ev.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '';
            const isLive = settings.activeEventId === ev.id;
            const photoCount = ev.count ?? 0;
            const isBusy = busyId === ev.id;
            const noPhotos = photoCount === 0;
            return (
              <article key={ev.id} className="card event-card">
                <div className="card-body">
                  <div className="card-title-row">
                    <h2 className="card-title">{ev.name}</h2>
                    </div>
                  <p className="card-meta">
                    {dateStr}{ev.status ? ` · ${ev.status}` : ''}
                  </p>
                  {ev.path ? (
                    <p className="event-card__path" title={ev.path}>{ev.path}</p>
                  ) : null}

                  <div className="event-card__divider" aria-hidden />

                  <div className="event-job-row">
                    <span className="event-job-count" title="Photos saved for this event">
                      <span className="event-job-count__dot" aria-hidden />
                      {photoCount} {photoCount === 1 ? 'photo' : 'photos'} saved
                    </span>
                    <div className="event-job-row__actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => window.catherine?.openGallery({ eventId: ev.id, eventName: ev.name })}
                        disabled={noPhotos}
                        title={noPhotos ? 'No photos saved for this event yet' : 'Browse photos in gallery'}
                      >
                        View Gallery
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDownload(ev)}
                        disabled={isBusy || noPhotos}
                        title={
                          noPhotos
                            ? 'No photos saved for this event yet'
                            : 'Download all photos as a zip'
                        }
                      >
                        {isBusy ? 'Working…' : 'Download .zip'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEmailTarget({ id: ev.id, name: ev.name })}
                        disabled={isBusy || !jobsSupported || noPhotos}
                        title={
                          !jobsSupported
                            ? 'Available in the desktop app only'
                            : noPhotos
                              ? 'No photos saved for this event yet'
                              : 'Email all photos as a zip'
                        }
                      >
                        Email to client…
                      </button>
                    </div>
                  </div>

                  <div className="card-actions event-card__actions">
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
