import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TemplateThemePreview } from '../components/TemplateThemePreview.jsx';
import { getTemplateTagline } from '../constants/templateTaglines.js';

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

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
        {getTemplateTagline(template.previewClass) ? (
          <div className="kiosk-tpl-tagline">{getTemplateTagline(template.previewClass)}</div>
        ) : null}
      </div>
    </button>
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
  const [countdownSec, setCountdownSec] = useState(3);
  const [status, setStatus] = useState('active');
  const [formError, setFormError] = useState('');

  /* Reset when switching create ↔ edit only (not when `events` updates during create) */
  useEffect(() => {
    if (eventFormId) return;
    setName('');
    setTemplateIds([]);
    setCountdownSec(3);
    setStatus('active');
    setFormError('');
  }, [eventFormId]);

  useEffect(() => {
    if (!eventFormId) return;
    const ex = events.find((e) => e.id === eventFormId);
    if (!ex) return;
    setName(ex.name || '');
    setTemplateIds(ex.templateIds?.length ? [...ex.templateIds] : []);
    setCountdownSec(ex.countdownSec ?? 3);
    setStatus(ex.status || 'active');
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
      name: name.trim(),
      templateIds: [...templateIds],
      countdownSec: Math.max(1, Math.min(10, Number(countdownSec) || 3)),
      status,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    saveEvent(ev);
    setAdminRoute('events');
  };

  return (
    <>
      <div className="admin-page-head">
        <div className="admin-page-head__titles">
          <h1 className="admin-page-title">{existing ? 'Edit event' : 'Create event'}</h1>
          <p className="admin-page-sub">Name the experience and choose which looks guests can pick.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setAdminRoute('events')}>
          Cancel
        </button>
      </div>

      <form className="panel panel--event-form" onSubmit={submit}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Event info
        </div>
        <div className="field">
          <label htmlFor="ev-name">Event name</label>
          <input
            id="ev-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nike Launch"
            required
          />
        </div>

        <div className="section-title">Select templates</div>
        <p className="admin-page-sub" style={{ marginTop: -6 }}>
          Tap cards to include them in the live gallery. Guests only see names and artwork.
        </p>
        {formError ? (
          <p className="field-error" role="alert">
            {formError}
          </p>
        ) : null}
        <div
          className="kiosk-templates-grid kiosk-templates-grid--themes kiosk-templates-grid--inline"
          style={{ marginBottom: 24, marginTop: 16 }}
        >
          {templates.map((t) => (
            <TemplatePickCard
              key={t.id}
              template={t}
              selected={templateIds.includes(t.id)}
              onToggle={() => toggleTpl(t.id)}
            />
          ))}
        </div>

        <div className="section-title">Optional settings</div>
        <div className="field">
          <label htmlFor="ev-count">Countdown (seconds)</label>
          <input
            id="ev-count"
            className="input"
            type="number"
            min={1}
            max={10}
            value={countdownSec}
            onChange={(e) => setCountdownSec(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ev-status">Status</label>
          <select
            id="ev-status"
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          <button type="submit" className="btn btn-primary">
            Save event
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAdminRoute('events')}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
