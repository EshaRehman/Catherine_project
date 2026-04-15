/**
 * Kiosk → main-process job export storage (ZIP + retention).
 * Email ZIP uses SMTP from env or userData/smtp-config.json (main process only).
 */

function api() {
  return typeof window !== 'undefined' ? window.catherine?.jobExports : null;
}

export async function saveKioskJobCapture({
  eventId,
  eventName,
  dataUrl,
  templateName,
  retentionDays,
}) {
  const jobExports = api();
  if (!jobExports?.saveCapture) {
    return { ok: false, skipped: true, reason: 'Not in Electron or preload missing' };
  }
  return jobExports.saveCapture({
    eventId,
    eventName,
    dataUrl,
    templateName,
    retentionDays,
  });
}

export async function listJobExports() {
  const jobExports = api();
  if (!jobExports?.list) return { ok: false, jobs: [], retentionDays: 60 };
  return jobExports.list();
}

export async function cleanupJobExportsNow() {
  const jobExports = api();
  if (!jobExports?.cleanup) return { ok: false };
  return jobExports.cleanup();
}

export async function downloadJobZipForEvent(eventId, defaultBaseName) {
  const jobExports = api();
  if (!jobExports?.exportZipForEvent) {
    return {
      ok: false,
      error:
        'Exports need the Electron window (run npm start). A normal browser tab has no file/ZIP access.',
    };
  }
  return jobExports.exportZipForEvent({ eventId, defaultBaseName });
}

export async function emailJobZipExport({ eventId, defaultBaseName, to }) {
  const jobExports = api();
  if (!jobExports?.emailZip) {
    return {
      ok: false,
      error:
        'Email ZIP needs the Electron window (run npm start). A normal browser tab has no mail/ZIP bridge.',
    };
  }
  return jobExports.emailZip({ eventId, defaultBaseName, to });
}
