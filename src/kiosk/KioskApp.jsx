import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { AdminUnlockModal } from './AdminUnlockModal.jsx';
import { CornerLongPress } from './CornerLongPress.jsx';
import { IdleScreen } from './IdleScreen.jsx';
import { TemplateSelectScreen } from './TemplateSelectScreen.jsx';
import { CameraReadyScreen } from './CameraReadyScreen.jsx';
import { CameraScreen } from './CameraScreen.jsx';
import { CapturePreviewScreen } from './CapturePreviewScreen.jsx';
import { ProcessingScreen } from './ProcessingScreen.jsx';
import { RetryTransitionScreen } from './RetryTransitionScreen.jsx';
import { ResultScreen } from './ResultScreen.jsx';
import { QRScreen } from './QRScreen.jsx';
import { getEvents, getTemplates } from '../utils/api.js';

const CAPTURE_PREVIEW_MS = 900;

/* ---- Inactivity reset ----
   A guest who wanders off mid-flow leaves the booth parked on a template
   picker or a QR code, so the next person walks up to someone else's session
   instead of the welcome screen. Each guest-driven phase gets a deadline;
   touching the screen resets it.

   Phases that are waiting on the machine rather than the guest are not in this
   map — timing those out would cancel a generation that is progressing
   normally. `processing` is the exception: it has its own, much longer cap
   below, because a wedged ComfyUI otherwise leaves the loading video playing
   until an operator notices. */
const IDLE_TIMEOUT_MS = {
  templates: 90_000,
  'camera-ready': 90_000,
  camera: 90_000,
  result: 90_000,
  // Long enough to unlock a phone, open the camera and frame the code.
  qr: 120_000,
};

/* Backstop only. A normal local generation is well under a minute; this exists
   so a hung backend returns the booth to the welcome screen rather than
   stranding it on the loading animation for the rest of the event. */
const PROCESSING_TIMEOUT_MS = 240_000;

/* The API has been returned as a bare array, as {data: []} and as
   {templates: []} / {events: []} at different times; accept all three rather
   than silently loading nothing when the envelope changes. */
const unwrapList = (payload, ...keys) => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (payload && Array.isArray(payload[key])) return payload[key];
  }
  return [];
};

const mapTemplates = (payload) =>
  unwrapList(payload, 'data', 'templates').map((t) => {
    const mapped = {
      ...t,
      id: t.templateId || t.id,
      backgroundUrl: t.backgroundUrl || t.templateImageUrl || null,
    };
    if (t.textPosition) {
      mapped.textX = Number(t.textPosition.x ?? 50);
      mapped.textY = Number(t.textPosition.y ?? 78);
    }
    if (t.logoPosition) {
      mapped.logoX = Number(t.logoPosition.x ?? 88);
      mapped.logoY = Number(t.logoPosition.y ?? 10);
    }
    return mapped;
  });

const mapEvents = (payload) =>
  unwrapList(payload, 'events', 'data').map((e) => ({
    ...e,
    id: e.eventId || e.id,
    templateIds: e.templates
      ? e.templates.map((t) => t.templateId || t.id)
      : e.templateIds || [],
  }));

