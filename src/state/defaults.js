import f1TemplateImage from '../assets/f1-template.png';
import wizardThemeImage from '../assets/theme-wizard.png';
import vikingThemeImage from '../assets/theme-viking.png';
import thronesThemeImage from '../assets/theme-thrones.png';

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function createDefaultTemplate(overrides = {}) {
  return {
    id: uid(),
    name: 'Untitled',
    backgroundUrl: null,
    prompt: '',
    negativePrompt: '',
    steps: 12,
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

/** Bundled backgrounds for default looks */
export const F1_DEFAULT_BACKGROUND_URL = f1TemplateImage;
export const WIZARD_DEFAULT_BACKGROUND_URL = wizardThemeImage;
export const VIKING_DEFAULT_BACKGROUND_URL = vikingThemeImage;
export const THRONES_DEFAULT_BACKGROUND_URL = thronesThemeImage;

export const PRESET_DEFAULT_BACKGROUND_URLS = {
  'tpl-preview--f1': F1_DEFAULT_BACKGROUND_URL,
  'tpl-preview--wizard': WIZARD_DEFAULT_BACKGROUND_URL,
  'tpl-preview--viking': VIKING_DEFAULT_BACKGROUND_URL,
  'tpl-preview--thrones': THRONES_DEFAULT_BACKGROUND_URL,
  /** Legacy presets (old saves had no bundled art — map to new plates) */
  'tpl-preview--cyber': WIZARD_DEFAULT_BACKGROUND_URL,
  'tpl-preview--luxury': VIKING_DEFAULT_BACKGROUND_URL,
};

const WIZARD_DEFAULTS = {
  name: 'Wizarding World',
  previewClass: 'tpl-preview--wizard',
  backgroundUrl: wizardThemeImage,
  prompt:
    'Magical academy portrait, warm candlelight, ancient stone and wood library, subtle golden sparks, cinematic fantasy, noble cloak',
  negativePrompt: 'modern clothing, sci-fi, gore, cartoon',
  fontSize: 36,
  textColor: '#f4e4bc',
};

const VIKING_DEFAULTS = {
  name: 'Viking Saga',
  previewClass: 'tpl-preview--viking',
  backgroundUrl: vikingThemeImage,
  prompt:
    'Viking warrior portrait, cold nordic light, fur and leather, misty fjord backdrop, cinematic historical epic, steel and runes',
  negativePrompt: 'cartoon, clean shaven modern, plastic armor',
  fontSize: 36,
  textColor: '#e8ecf2',
};

const THRONES_DEFAULTS = {
  name: 'Realm of Thrones',
  previewClass: 'tpl-preview--thrones',
  backgroundUrl: thronesThemeImage,
  prompt:
    'Medieval fantasy royal portrait, castle hall torchlight, house sigil mood, fur-lined cloak, dramatic Rembrandt lighting, grain film',
  negativePrompt: 'modern, sci-fi, cartoon, bright studio flash',
  fontSize: 34,
  textColor: '#d4c4a8',
};

/**
 * Old installs persisted Cyberpunk / Luxury presets without bundled URLs.
 * Upgrade to wizard / viking / thrones so kiosk cards show the new art and names.
 */
export function migrateStoredKioskTemplates(templates) {
  if (!Array.isArray(templates)) return templates;

  const nameOf = (t) => (t.name || '').trim().toLowerCase();
  const luxuryLegacy = templates.filter((t) => t.previewClass === 'tpl-preview--luxury');
  const isSecondLuxury = (t) => {
    const i = luxuryLegacy.findIndex((x) => x.id === t.id);
    return i === 1;
  };

  return templates.map((t) => {
    if (t.previewClass === 'tpl-preview--cyber') {
      return {
        ...t,
        ...WIZARD_DEFAULTS,
        id: t.id,
        overlayText: '',
        logoUrl: t.logoUrl,
      };
    }

    if (t.previewClass === 'tpl-preview--luxury') {
      const n = nameOf(t);
      const pick =
        n === 'luxury editorial' || (n.includes('luxury') && n.includes('editorial'))
          ? VIKING_DEFAULTS
          : n === 'untitled' || n === ''
            ? THRONES_DEFAULTS
            : isSecondLuxury(t)
              ? THRONES_DEFAULTS
              : VIKING_DEFAULTS;

      return {
        ...t,
        ...pick,
        id: t.id,
        overlayText: '',
        logoUrl: t.logoUrl,
      };
    }

    return t;
  });
}

export const DEFAULT_TEMPLATES = [
  createDefaultTemplate({
    name: 'F1 Racing',
    previewClass: 'tpl-preview--f1',
    backgroundUrl: f1TemplateImage,
    prompt:
      'Formula 1 racing driver portrait, motion blur speed lines, carbon helmet visor reflections, red neon rim light, cinematic pit garage atmosphere',
    negativePrompt: 'blurry face, low quality, cartoon',
    fontSize: 40,
    textColor: '#ffffff',
  }),
  createDefaultTemplate({
    name: 'Wizarding World',
    previewClass: 'tpl-preview--wizard',
    backgroundUrl: wizardThemeImage,
    prompt:
      'Magical academy portrait, warm candlelight, ancient stone and wood library, subtle golden sparks, cinematic fantasy, noble cloak',
    negativePrompt: 'modern clothing, sci-fi, gore, cartoon',
    fontSize: 36,
    textColor: '#f4e4bc',
  }),
  createDefaultTemplate({
    name: 'Viking Saga',
    previewClass: 'tpl-preview--viking',
    backgroundUrl: vikingThemeImage,
    prompt:
      'Viking warrior portrait, cold nordic light, fur and leather, misty fjord backdrop, cinematic historical epic, steel and runes',
    negativePrompt: 'cartoon, clean shaven modern, plastic armor',
    fontSize: 36,
    textColor: '#e8ecf2',
  }),
  createDefaultTemplate({
    name: 'Realm of Thrones',
    previewClass: 'tpl-preview--thrones',
    backgroundUrl: thronesThemeImage,
    prompt:
      'Medieval fantasy royal portrait, castle hall torchlight, house sigil mood, fur-lined cloak, dramatic Rembrandt lighting, grain film',
    negativePrompt: 'modern, sci-fi, cartoon, bright studio flash',
    fontSize: 34,
    textColor: '#d4c4a8',
  }),
];

export const DEFAULT_ADMIN_PASSWORD = 'catherine';
