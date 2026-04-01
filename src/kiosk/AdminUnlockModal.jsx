import React, { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

export function AdminUnlockModal({ open, onClose }) {
  const { adminPassword, setMode } = useApp();
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Admin access">
      <form className="modal" onSubmit={submit}>
        <h2>Admin access</h2>
        <p>Enter the operator password to open the control panel.</p>
        <input
          className="input"
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Password"
          autoComplete="current-password"
        />
        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: '0.88rem', marginTop: 10 }}>
            Incorrect password.
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
