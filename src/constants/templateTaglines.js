/** Short line under template title (kiosk + admin), keyed by look preset. */
export const TEMPLATE_TAGLINES = {
  'tpl-preview--f1': 'Pit garage · racing red · hero plate',
  'tpl-preview--wizard': 'Candlelight · ancient halls · golden magic',
  'tpl-preview--viking': 'Nordic mist · steel · saga epic',
  'tpl-preview--thrones': 'Torchlit hall · royal cloak · realm',
  // Legacy presets (older saved templates)
  'tpl-preview--cyber': 'Neon · future city · night',
  'tpl-preview--luxury': 'Soft light · editorial · luxury',
};

export function getTemplateTagline(previewClass) {
  if (!previewClass) return '';
  return TEMPLATE_TAGLINES[previewClass] || '';
}
