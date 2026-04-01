const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function createDefaultTemplate(overrides = {}) {
  return {
    id: uid(),
    name: 'Untitled',
    backgroundUrl: null,
    prompt: '',
    negativePrompt: '',
    steps: 28,
    cfgScale: 7,
    seedMode: 'random',
    fixedSeed: 42,
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
    loraRefs: '',
    themeNotes: '',
    ...overrides,
  };
}

export const DEFAULT_TEMPLATES = [
  createDefaultTemplate({
    name: 'F1 Racing',
    previewClass: 'tpl-preview--f1',
    prompt:
      'Formula 1 racing driver portrait, motion blur speed lines, carbon helmet visor reflections, red neon rim light, cinematic',
    negativePrompt: 'blurry face, low quality, cartoon',
    overlayText: 'F1 EXPERIENCE',
    fontSize: 38,
    textColor: '#ff2b2b',
  }),
  createDefaultTemplate({
    name: 'Cyberpunk Portrait',
    previewClass: 'tpl-preview--cyber',
    prompt:
      'Cyberpunk portrait, neon magenta and cyan city bokeh, rain reflections, futuristic collar, blade runner aesthetic',
    negativePrompt: 'ugly, deformed, text artifacts',
    overlayText: 'NEON CITY',
    fontSize: 36,
    textColor: '#00f0ff',
  }),
  createDefaultTemplate({
    name: 'Luxury Editorial',
    previewClass: 'tpl-preview--luxury',
    prompt:
      'High fashion editorial, soft diffused studio light, vogue cover style, luxury fabric texture, muted warm tones',
    negativePrompt: 'harsh flash, amateur',
    overlayText: 'EDITORIAL',
    fontSize: 34,
    textColor: '#f5f2ed',
  }),
];

export const DEFAULT_ADMIN_PASSWORD = 'catherine';
