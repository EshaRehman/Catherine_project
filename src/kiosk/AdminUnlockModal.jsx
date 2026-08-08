import React, { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

const MODE_OPTIONS = [
  { value: 'local', label: 'Local AI' },
  { value: 'paid', label: 'Paid API' },
];

export function AdminUnlockModal({ open, onClose }) {
  const { adminPassword, setMode, settings, setSettings, resetAdminNav } = useApp();
  const [step, setStep] = useState('password'); // 'password' | 'mode'
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  if (!open) return null;

  const reset = () => {
    setStep('password');
    setValue('');
    setError(false);
  };

  const submitPassword = (e) => {
    e.preventDefault();
    if (value === adminPassword) {
      setError(false);
      setStep('mode');
    } else {
      setError(true);
    }
  };

  const chooseMode = (aiMode) => {
    setSettings((s) => ({ ...s, aiMode }));
    reset();
    // Drop any template/event the previous admin session left open — those IDs
    // belong to the mode that was active then, and restoring them here showed a
    // paid template while the app was scoped to local (and vice versa).
    resetAdminNav();
    setMode('admin');
    onClose();
  };

  if (step === 'mode') {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose AI mode">
        <div className="modal">
          <h2>Choose AI mode</h2>
          <div className="modal-actions" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn btn-ghost mode-option${
                  settings.aiMode === opt.value ? ' mode-option--current' : ''
                }`}
                aria-pressed={settings.aiMode === opt.value}
                onClick={() => chooseMode(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Admin access">
      <form
        className="modal"
        onSubmit={submitPassword}
      >
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
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
