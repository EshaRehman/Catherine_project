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

const CAPTURE_PREVIEW_MS = 900;

export function KioskApp() {
  const { templates, events, settings, recordEventPhoto } = useApp();
  const [phase, setPhase] = useState('idle');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [subjectDataUrl, setSubjectDataUrl] = useState(null);
  const [resultDataUrl, setResultDataUrl] = useState(null);
  const [adminModal, setAdminModal] = useState(false);
  const savedKeyRef = useRef('');

  const activeEvent = useMemo(
    () => events.find((e) => e.id === settings.activeEventId) || null,
    [events, settings.activeEventId],
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
    if (ids && ids.length) return templates.filter((t) => ids.includes(t.id));
    return templates;
  }, [templates, activeEvent]);

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
    if (kioskTemplates.length === 1) {
      setSelectedTemplateId(kioskTemplates[0].id);
      setPhase('camera');
    } else {
      setPhase('templates');
    }
  }, [kioskTemplates]);

  const resetFlow = useCallback(() => {
    setPhase('idle');
    setSelectedTemplateId(null);
    setSubjectDataUrl(null);
    setResultDataUrl(null);
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
            if (kioskTemplates.length === 1) resetFlow();
            else {
              setSelectedTemplateId(null);
              setPhase('templates');
            }
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
          onDone={(url) => {
            setResultDataUrl(url);
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
          payload={`catherine://share/${Date.now()}`}
          onDone={resetFlow}
        />
      )}

      {/* Must render last so it sits above fullscreen phases and receives pointer events */}
      <CornerLongPress onActivate={() => setAdminModal(true)} />
    </div>
  );
}