export function KioskApp() {
  const { settings, recordEventPhoto } = useApp();
  const [phase, setPhase] = useState('idle');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [subjectDataUrl, setSubjectDataUrl] = useState(null);
  const [resultDataUrl, setResultDataUrl] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [adminModal, setAdminModal] = useState(false);
  const [dbEvents, setDbEvents] = useState([]);
  const [dbTemplates, setDbTemplates] = useState([]);
  const savedKeyRef = useRef('');

  /* ---- Restoring the live event on launch ----
     The event is not lost when the app closes: settings.activeEventId lives in
     localStorage and comes back on the next start. What was missing is anything
     to match it against.

     The app spawns FastAPI itself and opens this window straight away, so on a
     cold start — every logon launch, and every watchdog relaunch after a crash
     — this ran seconds before uvicorn was listening. One attempt, no retry: the
     calls failed, dbEvents stayed empty, no event matched the saved id, and the
     welcome screen came up disabled telling the operator to go and set an
     active event in admin. Opening admin and returning remounts this component
     and refetches against a backend that is up by then, which is exactly why it
     appeared to need a trip through admin every time.

     So keep asking until the backend answers. */
  const [backendStatus, setBackendStatus] = useState('connecting');

  useEffect(() => {
    let alive = true;
    let timer = null;
    let attempt = 0;
    const startedAt = Date.now();

    const load = async () => {
      timer = null;
      const [resTemplates, resEvents] = await Promise.all([
        getTemplates(settings.aiMode),
        getEvents(settings.aiMode),
      ]);
      if (!alive) return;

      const ok = resTemplates.ok && resEvents.ok;
      let mappedEvents = [];

      if (ok) {
        setDbTemplates(mapTemplates(resTemplates.data));
        mappedEvents = mapEvents(resEvents.data);
        setDbEvents(mappedEvents);
      }

      /* The API can be up a moment before Mongo has served the events, so a
         successful call that does not yet contain the saved live event is worth
         another look — but only briefly, or an event the operator genuinely
         deleted would retry for the rest of the day. */
      const stillMissingActiveEvent =
        ok &&
        Boolean(settings.activeEventId) &&
        !mappedEvents.some((e) => e.id === settings.activeEventId) &&
        Date.now() - startedAt < 20_000;

      if (ok && !stillMissingActiveEvent) {
        setBackendStatus('ready');
        return;
      }

      attempt += 1;
      const delay = Math.min(4000, 500 * 2 ** Math.min(attempt - 1, 3));
      timer = setTimeout(load, delay);
    };

    setBackendStatus('connecting');
    load();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [settings.aiMode, settings.activeEventId]);

  const activeEvent = useMemo(
    () => dbEvents.find((e) => e.id === settings.activeEventId) || null,
    [dbEvents, settings.activeEventId],
  );

  /* Persist each finished result to the active event's job folder exactly once. */
  useEffect(() => {
    if (phase !== 'result' || !resultDataUrl || !activeEvent) return;
    const key = `${activeEvent.id}::${resultDataUrl.length}::${resultDataUrl.slice(-32)}`;
    if (savedKeyRef.current === key) return;
    savedKeyRef.current = key;
    recordEventPhoto({
      eventId: activeEvent.id,
      dataUrl: resultDataUrl,
      capturedAt: Date.now(),
    });
  }, [phase, resultDataUrl, activeEvent, recordEventPhoto]);

  const kioskTemplates = useMemo(() => {
    const ids = activeEvent?.templateIds;
    if (ids && ids.length) return dbTemplates.filter((t) => ids.includes(t.id));
    // If no active event or active event has no templates, return empty to prevent using all templates
    return [];
  }, [dbTemplates, activeEvent]);

  const selectedTemplate = useMemo(
    () => kioskTemplates.find((t) => t.id === selectedTemplateId) || null,
    [kioskTemplates, selectedTemplateId],
  );

  useEffect(() => {
    if (phase !== 'captured' || !subjectDataUrl) return undefined;
    const id = setTimeout(() => setPhase('processing'), CAPTURE_PREVIEW_MS);
    return () => clearTimeout(id);
  }, [phase, subjectDataUrl]);

  const goStart = useCallback(() => {
    if (kioskTemplates.length === 0) return;
    setPhase('templates');
  }, [kioskTemplates]);

  const resetFlow = useCallback(() => {
    setPhase('idle');
    setSelectedTemplateId(null);
    setSubjectDataUrl(null);
    setResultDataUrl(null);
    setDownloadUrl(null);
  }, []);

  /* Return to the welcome screen after a spell of no interaction. `activity` is
     a counter rather than a timestamp so that bumping it restarts the effect —
     the timeout is then always measured from the last touch, and there is one
     live timer at a time instead of a polling interval running all event. */
  const [activity, setActivity] = useState(0);

  /* Only the guest-driven phases reset on touch. `processing` deliberately does
     NOT: its timeout is a backstop against a wedged backend, not a measure of
     how interested the guest still is, and restarting it on every tap of the
     loading animation would defeat the point.

     It also must not re-render mid-generation. ProcessingScreen receives
     onDone/onNoPerson as inline arrows, so a re-render hands it new function
     identities — and its effect watches those. A guest idly tapping the
     loading video would have torn down the in-flight request and fired a
     second /generate. (ProcessingScreen now holds those callbacks in refs so a
     re-render cannot do that, but there is still no reason to cause one.) */
  const guestTimeout = IDLE_TIMEOUT_MS[phase];
  const phaseTimeout = phase === 'processing' ? PROCESSING_TIMEOUT_MS : guestTimeout;

  /* On the idle screen there is no deadline to push back, and re-rendering the
     whole kiosk on every tap of the attract loop is work for nothing. */
  const bumpActivity = useCallback(() => {
    if (guestTimeout) setActivity((n) => n + 1);
  }, [guestTimeout]);

  useEffect(() => {
    const timeout = phaseTimeout;
    // No entry means the phase is machine-driven and finishes on its own.
    if (!timeout) return undefined;
    // The operator is standing at the booth with the password prompt open.
    if (adminModal) return undefined;

    const id = setTimeout(resetFlow, timeout);
    return () => clearTimeout(id);
    /* `phase` as well as `phaseTimeout`: several phases share the same 90s
       deadline, so advancing between them would not otherwise restart the
       clock and a guest could arrive at the camera with seconds left. */
  }, [phase, phaseTimeout, activity, adminModal, resetFlow]);

  return (
    <div
      className="shell-kiosk"
      /* Capture phase: the flow's own buttons call stopPropagation in places,
         and a tap that never reaches the shell would look like inactivity. */
      onPointerDownCapture={bumpActivity}
      onKeyDownCapture={bumpActivity}
    >
      <AdminUnlockModal open={adminModal} onClose={() => setAdminModal(false)} />

      {phase === 'idle' && (
        <IdleScreen
          onStart={goStart}
          disabled={kioskTemplates.length === 0}
          /* While this is true the booth has not heard back from the backend
             yet, so "no templates" means "not asked yet", not "none set up".
             Showing the admin instructions here is what made a cold start look
             like the live event had been forgotten. */
          connecting={backendStatus === 'connecting'}
        />
      )}

      {phase === 'templates' && (
        <TemplateSelectScreen
          templates={kioskTemplates}
          onPick={(id) => {
            setSelectedTemplateId(id);
            setPhase('camera-ready');
          }}
          onBack={resetFlow}
        />
      )}

      {phase === 'camera-ready' && selectedTemplate && (
        <CameraReadyScreen
          onReady={() => setPhase('camera')}
          onBack={() => {
            setSelectedTemplateId(null);
            setPhase('templates');
          }}
        />
      )}

      {phase === 'camera' && selectedTemplate && (
        <CameraScreen
          onCapture={(dataUrl) => {
            setSubjectDataUrl(dataUrl);
            setPhase('captured');
          }}
          onBack={() => {
            setSelectedTemplateId(null);
            setPhase('templates');
          }}
        />
      )}

      {phase === 'captured' && subjectDataUrl && (
        <CapturePreviewScreen subjectDataUrl={subjectDataUrl} />
      )}

      {phase === 'processing' && selectedTemplate && subjectDataUrl && (
        <ProcessingScreen
          subjectDataUrl={subjectDataUrl}
          template={selectedTemplate}
          eventId={activeEvent?.id || null}
          onDone={(url, dlUrl) => {
            setResultDataUrl(url);
            setDownloadUrl(dlUrl);
            setPhase('result');
          }}
          /* Nobody was found in the shot, so there is no result to show. This
             used to fall through to onDone(subjectDataUrl), which presented the
             guest's untouched photo as though the AI had produced it. Play the
             retry clip and reopen the camera instead. */
          onNoPerson={() => {
            setResultDataUrl(null);
            setDownloadUrl(null);
            setSubjectDataUrl(null);
            setPhase('retrying');
          }}
        />
      )}

      {phase === 'retrying' && (
        <RetryTransitionScreen onDone={() => setPhase('camera')} />
      )}

      {phase === 'result' && resultDataUrl && selectedTemplate && (
        <ResultScreen
          imageDataUrl={resultDataUrl}
          template={selectedTemplate}
          onQR={() => setPhase('qr')}
          onRegenerate={() => {
            setResultDataUrl(null);
            setSubjectDataUrl(null);
            setDownloadUrl(null);
            // Via the retry clip rather than straight to the camera, so the
            // guest gets a beat of feedback instead of a hard cut.
            setPhase('retrying');
          }}
        />
      )}

      {phase === 'qr' && resultDataUrl && (
        <QRScreen
          payload={downloadUrl || resultDataUrl}
          onDone={resetFlow}
        />
      )}

      {/* Must render last so it sits above fullscreen phases and receives pointer events */}
      <CornerLongPress onActivate={() => setAdminModal(true)} />
    </div>
  );
}
