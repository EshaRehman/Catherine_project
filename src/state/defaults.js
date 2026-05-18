const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function createDefaultTemplate(overrides = {}) {
  return {
    id: uid(),
    name: 'Untitled',
    backgroundUrl: null,
    prompt: '',
    negativePrompt: '',
    steps: 6,
    cfgScale: 7,
    overlayText: '',
    fontFamily: 'DM Sans, system-ui, sans-serif',
    fontSize: 42,
    textColor: '#ffffff',
    textX: 50,
    textY: 78,
    logoUrl: null,
    logoX: 88,
    logoY: 10,
    logoScale: 0.22,
    logoLocked: false,
    ...overrides,
  };
}

/** No bundled background presets — templates are loaded from the database. */
export const PRESET_DEFAULT_BACKGROUND_URLS = {};

/**
 * Old installs persisted Cyberpunk / Luxury presets without bundled URLs.
 * Returns the templates as-is since migration is no longer needed.
 */
export function migrateStoredKioskTemplates(templates) {
  if (!Array.isArray(templates)) return templates;
  return templates;
}

export const DEFAULT_TEMPLATES = [];

export const DEFAULT_ADMIN_PASSWORD = 'catherine';


