import React from 'react';
import { useApp } from '../state/AppContext.jsx';
import { AdminShell } from './AdminShell.jsx';
import { EventsDashboard } from './EventsDashboard.jsx';
import { TemplatesPage } from './TemplatesPage.jsx';
import { TemplateEditor } from './TemplateEditor.jsx';
import { CreateEvent } from './CreateEvent.jsx';

export function AdminApp() {
  const { adminRoute } = useApp();

  return (
    <div className="shell-admin shell-admin--split">
      <AdminShell>
        {adminRoute === 'events' && <EventsDashboard />}
        {adminRoute === 'templates' && <TemplatesPage />}
        {adminRoute === 'editor' && <TemplateEditor />}
        {adminRoute === 'eventForm' && <CreateEvent />}
      </AdminShell>
    </div>
  );
}
