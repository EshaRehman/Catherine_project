const BASE_URL = 'http://localhost:8000';

async function apiRequest(method, endpoint, payload) {
  const bridge = window?.catherine?.api;
  if (!bridge) {
    return { ok: false, error: 'API bridge not available (not running in Electron).' };
  }
  
  try {
    const res = await bridge.request(method, `${BASE_URL}${endpoint}`, payload);
    
    if (res.status < 200 || res.status >= 300) {
      const detail = res.body?.detail || res.body?.message || `Server error ${res.status}`;
      return { ok: false, error: detail };
    }
    
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err?.message || 'Unexpected error calling API.' };
  }
}

export async function createTemplate(templateData) {
  return apiRequest('POST', '/create-template', templateData);
}

export async function getTemplates() {
  return apiRequest('GET', '/get-templates');
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

export async function getEvents() {
  return apiRequest('GET', '/show-events');
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
      const detail = res.body?.detail || res.body?.message || `Server error ${res.status}`;
      return { ok: false, error: detail };
    }
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err?.message || 'Unexpected error calling /generate.' };
  }
}

export async function previewImageApi(imageBase64, prompt, seed) {
  const bridge = window?.catherine?.api;
  if (!bridge) return { ok: false, error: 'API bridge not available.' };
  try {
    const res = await bridge.previewImage(imageBase64, prompt, seed ?? null);
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: res.body?.detail || `HTTP ${res.status}` };
    }
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err?.message || 'Request failed.' };
  }
}
