import React, { useEffect, useId, useState } from 'react';

/**
 * Admin dialog: recipient email + send ZIP (same modal chrome as ConfirmModal, both themes).
 */
export function EmailZipModal({ open, title = 'Email exports', eventLabel = '', onClose, onSend, busy }) {
  const titleId = useId();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) {
      setEmail('');
      setLocalError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    const r = await onSend(email.trim());
    if (r?.ok) {
      onClose();
    } else {
      setLocalError(r?.error || 'Could not send email.');
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdrop}>
      <form
        className="modal modal--confirm modal-email-zip"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id={titleId}>{title}</h2>
        <p className="modal-email-zip__intro">
          {eventLabel ? `ZIP for “${eventLabel}”.` : 'Send export ZIP.'}
        </p>
        <label className="modal-email-zip__label" htmlFor="modal-email-zip-to">
          Recipient email
        </label>
        <input
          id="modal-email-zip-to"
          className="input modal-email-zip__input"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setLocalError('');
          }}
          disabled={busy}
        />
        {localError ? (
          <p className="modal-email-zip__error" role="alert">
            {localError}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send ZIP'}
          </button>
        </div>
      </form>
    </div>
  );
}
