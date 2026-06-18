import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { AdminUnlockModal } from './AdminUnlockModal.jsx';
import { CornerLongPress } from './CornerLongPress.jsx';
import { IdleScreen } from './IdleScreen.jsx';
import { TemplateSelectScreen } from './TemplateSelectScreen.jsx';
import { CameraScreen } from './CameraScreen.jsx';
import { CapturePreviewScreen } from './CapturePreviewScreen.jsx';
import { ProcessingScreen } from './ProcessingScreen.jsx';
import { ResultScreen } from './ResultScreen.jsx';
import { QRScreen } from './QRScreen.jsx';
import { getEvents, getTemplates } from '../utils/api.js';

const CAPTURE_PREVIEW_MS = 900;

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

  useEffect(() => {
    const fetchData = async () => {
      const [resTemplates, resEvents] = await Promise.all([
        getTemplates(),
        getEvents()
      ]);
      
      if (resTemplates.ok) {
        let templatesArray = [];
        if (Array.isArray(resTemplates.data)) templatesArray = resTemplates.data;
        else if (resTemplates.data && Array.isArray(resTemplates.data.data)) templatesArray = resTemplates.data.data;
        else if (resTemplates.data && Array.isArray(resTemplates.data.templates)) templatesArray = resTemplates.data.templates;
        setDbTemplates(templatesArray.map(t => {
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
        }));
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
    };
    fetchData();
  }, []);

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

  return (
    <div className="shell-kiosk">
      <AdminUnlockModal open={adminModal} onClose={() => setAdminModal(false)} />

      {phase === 'idle' && (
        <IdleScreen onStart={goStart} disabled={kioskTemplates.length === 0} />
      )}

      {phase === 'templates' && (
        <TemplateSelectScreen
          templates={kioskTemplates}
          onPick={(id) => {
            setSelectedTemplateId(id);
            setPhase('camera');
          }}
          onBack={resetFlow}
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
        />
      )}

      {phase === 'result' && resultDataUrl && selectedTemplate && (
        <ResultScreen
          imageDataUrl={resultDataUrl}
          template={selectedTemplate}
          onQR={() => setPhase('qr')}
          onRegenerate={() => {
            setResultDataUrl(null);
            setSubjectDataUrl(null);
            setPhase('camera');
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
