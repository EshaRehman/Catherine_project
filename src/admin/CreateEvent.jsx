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
  const [photoCount, setPhotoCount] = useState(1);
  const [countdownSec, setCountdownSec] = useState(3);
  const [status, setStatus] = useState('active');

  useEffect(() => {
    if (existing) {
      setName(existing.name || '');
      setTemplateIds(existing.templateIds?.length ? [...existing.templateIds] : []);
      setPhotoCount(existing.photoCount ?? 1);
      setCountdownSec(existing.countdownSec ?? 3);
      setStatus(existing.status || 'active');
    } else {
      setName('');
      setTemplateIds([]);
      setPhotoCount(1);
      setCountdownSec(3);
      setStatus('active');
    }
  }, [existing]);

  const toggleTpl = (id) => {
    setTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || templateIds.length === 0) return;
    const ev = {
      id: existing?.id || uid(),
      name: name.trim(),
      templateIds: [...templateIds],
      photoCount: Math.max(1, Number(photoCount) || 1),
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
        <div>
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
          <label htmlFor="ev-photos">Number of photos</label>
          <input
            id="ev-photos"
            className="input"
            type="number"
            min={1}
            max={20}
            value={photoCount}
            onChange={(e) => setPhotoCount(e.target.value)}
          />
        </div>
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
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || !templateIds.length}>
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
