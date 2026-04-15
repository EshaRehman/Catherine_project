import React from 'react';
import { CornerLongPress } from './CornerLongPress.jsx';
import { KioskThemeToggle } from './KioskThemeToggle.jsx';
import { useKioskAdminEntry } from './KioskAdminEntryContext.jsx';

/** Theme toggle + admin access control, top-right of kiosk headers */
export function KioskHeaderTrailing() {
  const openAdmin = useKioskAdminEntry();

  return (
    <div className="kiosk-header-trailing">
      <KioskThemeToggle />
      <CornerLongPress onActivate={openAdmin} />
    </div>
  );
}
