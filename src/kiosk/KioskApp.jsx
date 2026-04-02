import React, { useCallback, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { AdminUnlockModal } from './AdminUnlockModal.jsx';
import { CornerLongPress } from './CornerLongPress.jsx';
import { IdleScreen } from './IdleScreen.jsx';
import { TemplateSelectScreen } from './TemplateSelectScreen.jsx';
import { CameraScreen } from './CameraScreen.jsx';
import { ProcessingScreen } from './ProcessingScreen.jsx';
import { ResultScreen } from './ResultScreen.jsx';
import { QRScreen } from './QRScreen.jsx';

export function KioskApp() {
  const { templates, events, settings } = useApp();
  const [phase, setPhase] = useState('idle');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [subjectDataUrl, setSubjectDataUrl] = useState(null);
  const [resultDataUrl, setResultDataUrl] = useState(null);
  const [adminModal, setAdminModal] = useState(false);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === settings.activeEventId) || null,
    [events, settings.activeEventId],
  );

  const kioskTemplates = useMemo(() => {
    const ids = activeEvent?.templateIds;
    if (ids && ids.length) return templates.filter((t) => ids.includes(t.id));
    return templates;
  }, [templates, activeEvent]);

  const selectedTemplate = useMemo(
    () => kioskTemplates.find((t) => t.id === selectedTemplateId) || null,
    [kioskTemplates, selectedTemplateId],
  );

  const countdownSec = activeEvent?.countdownSec ?? 3;

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
          countdownSec={countdownSec}
          onCapture={(dataUrl) => {
            setSubjectDataUrl(dataUrl);
            setPhase('processing');
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
