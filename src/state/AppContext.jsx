import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  createDefaultTemplate,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_TEMPLATES,
  migrateStoredKioskTemplates,
  PRESET_DEFAULT_BACKGROUND_URLS,
} from './defaults.js';
import { loadState, saveState } from './persist.js';

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState('kiosk'); // kiosk | admin
  const [adminRoute, setAdminRoute] = useState('events'); // events | templates | editor | eventForm
  const [editorTemplateId, setEditorTemplateId] = useState(null);
  const [editorIsNew, setEditorIsNew] = useState(false);
  const [eventFormId, setEventFormId] = useState(null);
  const [adminTheme, setAdminTheme] = useState('light');
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [events, setEvents] = useState([]);
  const [adminPassword, setAdminPassword] = useState(DEFAULT_ADMIN_PASSWORD);
  const [settings, setSettings] = useState({
    globalPromptSuffix: '',
    defaultJobQueue: '',
    brandName: 'Catherine',
    activeEventId: null,
    loraModulePath: '',
    themePackNotes: '',
  });

  useEffect(() => {
    const s = loadState();
    if (s) {
      if (Array.isArray(s.templates) && s.templates.length) {
        setTemplates(
          migrateStoredKioskTemplates(s.templates).map((t) => {
            let nt = { ...t };
            if (!nt.previewClass) {
              const n = (nt.name || '').toLowerCase();
              let previewClass = 'tpl-preview--thrones';
              if (n.includes('f1') || n.includes('racing')) previewClass = 'tpl-preview--f1';
              else if (n.includes('wizard') || n.includes('potter') || n.includes('magic'))
                previewClass = 'tpl-preview--wizard';
              else if (n.includes('viking') || n.includes('nordic'))
                previewClass = 'tpl-preview--viking';
              else if (n.includes('throne') || n.includes('realm') || n.includes('medieval'))
                previewClass = 'tpl-preview--thrones';
              else if (n.includes('cyber')) previewClass = 'tpl-preview--cyber';
              else if (n.includes('luxury') || n.includes('editorial'))
                previewClass = 'tpl-preview--luxury';
              nt = { ...nt, previewClass };
            }
            const presetBg = PRESET_DEFAULT_BACKGROUND_URLS[nt.previewClass];
            if (!nt.backgroundUrl && presetBg) {
              nt = { ...nt, backgroundUrl: presetBg };
            }
            return nt;
          }),
        );
      }
      if (Array.isArray(s.events)) setEvents(s.events);
      if (typeof s.adminPassword === 'string' && s.adminPassword.length)
        setAdminPassword(s.adminPassword);
      if (s.settings && typeof s.settings === 'object')
        setSettings((prev) => ({ ...prev, ...s.settings }));
    }
    if (s?.adminTheme === 'dark' || s?.adminTheme === 'light')
      setAdminTheme(s.adminTheme);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState({
      templates,
      events,
      adminPassword,
      settings,
      adminTheme,
    });
  }, [hydrated, templates, events, adminPassword, settings, adminTheme]);

  const getTemplate = useCallback(
    (id) => templates.find((t) => t.id === id) || null,
    [templates],
  );

  const saveTemplate = useCallback((tpl, { asNew } = {}) => {
    setTemplates((prev) => {
      if (asNew) {
        const copy = { ...tpl, id: uid(), name: `${tpl.name} (copy)` };
        return [...prev, copy];
      }
      const i = prev.findIndex((t) => t.id === tpl.id);
      if (i === -1) return [...prev, tpl];
      const next = [...prev];
      next[i] = tpl;
      return next;
    });
  }, []);

  const deleteTemplate = useCallback((id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setEvents((prev) =>
      prev.map((e) => ({
        ...e,
        templateIds: (e.templateIds || []).filter((tid) => tid !== id),
      })),
    );
  }, []);

  const duplicateTemplate = useCallback((id) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const copy = { ...t, id: uid(), name: `${t.name} (copy)` };
    setTemplates((prev) => [...prev, copy]);
  }, [templates]);

  const saveEvent = useCallback((ev) => {
    setEvents((prev) => {
      const i = prev.findIndex((e) => e.id === ev.id);
      if (i === -1) return [...prev, ev];
      const next = [...prev];
      next[i] = ev;
      return next;
    });
  }, []);

  const deleteEvent = useCallback((id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setSettings((prev) =>
      prev.activeEventId === id ? { ...prev, activeEventId: null } : prev,
    );
  }, []);

  const duplicateEvent = useCallback((id) => {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    const copy = {
      ...e,
      id: uid(),
      name: `${e.name} (copy)`,
      createdAt: new Date().toISOString(),
    };
    setEvents((prev) => [...prev, copy]);
  }, [events]);

  const openTemplateEditor = useCallback((id, isNew) => {
    setEditorTemplateId(id);
    setEditorIsNew(!!isNew);
    setAdminRoute('editor');
  }, []);

  const openEventForm = useCallback((id = null) => {
    setEventFormId(id);
    setAdminRoute('eventForm');
  }, []);

  const value = useMemo(
    () => ({
      hydrated,
      mode,
      setMode,
      adminRoute,
      setAdminRoute,
      editorTemplateId,
      editorIsNew,
      eventFormId,
      setEventFormId,
      openEventForm,
      adminTheme,
      setAdminTheme,
      openTemplateEditor,
      templates,
      setTemplates,
      events,
      setEvents,
      settings,
      setSettings,
      adminPassword,
      setAdminPassword,
      getTemplate,
      saveTemplate,
      deleteTemplate,
      duplicateTemplate,
      saveEvent,
      deleteEvent,
      duplicateEvent,
      createDefaultTemplate,
    }),
    [
      hydrated,
      mode,
      adminRoute,
      editorTemplateId,
      editorIsNew,
      eventFormId,
      openEventForm,
      adminTheme,
      openTemplateEditor,
      templates,
      events,
      settings,
      adminPassword,
      getTemplate,
      saveTemplate,
      deleteTemplate,
      duplicateTemplate,
      saveEvent,
      deleteEvent,
      duplicateEvent,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}
