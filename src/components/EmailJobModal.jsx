import React, { useEffect, useId, useState } from 'react';
import { sendEmailApi } from '../utils/api.js';

export function EmailJobModal({
  open,
  eventName = '',
  eventId = '',
  photoCount = 0,
  onCancel,
  onSubmit,
}) {
  const titleId = useId();
  const emailId = useId();
  const messageId = useId();

  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRecipient('');
    setMessage(
      `Hi [Client Name],\n\nThank you for having us at your wonderful event.\n\nAttached you'll find the full set of AI Photo Booth images from the activation, provided in both high-resolution and social-ready formats.\n\nIt was a pleasure to be part of your event, and we hope the experience added something special for your guests.\n\nIf you need anything further please don't hesitate to reach out. We hope to work with you again.\n\nWarm regards,\nCatherine Lowe\nFounder\nAI Photo Booth Co\nhttp://www.aiphotoboothco.com.au`,
    );
    setError('');
    setSubmitting(false);
    setSent(false);
  }, [open, eventName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (submitting) return;
    if (e.target === e.currentTarget) onCancel();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = recipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await sendEmailApi({ receiverEmail: trimmed, message: message.trim(), eventId });
      if (res.ok) {
        setSent(true);
      } else {
        setError(res.error || 'Failed to send email. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdrop}>
      <div
        className="modal modal--job"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Email job to client</h2>
        <p>
          <strong>{eventName || 'This event'}</strong> — send the photos directly to your client.
        </p>

        {sent ? (
          <div className="email-sent-state">
            <div className="email-sent-state__icon" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="email-sent-state__text">Email has been sent</p>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Close</button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="field">
            <label htmlFor={emailId}>Client email</label>
            <input
              id={emailId}
              type="email"
              className="input"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="client@example.com"
              autoFocus
              disabled={submitting}
              required
            />
          </div>
          <div className="field">
            <label htmlFor={messageId}>Message</label>
            <textarea
              id={messageId}
              className="textarea textarea--compact"
              rows={14}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
