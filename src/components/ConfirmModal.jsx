import React, { useEffect, useId } from 'react';

/**
 * Themed confirmation dialog (replaces window.confirm) — matches admin modal styling.
 */
export function ConfirmModal({
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  /** When false, primary button is not red (e.g. OK on an info dialog). */
  destructive = true,
  /** Single-button dismiss (calls onConfirm then onClose). */
  hideCancel = false,
}) {
  const titleId = useId();

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

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div
        className="modal modal--confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          {!hideCancel ? (
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={destructive ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
