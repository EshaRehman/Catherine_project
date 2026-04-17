import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const fallbackTpl = { backgroundUrl: null, previewClass: 'tpl-preview--thrones' };

function PreviewThumb({ template }) {
  return <TemplateThemePreview template={template || fallbackTpl} variant="admin" />;
}

/** Human-readable status from stored event (e.g. "active" → "Active"). */
function formatEventStatus(status) {
  if (!status) return '';
  const s = String(status).replace(/_/g, ' ').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

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

function IconTrash({ title = 'Delete event' }) {
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

function IconChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Horizontal strip of all templates for this event (scroll + arrows + dots). */
function EventTemplateCarousel({ templateIds, getTemplate }) {
  const ids = Array.isArray(templateIds) ? templateIds.filter(Boolean) : [];
  const templates = ids.map((id) => getTemplate(id)).filter(Boolean);
  const vpRef = useRef(null);
  const [active, setActive] = useState(0);

  const len = templates.length;
  const onScroll = () => {
    const el = vpRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setActive(Math.max(0, Math.min(len - 1, i)));
  };

  const scrollTo = (i) => {
    const el = vpRef.current;
    if (!el || !el.clientWidth) return;
    const next = Math.max(0, Math.min(len - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setActive(next);
  };

  useEffect(() => {
    const el = vpRef.current;
    if (!el || len < 2) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setActive(Math.max(0, Math.min(len - 1, i)));
  }, [len]);

  if (len === 0) {
    return (
      <div className="event-card-carousel event-card-carousel--empty">
        <PreviewThumb template={null} />
      </div>
    );
  }

  if (len === 1) {
    return (
      <div className="event-card-carousel event-card-carousel--single">
        <PreviewThumb template={templates[0]} />
      </div>
    );
  }

  return (
    <div className="event-card-carousel">
      <button
        type="button"
        className="event-card-carousel__btn event-card-carousel__btn--prev"
        aria-label="Previous template"
        onClick={() => scrollTo(active - 1)}
        disabled={active <= 0}
      >
        <IconChevronLeft />
      </button>
      <button
        type="button"
        className="event-card-carousel__btn event-card-carousel__btn--next"
        aria-label="Next template"
        onClick={() => scrollTo(active + 1)}
        disabled={active >= len - 1}
      >
        <IconChevronRight />
      </button>
      <div ref={vpRef} className="event-card-carousel__viewport" onScroll={onScroll}>
        {templates.map((t) => (
          <div key={t.id} className="event-card-carousel__slide">
            <div className="event-card-carousel__slide-inner">
              <PreviewThumb template={t} />
            </div>
          </div>
        ))}
      </div>
      <div className="event-card-carousel__dots" role="tablist" aria-label="Templates">
        {templates.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`event-card-carousel__dot${i === active ? ' is-active' : ''}`}
            aria-label={`Show template ${i + 1}`}
            onClick={() => scrollTo(i)}
          />
        ))}
      </div>
    </div>
  );
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
          <h1 className="admin-page-title">
            Your <span className="text-brand-gradient">events</span>
          </h1>
          <p className="admin-page-sub">
            Pick the live kiosk event, then download or email a ZIP of every capture.
          </p>
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
        {events.length > 0 ? (
          events.map((ev) => {
            const dateStr = ev.createdAt
              ? new Date(ev.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '';
            const statusLabel = formatEventStatus(ev.status);
            const exportN = exportCounts[ev.id] || 0;
            const isLive = settings.activeEventId === ev.id;
            return (
              <article key={ev.id} className="card admin-card event-card">
                <div className="card-preview card-preview--event">
                  <EventTemplateCarousel templateIds={ev.templateIds} getTemplate={getTemplate} />
                </div>
                <div className="card-body card-body--event">
                  <div className="card-title-row">
                    <h2 className="card-title">{ev.name}</h2>
                    {isLive ? (
                      <span className="event-live-badge" title="This event is driving the guest kiosk">
                        <span className="event-live-badge__text text-brand-gradient">Live</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="event-card-meta">
                    {dateStr ? (
                      <span className="event-card-meta__chip event-card-meta__chip--date">{dateStr}</span>
                    ) : null}
                    {statusLabel ? (
                      <span className="event-card-meta__chip event-card-meta__chip--status">{statusLabel}</span>
                    ) : null}
                    {exportN > 0 ? (
                      <span className="event-card-meta__chip event-card-meta__chip--exports">
                        {exportN} saved export{exportN === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                  <div className="event-card-toolbar" role="group" aria-label="Event actions">
                    <div className="event-card-toolbar__row event-card-toolbar__row--primary">
                      {isLive ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setMode('kiosk')}
                            title="Open guest kiosk — same as “Live experience”; this event is already live."
                          >
                            Kiosk
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={zipBusyId === ev.id}
                            onClick={() => onDownloadZip(ev)}
                            title={
                              zipBusyId === ev.id
                                ? 'Preparing ZIP download…'
                                : 'Download all saved portraits for this event as one ZIP file'
                            }
                          >
                            {zipBusyId === ev.id ? 'Wait…' : 'ZIP'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setEmailModal({ id: ev.id, name: ev.name || 'event' })}
                            title="Email the export ZIP to an address"
                          >
                            Email
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm event-card-toolbar__go-live"
                          onClick={() => goLiveAndOpenKiosk(ev.id)}
                          title="Make this the live event and open the kiosk"
                        >
                          Go live
                        </button>
                      )}
                    </div>
                    <div className="event-card-toolbar__row event-card-toolbar__row--secondary">
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost btn-sm"
                        onClick={() => openEventForm(ev.id)}
                        aria-label={`Edit ${ev.name}`}
                        title="Edit event"
                      >
                        <IconEdit />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost btn-sm btn-icon--danger"
                        onClick={() => setDeleteTarget({ id: ev.id, name: ev.name })}
                        aria-label={`Delete ${ev.name}`}
                        title="Delete event"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="admin-empty-state" role="status">
            <h2 className="admin-empty-state__title">No events yet</h2>
            <p className="admin-empty-state__text">
              Create an event to choose templates and run the kiosk. When an event is live, you can
              export captures as a ZIP or email them.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
