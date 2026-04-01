import React from 'react';
import { useApp } from './state/AppContext.jsx';
import { KioskApp } from './kiosk/KioskApp.jsx';
import { AdminApp } from './admin/AdminApp.jsx';

export default function App() {
  const { hydrated, mode } = useApp();

  if (!hydrated) {
    return (
      <div className="splash" aria-busy="true">
        Loading…
      </div>
    );
  }

  return mode === 'admin' ? <AdminApp /> : <KioskApp />;
}
