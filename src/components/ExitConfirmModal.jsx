import React, { useCallback, useEffect, useRef, useState } from 'react';

/* Anything already on screen that owns the Escape key. Escape's job is to
   dismiss the innermost thing first, so the quit prompt only opens when there
   is nothing else to close — otherwise an operator escaping out of the email
   dialog would be asked whether to shut the booth down.

   The admin panel's overlays are a mix of the shared .modal-backdrop and
   one-off dialogs, so both are matched. The quit prompt itself is excluded, or
   it would see itself and never open. */
const BLOCKING_OVERLAY_SELECTOR = [
  '.modal-backdrop:not(.modal-backdrop--exit)',
  '[role="dialog"][aria-modal="true"]:not(.modal-backdrop--exit)',
].join(', ');

const hasBlockingOverlay = () =>
  Boolean(document.querySelector(BLOCKING_OVERLAY_SELECTOR));

/**
 * The only way out of the kiosk.
 *
 * The window is borderless and always on top, so there is no close button and
 * Alt+F4 is intercepted. Escape is the way out: press it with nothing else
 * open and this asks whether to quit; press it again to stay.
 *
 * Main does not swallow Escape — it stays a normal key event so the admin
 * panel's own dialogs keep closing on it — but it does forward the other close
 * routes Windows can take (the shell asking the window to close) as
 * `kiosk:exit-request`, which lands here too.
 *
 * Mounted at app root, not inside the kiosk flow, so it works in admin as well.
 */
export function ExitConfirmModal() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const confirmRef = useRef(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    window?.catherine?.kiosk?.cancelExit?.();
  }, []);

  const confirm = useCallback(() => {
    window?.catherine?.kiosk?.confirmExit?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;

      // Open -> Escape dismisses it, same key in as out.
      if (openRef.current) {
        close();
        return;
      }

      /* Checked synchronously, while the other dialog is still mounted. Its own
         Escape handler runs in this same dispatch and closes it; by the next
         tick it would be gone from the DOM and this would wrongly conclude the
         key was unclaimed and pop the quit prompt on top. */
      if (hasBlockingOverlay()) return;

      setOpen(true);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  /* Windows asking the window to close by some route other than the keyboard. */
  useEffect(() => {
    const bridge = window?.catherine?.kiosk;
    if (!bridge?.onExitRequest) return undefined;
    return bridge.onExitRequest(() => setOpen(true));
  }, []);

  /* Focus the safe choice, not the destructive one — an operator who opened
     this by accident and hits Enter should stay in the booth. */
  useEffect(() => {
    if (open && confirmRef.current) confirmRef.current.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop modal-backdrop--exit"
      role="dialog"
      aria-modal="true"
      aria-label="Close the photo booth"
    >
      <div className="modal modal--exit">
        <h2>Close the photo booth?</h2>
        <p>
          This shuts down the booth and its AI services, and returns to the Windows
          desktop. Guests will not be able to use it until it is started again.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-ghost"
            ref={confirmRef}
            onClick={close}
          >
            Stay in booth
          </button>
          <button type="button" className="btn btn-danger" onClick={confirm}>
            Quit booth
          </button>
        </div>
        <p className="modal-hint">Press Esc again to stay.</p>
      </div>
    </div>
  );
}
