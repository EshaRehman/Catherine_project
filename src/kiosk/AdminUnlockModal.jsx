import React, { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

const MODE_OPTIONS = [
  {
    value: 'local',
    label: 'Local AI',
    description: 'Runs on this machine’s ComfyUI. No per-image cost.',
  },
  {
    value: 'paid',
    label: 'Paid API',
    description: 'Sends photos to OpenAI (gpt-image-2). Costs per image.',
  },
];

export function AdminUnlockModal({ open, onClose }) {
  const { adminPassword, setMode, settings, setSettings } = useApp();
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
    setMode('admin');
    onClose();
  };

  if (step === 'mode') {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose AI mode">
        <div className="modal">
          <h2>Choose AI mode</h2>
          <p>Events and templates are kept separate per mode. Pick which one to open.</p>
          <div className="modal-actions" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${settings.aiMode === opt.value ? 'btn-primary' : 'btn-ghost'}`}
                style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '12px 14px' }}
                onClick={() => chooseMode(opt.value)}
              >
                <span style={{ fontWeight: 600 }}>
                  {opt.label}
                  {settings.aiMode === opt.value ? ' (current)' : ''}
                </span>
                <span style={{ fontSize: '0.8rem', opacity: 0.8, fontWeight: 400 }}>{opt.description}</span>
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
