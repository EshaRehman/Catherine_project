import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { EmailJobModal } from '../components/EmailJobModal.jsx';
import { getEvents, getTemplates, deleteEventApi } from '../utils/api.js';



export function EventsDashboard() {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [emailTarget, setEmailTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [statusToast, setStatusToast] = useState(null);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [gmailBusy, setGmailBusy] = useState(false);
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
      setDbTemplates(templatesArray.map(t => ({ ...t, id: t.templateId || t.id })));
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

  const refreshGmailStatus = () => {
    if (!window.catherine?.gmail?.getStatus) return;
    window.catherine.gmail.getStatus().then(setGmailStatus);
  };

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

  const handleDownload = async (ev) => {
    if (!jobsSupported) {
      showToast('Job export needs the desktop app.', 'error');
      return;
    }
    const count = photoCounts[ev.id] || 0;
    if (count === 0) {
      showToast(`No photos saved for "${ev.name}" yet.`, 'error');
      return;
    }
    setBusyId(ev.id);
    try {
      const res = await downloadEventJob({ eventId: ev.id, eventName: ev.name });
      if (res?.ok) {
        showToast(`Saved ${res.count} photo${res.count === 1 ? '' : 's'} to ${res.path}`);
      } else if (res?.reason === 'cancelled') {
        /* no-op */
      } else if (res?.reason === 'no-photos') {
        showToast('No photos saved for this event yet.', 'error');
      } else {
        showToast('Could not save the zip.', 'error');
      }
    } catch {
      showToast('Could not save the zip.', 'error');
    } finally {
      setBusyId(null);
    }
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
            ? `“${deleteTarget.name}” will be removed. Saved photos for this event will also be deleted. This can’t be undone.`
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
        photoCount={emailTarget ? photoCounts[emailTarget.id] || 0 : 0}
        sendViaGmail={sendViaGmail}
        onCancel={() => setEmailTarget(null)}
        onSubmit={handleEmailSubmit}
      />
      <div className="admin-page-head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">Events</h1>
          <p className="admin-page-sub">Manage experiences and assigned looks.</p>
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

      {jobsSupported && gmailStatus ? (
        <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
          <h2 className="card-title" style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>
            Gmail delivery
          </h2>
          {gmailStatus.linked && gmailStatus.email ? (
            <p className="admin-page-sub" style={{ margin: 0 }}>
              Connected as <strong>{gmailStatus.email}</strong>. “Email to client” sends from this account.
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: '0.5rem' }}
                disabled={gmailBusy}
                onClick={async () => {
                  setGmailBusy(true);
                  try {
                    await window.catherine.gmail.disconnect();
                    refreshGmailStatus();
                    showToast('Gmail disconnected.');
                  } finally {
                    setGmailBusy(false);
                  }
                }}
              >
                Disconnect
              </button>
            </p>
          ) : (
            <>
              <p className="admin-page-sub" style={{ margin: '0 0 0.75rem' }}>
                {gmailStatus.clientSecretFound
                  ? 'Connect once so “Email to client” can send zips from your dedicated Gmail (no mail app).'
                  : 'Add the OAuth client JSON file (client_secret_….json) next to the app, or set GMAIL_CLIENT_SECRET_PATH, then connect.'}
              </p>
              <p
                className="admin-page-sub"
                style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', wordBreak: 'break-all' }}
              >
                Redirect URI to register in Google Cloud:{' '}
                <code>{gmailStatus.redirectUri || ''}</code>
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={gmailBusy || !gmailStatus.clientSecretFound}
                onClick={async () => {
                  setGmailBusy(true);
                  try {
                    const r = await window.catherine.gmail.connect();
                    if (r?.ok) {
                      showToast(r.email ? `Connected: ${r.email}` : 'Gmail connected.');
                      refreshGmailStatus();
                    } else {
                      const msg =
                        r?.reason === 'port_in_use'
                          ? 'Port 54321 is in use. Close the other program or restart and try again.'
                          : r?.reason === 'no_refresh_token'
                            ? 'No refresh token — revoke app access in Google Account security, then try Connect again.'
                            : r?.reason === 'token_exchange_failed'
                              ? `Token exchange failed: ${r.detail || ''}`
                              : r?.reason === 'access_denied'
                                ? 'Sign-in was cancelled.'
                                : `Could not connect (${r?.reason || 'unknown'}).`;
                      showToast(msg.trim(), 'error');
                    }
                  } catch {
                    showToast('Could not connect Gmail.', 'error');
                  } finally {
                    setGmailBusy(false);
                  }
                }}
              >
                {gmailBusy ? 'Waiting for browser…' : 'Connect Gmail'}
              </button>
            </>
          )}
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
            const photoCount = photoCounts[ev.id] || 0;
            const isBusy = busyId === ev.id;
            const noPhotos = photoCount === 0;
            return (
              <article key={ev.id} className="card">
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

                  <div className="event-job-row">
                    <span className="event-job-count" title="Photos saved for this event">
                      <span className="event-job-count__dot" aria-hidden />
                      {photoCount} {photoCount === 1 ? 'photo' : 'photos'} saved
                    </span>
                    <div className="event-job-row__actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDownload(ev)}
                        disabled={isBusy || !jobsSupported || noPhotos}
                        title={
                          !jobsSupported
                            ? 'Available in the desktop app only'
                            : noPhotos
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
