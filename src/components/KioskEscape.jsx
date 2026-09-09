import { useEffect, useRef } from 'react';

/* Anything already on screen that owns the Escape key. Escape dismisses the
   innermost thing first, so it only reaches the booth when there is nothing
   else to close — otherwise an operator escaping out of the email dialog would
   also minimise the booth. The admin panel's overlays are a mix of the shared
   .modal-backdrop and one-off dialogs, so both are matched. */
const BLOCKING_OVERLAY_SELECTOR = [
  '.modal-backdrop',
  '[role="dialog"][aria-modal="true"]',
].join(', ');

const hasBlockingOverlay = () =>
  Boolean(document.querySelector(BLOCKING_OVERLAY_SELECTOR));

/**
 * Escape, when nothing on screen has claimed it, hands the machine back to
 * Windows: main drops the window out of borderless fullscreen, so the title
 * bar and the taskbar are both reachable and the window can be minimised or
 * closed like any other. The booth keeps running — nothing is closed, so the
 * backends stay up and no guest session is lost.
 *
 * Quitting is a separate, deliberate gesture: hold Escape for five seconds.
 * That is handled in main.js rather than here, so it still works when this
 * renderer has hung.
 *
 * Claimed-or-not is decided on keydown, while the other dialog is still
 * mounted: its own Escape handler runs in the same dispatch, and by keyup it
 * would be gone from the DOM and this would wrongly conclude the key was
 * unclaimed. The message is only sent on keyup, so a press that turns into a
 * five-second hold quits without also having minimised on the way.
 *
 * Mounted at app root, not inside the kiosk flow, so it works in admin too.
 */
export function KioskEscape() {
  const unclaimed = useRef(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      // `repeat` fires continuously while held; only the first press decides.
      if (event.key !== 'Escape' || event.repeat) return;
      unclaimed.current = !hasBlockingOverlay();
    };

    const onKeyUp = (event) => {
      if (event.key !== 'Escape' || !unclaimed.current) return;
      unclaimed.current = false;
      window?.catherine?.kiosk?.escape?.();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return null;
}
