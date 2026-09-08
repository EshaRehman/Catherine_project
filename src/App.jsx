import React from 'react';
import { useApp } from './state/AppContext.jsx';
import { KioskApp } from './kiosk/KioskApp.jsx';
import { AdminApp } from './admin/AdminApp.jsx';
import { ExitConfirmModal } from './components/ExitConfirmModal.jsx';

export default function App() {
  const { hydrated, mode } = useApp();

  /* Rendered outside the hydration gate: Escape has to be answerable even while
     settings are still loading, or a booth that stalls on hydrate has no way
     out but the power button. */
  const exitPrompt = <ExitConfirmModal />;

  if (!hydrated) {
    return (
      <>
        <div className="splash" aria-busy="true">
          Loading…
        </div>
        {exitPrompt}
      </>
    );
  }

  return (
    <>
      {mode === 'admin' ? <AdminApp /> : <KioskApp />}
      {exitPrompt}
    </>
  );
}
