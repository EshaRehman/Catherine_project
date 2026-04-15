import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

export function AdminUnlockModal({ open, onClose }) {
  const { adminPassword, setMode } = useApp();
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue('');
      setError(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (value === adminPassword) {
      setError(false);
      setValue('');
      setMode('admin');
      onClose();
    } else {
      setError(true);
    }
  };

  return (
    <div
      className="modal-backdrop modal-backdrop--admin-unlock"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-unlock-title"
      aria-describedby="admin-unlock-desc"
    >
      <form className="modal modal--admin-unlock" onSubmit={submit}>
        <div className="modal-admin-unlock__inner">
          <div className="modal-admin-unlock__head">
            <span className="modal-admin-unlock__badge" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 11V8a5 5 0 0 1 10 0v3"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
                <rect
                  x="5"
                  y="11"
                  width="14"
                  height="10"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <circle cx="12" cy="16" r="1.25" fill="currentColor" />
              </svg>
            </span>
            <div className="modal-admin-unlock__titles">
              <h2 id="admin-unlock-title">
                <span className="modal-admin-unlock__title-gradient">Admin</span> access
              </h2>
              <p id="admin-unlock-desc" className="modal-admin-unlock__subtitle">
                Enter the operator password to open the control panel.
              </p>
            </div>
          </div>

          <input
            className="input modal-admin-unlock__input"
            type="password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            placeholder="Password"
            autoComplete="current-password"
            aria-invalid={error}
          />
          {error ? (
            <p className="modal-admin-unlock__error" role="alert">
              Incorrect password.
            </p>
          ) : null}
          <div className="modal-actions modal-admin-unlock__actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary modal-admin-unlock__submit">
              Unlock
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
