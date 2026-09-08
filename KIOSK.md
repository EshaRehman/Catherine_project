# Running the booth as a kiosk

Everything here is already built into the app. This file is the operator's
reference for what changed and how to set a venue PC up.

---

## 1. Full screen, no Windows chrome

The app now opens borderless and full screen on the primary display, above the
taskbar. There is no title bar, no menu bar, no window buttons and no taskbar —
the booth owns the whole screen.

Nothing to configure. It is the default.

**For development**, get the old resizable 685x1214 window back with:

```bash
npm run start:windowed
```

or set `CATHERINE_WINDOWED=1` in the environment before `npm start`.

### Keyboard lockdown

While in kiosk mode the app swallows the shortcuts that could break a live
booth: reload (`Ctrl+R`, `F5`), devtools (`F12`, `Ctrl+Shift+I`), print, find,
zoom, `Ctrl+W`, `Alt+F4`, `F11`. Copy, paste, cut and select-all still work, so
the admin panel is unaffected. Right-click is disabled.

---

## 2. Exiting: Escape

Press **Esc** → a confirmation appears → **Quit booth** closes everything,
**Stay in booth** (or a second **Esc**) dismisses it.

Escape still does its normal job inside the admin panel: if a dialog is open,
Escape closes that dialog and the quit prompt stays out of the way. The quit
prompt only appears when there is nothing else on screen to dismiss.

**If the app has frozen** and the prompt will not appear: **hold Esc for three
seconds**. That quits from the main process and does not depend on the UI
responding at all.

---

## 3. Staying awake and staying on the welcome screen

- The app holds a display-sleep blocker for as long as it runs, so Windows will
  not blank the screen, dim it, sleep, or start a screensaver. The blocker is
  re-armed after a resume or an unlock.
- Timers are not throttled when the window loses focus, so the idle video keeps
  playing smoothly.
- If a guest walks away mid-session, the booth returns to the welcome screen by
  itself:

  | Screen | Returns to welcome after |
  | --- | --- |
  | Template picker, instructions, camera, result | 90 seconds of no touch |
  | QR code | 120 seconds of no touch |
  | Generating | 4 minutes (backstop for a wedged backend only) |

  Touching the screen resets the clock. The welcome screen itself never times
  out, and generation in progress is never interrupted early.

To change the timings, edit `IDLE_TIMEOUT_MS` and `PROCESSING_TIMEOUT_MS` at the
top of `src/kiosk/KioskApp.jsx`.

---

## 4. Running for 8+ hours

- **Backends are supervised.** FastAPI and ComfyUI are restarted automatically
  if they die, with a 2s → 30s backoff. A backend that has been up more than a
  minute gets its backoff reset, so a single late crash recovers promptly.
- **Backends are killed as a tree** on exit (`taskkill /T`). Previously only the
  launcher process was killed and orphaned Python kept ports 8000 and 8188 open,
  which broke the next launch.
- **Port conflicts are named.** On start the app checks whether ports 8000 and
  8188 are already serving *its own* backends. If something else holds a port it
  says so in the log with the `netstat` command to find the culprit, instead of
  failing silently.
- **The renderer recovers from crashes.** A renderer crash, a hang, or a failed
  load reloads the window in place, which lands back on the welcome screen.
- **Only one copy runs.** A second launch hands focus to the running booth and
  exits.

---

## 5. Starting automatically

Run once, as the account the booth runs as:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\install-kiosk-autostart.ps1
```

That does three things:

1. Registers a scheduled task (`CatherinePhotoBoothKiosk`) that runs
   `scripts/kiosk-watchdog.ps1` 20 seconds after logon. The watchdog starts the
   booth and relaunches it within ~10s if it ever disappears.
2. Disables the screensaver for this user.
3. Sets monitor, sleep and hibernate timeouts to Never (needs an elevated
   PowerShell; the script says so if it could not).

A packaged build also registers itself under the per-user Run key, so it starts
at logon even without the task.

**Quitting on purpose stays quit.** The app writes
`%LOCALAPPDATA%\CatherineKiosk\stop.flag` when you choose *Quit booth*, and the
watchdog stands down instead of relaunching. The flag is cleared at the next
logon, so the booth always comes back after a restart.

Watchdog log: `%LOCALAPPDATA%\CatherineKiosk\watchdog.log`

Test without rebooting:

```bash
Start-ScheduledTask -TaskName CatherinePhotoBoothKiosk
```

To undo everything:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-kiosk-autostart.ps1
```

### Two things the script cannot do for you

- **Auto-logon.** If the PC asks for a password at boot, nothing runs until
  someone types it. Run `netplwiz` and untick *Users must enter a user name and
  password to use this computer*.
- **Windows Update restarts.** Set *Settings → Windows Update → Active hours* to
  cover the event, or pause updates for the week.

---

## 6. Coming back live after a restart

The booth now reopens straight into customer mode on the live event it was
running when it closed. No trip through admin, no re-picking the AI mode.

The active event and AI mode were always saved — they live in `localStorage` and
were never lost. What was missing was patience. The app starts FastAPI itself
and opens the window immediately, but **FastAPI takes about 8 seconds to be
ready** (measured on this machine). The kiosk asked for its events and templates
once, roughly a second in, got nothing, and never asked again. With no events
loaded, the saved active-event id matched nothing, and the welcome screen came
up disabled showing "In admin, add templates to an event and set that event as
active" — which read as though the event had been forgotten.

Opening admin and returning remounted the kiosk and refetched, by which time the
backend was up. That is why it seemed to need a visit to admin every launch.

Now the kiosk retries (0.5s → 4s backoff) until the backend answers, and shows
**"Getting ready…"** on the welcome screen while it waits instead of the admin
instructions. It also refetches if the AI mode or the active event changes.

This matters most for the autostart in section 5: at logon everything is cold,
so before this fix the booth would have come up dead on every boot.

## 7. The logo and caption on the downloaded photo

Fixed. The template's logo and overlay text are painted on in the app after the
AI returns its image, so the server's stored copy — the one behind the QR code —
never had them. The app now posts the finished, branded picture back to
`POST /finalize-image`, which replaces both the Cloudinary asset and the file in
the event folder.

The result is that the picture on the booth screen, the picture a guest
downloads from the QR code, and the picture in the operator's zip are now the
same image.

If the re-upload fails (venue internet), the QR still works but serves the
un-branded original, and the reason is logged to the console. Templates with no
logo and no caption skip the extra upload entirely.

> **This needs the backend restarted.** The endpoint lives in
> `Backend(Fast-API)/routes/generate.py`, which was synced to
> `C:\PhotoBoothApp\APP-Electron`. Restart the app (or the FastAPI process) to
> pick it up.
