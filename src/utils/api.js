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
