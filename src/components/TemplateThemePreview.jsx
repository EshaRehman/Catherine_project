import React from 'react';

/**
 * Template artwork with a shared dark gradient grade (photos + gradient presets).
 * variant: kiosk (3:4) | admin (fills card-preview)
 */
export function TemplateThemePreview({ template, variant = 'kiosk' }) {
  const pc = template?.previewClass || 'tpl-preview--thrones';
  const url = template?.backgroundUrl;

  const isF1 = pc === 'tpl-preview--f1';
  const portraitHero =
    pc === 'tpl-preview--wizard' ||
    pc === 'tpl-preview--viking' ||
    pc === 'tpl-preview--thrones';

  return (
    <div className={`tpl-card-visual tpl-card-visual--${variant}`}>
      {url ? (
        <img
          className={`tpl-card-visual__media${isF1 ? ' tpl-card-visual__media--f1' : ''}${portraitHero ? ' tpl-card-visual__media--portrait-hero' : ''}`}
          src={url}
          alt=""
        />
      ) : (
        <div className={`tpl-card-visual__media tpl-card-visual__gradient ${pc}`} />
      )}
      <div className="tpl-card-visual__shade" aria-hidden />
    </div>
  );
}
