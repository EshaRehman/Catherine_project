const BASE_URL = 'http://localhost:8000';

/**
 * Safely extract a human-readable error string from an API response body.
 * FastAPI/Pydantic v2 returns detail as an array of {type, loc, msg, input}
 * objects — flatten those so React can render the string safely.
 */
function extractError(body, fallback) {
  let detail = body?.detail || body?.message || fallback;
  if (Array.isArray(detail)) {
    /* Name the offending field. Without this a validation failure reads
       "String should have at least 1 character", which does not tell the
       operator which box to go and fill in. `loc` is like
       ["body", "templateImageUrl"] — the last entry is the field. */
    return detail
      .map((e) => {
        const msg = e.msg || JSON.stringify(e);
        const field = Array.isArray(e.loc) ? e.loc.filter((p) => p !== 'body').join('.') : '';
        return field ? `${field}: ${msg}` : msg;
      })
      .join(' · ');
  }
  if (typeof detail !== 'string') {
    return JSON.stringify(detail);
  }
  return detail;
}

async function apiRequest(method, endpoint, payload) {
  const bridge = window?.catherine?.api;
  if (!bridge) {
    return { ok: false, error: 'API bridge not available (not running in Electron).' };
  }
  
  try {
    const res = await bridge.request(method, `${BASE_URL}${endpoint}`, payload);
    
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: extractError(res.body, `Server error ${res.status}`) };
    }
    
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err?.message || 'Unexpected error calling API.' };
  }
}

export async function createTemplate(templateData) {
  return apiRequest('POST', '/create-template', templateData);
}

export async function getTemplates(mode) {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : '';
  return apiRequest('GET', `/get-templates${qs}`);
}

export async function getTemplateById(id) {
  return apiRequest('GET', `/get-single-template/${id}`);
}

export async function updateTemplate(id, templateData) {
  return apiRequest('PUT', `/edit-template/${id}`, templateData);
}

export async function deleteTemplate(id) {
  return apiRequest('DELETE', `/delete-template/${id}`);
}

export async function createEvent(eventData) {
  return apiRequest('POST', '/create-event', eventData);
}

export async function updateEvent(id, eventData) {
  return apiRequest('PUT', `/edit-event/${id}`, eventData);
}

export async function getEvents(mode) {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : '';
  return apiRequest('GET', `/show-events${qs}`);
}

export async function deleteEventApi(id) {
  return apiRequest('DELETE', `/delete-event/${id}`);
}

export async function connectGmailApi({ senderGmail, senderAppPassword }) {
  return apiRequest('POST', '/connect-gmail', {
    sender_gmail: senderGmail,
    sender_app_password: senderAppPassword,
  });
}

export async function getGmailStatusApi() {
  return apiRequest('GET', '/show-connect-gmail');
}

export function downloadZipApi(eventId) {
  const url = `http://127.0.0.1:8000/zip/${eventId}`;
  const a = document.createElement('a');
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return { ok: true };
}

export async function sendEmailApi({ receiverEmail, message, eventId }) {
  return apiRequest('POST', '/send-email', {
    receiver_email: receiverEmail,
    message,
    eventId,
  });
}

export async function generateImage(imageBase64, templateId, eventId, seed) {
  const bridge = window?.catherine?.api;
  if (!bridge) {
    return { ok: false, error: 'API bridge not available.' };
  }
  try {
    const res = await bridge.generate(`${BASE_URL}/generate`, imageBase64, templateId, eventId, seed);
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: extractError(res.body, `Server error ${res.status}`) };
    }
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err?.message || 'Unexpected error calling /generate.' };
  }
}

export async function previewImageApi(imageBase64, prompt, seed, mode) {
  const bridge = window?.catherine?.api;
  if (!bridge) return { ok: false, error: 'API bridge not available.' };
  try {
    const res = await bridge.previewImage(imageBase64, prompt, seed ?? null, mode || 'local');
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: res.body?.detail || `HTTP ${res.status}` };
    }
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err?.message || 'Request failed.' };
  }
}
