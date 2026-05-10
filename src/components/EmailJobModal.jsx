import React, { useEffect, useId, useState } from 'react';

/**
 * Prompts the operator for the client's email + an optional message before
 * generating a zip and opening the default mail client.
 */
export function EmailJobModal({
  open,
  eventName = '',
  photoCount = 0,
  sendViaGmail = false,
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

  useEffect(() => {
    if (!open) return;
    setRecipient('');
    setMessage(
      `Hi,\n\nYour photos from ${eventName || 'our event'} are attached as a zip file.\n\nThanks!`,
    );
    setError('');
    setSubmitting(false);
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
      const res = await onSubmit({ recipient: trimmed, message: message.trim() });
      if (res?.ok) return; // parent closes the modal on success
      if (res?.reason === 'cancelled') {
        setSubmitting(false);
        return;
      }
      if (res?.reason === 'no-photos') {
        setError('No photos saved for this event yet.');
      } else if (res?.reason === 'unsupported') {
        setError('Email export is only available in the desktop app.');
      } else {
        setError('Something went wrong preparing the email.');
      }
      setSubmitting(false);
    } catch {
      setError('Something went wrong preparing the email.');
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
          {photoCount > 0
            ? `${photoCount} photo${photoCount === 1 ? '' : 's'} from `
            : ''}
          <strong>{eventName || 'this event'}</strong> will be packaged as a zip.
          {sendViaGmail
            ? ' They will be sent from the Gmail account you connected in Events (attachment size limits apply).'
            : ' Save the zip, then your default mail app opens with the message pre-filled.'}
        </p>

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
              rows={4}
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
            <button type="submit" className="btn btn-primary" disabled={submitting || photoCount === 0}>
              {submitting ? (sendViaGmail ? 'Sending…' : 'Preparing…') : sendViaGmail ? 'Send email' : 'Save zip & open email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
