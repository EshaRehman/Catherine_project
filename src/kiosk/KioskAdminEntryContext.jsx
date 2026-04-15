import React, { createContext, useContext } from 'react';

const KioskAdminEntryContext = createContext(() => {});

export function KioskAdminEntryProvider({ children, onOpenAdmin }) {
  return (
    <KioskAdminEntryContext.Provider value={onOpenAdmin}>{children}</KioskAdminEntryContext.Provider>
  );
}

export function useKioskAdminEntry() {
  return useContext(KioskAdminEntryContext);
}
