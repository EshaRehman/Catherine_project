import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { createEvent, updateEvent, getTemplates, getEvents } from '../utils/api.js';

function TemplatePickCard({ template, selected, onToggle }) {
  return (
    <button
      type="button"
      className="kiosk-tpl-card"
      onClick={onToggle}
      style={{
        outline: selected ? '3px solid var(--accent)' : 'none',
        outlineOffset: 2,
      }}
    >
      <TemplateThemePreview template={template} variant="kiosk" />
      <div className="kiosk-tpl-footer">
        <div className="kiosk-tpl-title">{template.name}</div>
      </div>
    </button>
  );
}

export function CreateEvent() {
  const {
    setAdminRoute,
    eventFormId,
    settings,
  } = useApp();

  const [name, setName] = useState('');
  const [templateIds, setTemplateIds] = useState([]);
  const [formError, setFormError] = useState('');
  const [dbTemplates, setDbTemplates] = useState([]);
  const [dbEvents, setDbEvents] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);

  const existing = eventFormId ? dbEvents.find((e) => e.id === eventFormId) : null;

  useEffect(() => {
    const fetchData = async () => {
      setLoadingTemplates(true);
      const [resTemplates, resEvents] = await Promise.all([
        getTemplates(settings.aiMode),
        getEvents(settings.aiMode)
      ]);
      
      if (resTemplates.ok) {
        let templatesArray = [];
        if (Array.isArray(resTemplates.data)) templatesArray = resTemplates.data;
        else if (resTemplates.data && Array.isArray(resTemplates.data.data)) templatesArray = resTemplates.data.data;
        else if (resTemplates.data && Array.isArray(resTemplates.data.templates)) templatesArray = resTemplates.data.templates;
        
        setDbTemplates(templatesArray.map(t => ({ ...t, id: t.templateId || t.id, backgroundUrl: t.backgroundUrl || t.templateImageUrl || null })));
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
      setLoadingTemplates(false);
    };
    fetchData();
  }, []);

  /* Reset when switching create ↔ edit only (not when `dbEvents` updates during create) */
  useEffect(() => {
    if (eventFormId) return;
    setName('');
    setTemplateIds([]);
    setFormError('');
  }, [eventFormId]);

  useEffect(() => {
    if (!eventFormId) return;
    const ex = dbEvents.find((e) => e.id === eventFormId);
    if (!ex) return;
    setName(ex.name || '');
    /* Keep only templates that still exist. An event goes on storing a
       reference to a template after that template is deleted, and resending the
       dead id made the backend reject the whole save with
       "Templates not found: <id>" (_validate_templates_exist) — so the event
       became permanently unsavable, with the error printed at the top of the
       form where nobody scrolled back to see it. Dropping unknown ids here also
       means the next save cleans the stale reference out of the event. */
    const live = new Set(dbTemplates.map((t) => t.id));
    const stored = ex.templateIds?.length ? ex.templateIds : [];
    setTemplateIds(stored.filter((id) => live.has(id)));
    setFormError('');
  }, [eventFormId, dbEvents, dbTemplates]);

  const toggleTpl = (id) => {
    setTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Enter an event name.');
      return;
    }
    if (templateIds.length === 0) {
      setFormError('Select at least one template for this event.');
      return;
    }
    setFormError('');
    setSaving(true);

    const payload = {
      name: name.trim(),
      templates: templateIds.map(id => {
        const t = dbTemplates.find(tpl => tpl.id === id);
        return {
          templateId: id,
          name: t ? t.name : 'Unknown Template'
        };
      }),
      mode: settings.aiMode,
    };

    // Editing must PUT to the existing event. This used to call createEvent for
    // both paths, which minted a fresh eventId and left the original behind as a
    // duplicate (or 400'd because the image folder already existed).
    const res = existing
      ? await updateEvent(existing.id, payload)
      : await createEvent(payload);
    
    if (res.ok) {
      setAdminRoute('events');
    } else {
      setFormError(res.error || 'Failed to save event to DB.');
    }
    setSaving(false);
  };

  return (
    <>
      <div className="admin-page-head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">{existing ? 'Edit event' : 'Create event'}</h1>
          <p className="admin-page-sub">Name the experience and choose which looks guests can pick.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setAdminRoute('events')} disabled={saving}>
          Cancel
        </button>
      </div>

      <form className="panel panel--event-form" onSubmit={submit}>

        <div className="field">
          <label htmlFor="ev-name">Event name</label>
          <input
            id="ev-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nike Launch"
            required
            disabled={saving}
          />
        </div>

        <div className="section-title">Select templates</div>
        <p className="admin-page-sub" style={{ marginTop: -6 }}>
          Tap cards to include them in the live gallery. Guests only see names and artwork.
        </p>
        {loadingTemplates ? (
          <p>Loading templates from database...</p>
        ) : (
          <div
            className="kiosk-templates-grid kiosk-templates-grid--themes kiosk-templates-grid--inline"
            style={{ marginBottom: 24, marginTop: 16 }}
          >
            {dbTemplates.map((t) => (
              <TemplatePickCard
                key={t.id}
                template={{...t, previewClass: t.previewClass || 'tpl-preview--thrones'}}
                selected={templateIds.includes(t.id)}
                onToggle={() => toggleTpl(t.id)}
              />
            ))}
            {dbTemplates.length === 0 && (
              <p>No templates found. Please create one first.</p>
            )}
          </div>
        )}

        {/* Beside the button that triggers it. This used to sit above the
            template picker, which on a long list is off-screen when Save is
            pressed — a rejected save looked like a dead button. */}
        {formError ? (
          <p className="field-error" role="alert" style={{ marginTop: 20, marginBottom: 0 }}>
            {formError}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 12, marginTop: formError ? 12 : 28 }}>
          <button type="submit" className="btn btn-primary" disabled={saving || loadingTemplates}>
            {saving ? 'Saving...' : 'Save event'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAdminRoute('events')} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
