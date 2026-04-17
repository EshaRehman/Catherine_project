import React from 'react';

/**
 * Template artwork: background (photo or gradient grade) plus optional text + logo
 * aligned like the editor / kiosk output. variant: kiosk (4:5) | admin (fills card-preview)
 */
export function TemplateThemePreview({ template, variant = 'kiosk' }) {
  const pc = template?.previewClass || 'tpl-preview--thrones';
  const url = template?.backgroundUrl;
  const overlayText = (template?.overlayText || '').trim();
  const logoUrl = template?.logoUrl;
  const fontSizePx = Number(template?.fontSize) || 42;
  /** Smaller cards than the editor stage — scale headline so it fits */
  const fontMult = variant === 'kiosk' ? 0.24 : 0.17;
  const textX = Number(template?.textX);
  const textY = Number(template?.textY);
  const logoX = Number(template?.logoX);
  const logoY = Number(template?.logoY);
  const logoScale = Number(template?.logoScale);

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
      <div className="tpl-card-visual__ui" aria-hidden>
        {overlayText ? (
          <div
            className="tpl-card-visual__text"
            style={{
              left: `${Number.isFinite(textX) ? textX : 50}%`,
              top: `${Number.isFinite(textY) ? textY : 78}%`,
              fontFamily: template?.fontFamily || 'system-ui, sans-serif',
              fontSize: `clamp(8px, ${fontSizePx * fontMult}px, 26px)`,
              color: template?.textColor || '#ffffff',
            }}
          >
            {template.overlayText}
          </div>
        ) : null}
        {logoUrl ? (
          <div
            className="tpl-card-visual__logo"
            style={{
              left: `${Number.isFinite(logoX) ? logoX : 88}%`,
              top: `${Number.isFinite(logoY) ? logoY : 10}%`,
              width: `${(Number.isFinite(logoScale) ? logoScale : 0.22) * 100}%`,
              maxWidth: '45%',
            }}
          >
            <img src={logoUrl} alt="" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
