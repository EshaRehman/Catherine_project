import React from 'react';
import { useApp } from '../state/AppContext.jsx';
import { AdminShell } from './AdminShell.jsx';
import { EventsDashboard } from './EventsDashboard.jsx';
import { TemplatesPage } from './TemplatesPage.jsx';
import { TemplateEditor } from './TemplateEditor.jsx';
import { CreateEvent } from './CreateEvent.jsx';

export function AdminApp() {
  const { adminRoute, adminTheme } = useApp();

  return (
    <div
      className={`shell-admin shell-admin--split${adminTheme === 'dark' ? ' theme-dark' : ''}`}
    >
      <AdminShell>
        {adminRoute === 'events' && <EventsDashboard />}
        {adminRoute === 'templates' && <TemplatesPage />}
        {adminRoute === 'editor' && <TemplateEditor />}
        {adminRoute === 'eventForm' && <CreateEvent />}
      </AdminShell>
    </div>
  );
}
