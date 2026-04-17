import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { KioskTemplateStyleCard } from '../components/KioskTemplateStyleCard.jsx';

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const capitalizeFirst = (value) => {
  const v = String(value || '');
  if (!v) return '';
  return v.charAt(0).toUpperCase() + v.slice(1);
};

function TemplatePickCard({ template, selected, onToggle }) {
  return (
    <KioskTemplateStyleCard
      template={template}
      selected={selected}
      onActivate={onToggle}
      title={capitalizeFirst(template.name)}
      role="checkbox"
      ariaChecked={selected}
      buttonClassName={`create-event-tpl-card${selected ? ' create-event-tpl-card--selected' : ''}`}
    />
  );
}

export function CreateEvent() {
  const {
    templates,
    saveEvent,
    setAdminRoute,
    eventFormId,
    events,
  } = useApp();

  const existing = eventFormId ? events.find((e) => e.id === eventFormId) : null;

  const [name, setName] = useState('');
  const [templateIds, setTemplateIds] = useState([]);
  const [formError, setFormError] = useState('');

  /* Reset when switching create ↔ edit only (not when `events` updates during create) */
  useEffect(() => {
    if (eventFormId) return;
    setName('');
    setTemplateIds([]);
    setFormError('');
  }, [eventFormId]);

  useEffect(() => {
    if (!eventFormId) return;
    const ex = events.find((e) => e.id === eventFormId);
    if (!ex) return;
    setName(ex.name || '');
    setTemplateIds(ex.templateIds?.length ? [...ex.templateIds] : []);
    setFormError('');
  }, [eventFormId, events]);

  const toggleTpl = (id) => {
    setTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = (e) => {
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
    const ev = {
      id: existing?.id || uid(),
      name: capitalizeFirst(name.trim()),
      templateIds: [...templateIds],
      countdownSec: Math.max(1, Math.min(10, Number(existing?.countdownSec) || 3)),
      status: existing?.status || 'active',
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    saveEvent(ev);
    setAdminRoute('events');
  };

  return (
    <div className="create-event-page">
      <div className="admin-page-head create-event-page__head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">
            {existing ? (
              <>
                Edit <span className="text-brand-gradient">event</span>
              </>
            ) : (
              <>
                Create <span className="text-brand-gradient">event</span>
              </>
            )}
          </h1>
          <p className="admin-page-sub">Add a name for this event, then choose which templates guests can use.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setAdminRoute('events')}>
          Cancel
        </button>
      </div>

      <form
        className="panel panel--event-form admin-form admin-form--event create-event-form"
        onSubmit={submit}
      >
        <div className="create-event-page__ambient" aria-hidden="true" />
        <div className="create-event-page__stage">
          <div className="create-event-grid">
            <section
              className="create-event-card create-event-card--identity"
              aria-labelledby="create-event-identity-title"
            >
              <h2 id="create-event-identity-title" className="create-event-card__title">
                Event <span className="text-brand-gradient">name</span>
                <span className="create-event-required" aria-label="Required">
                  *
                </span>
              </h2>
              <div className="field create-event-field--name">
                <input
                  id="ev-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(capitalizeFirst(e.target.value))}
                  placeholder="e.g. Company party"
                  autoComplete="off"
                  aria-labelledby="create-event-identity-title"
                  aria-required="true"
                  required
                />
              </div>
            </section>

            <section
              className="create-event-card create-event-card--looks"
              aria-labelledby="create-event-looks-title"
            >
              <h2 id="create-event-looks-title" className="create-event-card__title">
                Select <span className="text-brand-gradient">templates</span>
                <span className="create-event-required" aria-label="Required">
                  *
                </span>
              </h2>
              <p className="create-event-input-hint">Tap a template to add or remove it from this event.</p>
              {formError ? (
                <p className="field-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="create-event-template-well">
                <div className="create-event-tpl-stage kiosk-templates--stage">
                  <div className="create-event-template-grid kiosk-templates-grid kiosk-templates-grid--themes kiosk-templates-grid--themes-row">
                  {templates.map((t) => (
                    <TemplatePickCard
                      key={t.id}
                      template={t}
                      selected={templateIds.includes(t.id)}
                      onToggle={() => toggleTpl(t.id)}
                    />
                  ))}
                  </div>
                </div>
              </div>

              <div className="create-event-actions">
                <button type="submit" className="btn btn-primary">
                  Save event
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setAdminRoute('events')}>
                  Cancel
                </button>
              </div>
            </section>
          </div>
        </div>
      </form>
    </div>
  );
}
