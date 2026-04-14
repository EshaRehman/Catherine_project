import {
  OUTPUT_HEIGHT,
  OUTPUT_PREVIEW_HEIGHT,
  OUTPUT_PREVIEW_WIDTH,
  OUTPUT_WIDTH,
} from '../constants/outputFormat.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function gradientForClass(previewClass) {
  if (previewClass === 'tpl-preview--f1')
    return ['#1a0a12', '#5c0a0a', '#ff2b2b'];
  if (previewClass === 'tpl-preview--wizard')
    return ['#1a0f28', '#3d2a5c', '#c9a227'];
  if (previewClass === 'tpl-preview--viking')
    return ['#0c1418', '#1a3040', '#8ba8b8'];
  if (previewClass === 'tpl-preview--thrones')
    return ['#141008', '#3a3028', '#8b7355'];
  if (previewClass === 'tpl-preview--cyber')
    return ['#0a0f1a', '#1a0a2e', '#00f0ff'];
  return ['#2a2420', '#4a4038', '#c4a574'];
}

function subjectFilterForClass(previewClass) {
  if (previewClass === 'tpl-preview--f1')
    return 'saturate(1.18) contrast(1.12) brightness(1.04)';
  if (previewClass === 'tpl-preview--wizard')
    return 'saturate(1.14) contrast(1.1) brightness(1.05)';
  if (previewClass === 'tpl-preview--viking')
    return 'saturate(1.06) contrast(1.14) brightness(1.03)';
  if (previewClass === 'tpl-preview--thrones')
    return 'saturate(0.96) contrast(1.14) brightness(1.03)';
  if (previewClass === 'tpl-preview--cyber')
    return 'saturate(1.35) contrast(1.12) brightness(1.05)';
  return 'saturate(1.05) contrast(1.08) brightness(1.03)';
}

/** Full-bleed cover draw */
function drawImageCover(ctx, img, width, height) {
  const s = Math.max(width / img.width, height / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Cinematic treatment when F1 uses the real pit / driver plate */
function applyF1PhotoGrade(ctx, width, height) {
  const bottom = ctx.createLinearGradient(0, height, 0, height * 0.42);
  bottom.addColorStop(0, 'rgba(45, 6, 12, 0.62)');
  bottom.addColorStop(0.45, 'rgba(90, 12, 18, 0.18)');
  bottom.addColorStop(1, 'transparent');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, width, height);

  const top = ctx.createLinearGradient(0, 0, 0, height * 0.5);
  top.addColorStop(0, 'rgba(255, 245, 235, 0.12)');
  top.addColorStop(0.35, 'rgba(255, 200, 180, 0.04)');
  top.addColorStop(1, 'transparent');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    width * 0.15,
    width * 0.5,
    height * 0.45,
    width * 0.85,
  );
  vignette.addColorStop(0, 'transparent');
  vignette.addColorStop(1, 'rgba(18, 8, 14, 0.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

/** Shared grade for bundled fantasy / medieval plate backgrounds */
function applyFantasyPhotoGrade(ctx, width, height, previewClass) {
  const bottom = ctx.createLinearGradient(0, height, 0, height * 0.38);
  bottom.addColorStop(0, 'rgba(8, 6, 18, 0.55)');
  bottom.addColorStop(0.5, 'rgba(20, 14, 32, 0.12)');
  bottom.addColorStop(1, 'transparent');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, width, height);

  const top = ctx.createLinearGradient(0, 0, 0, height * 0.42);
  const topTint =
    previewClass === 'tpl-preview--wizard'
      ? 'rgba(200, 170, 90, 0.1)'
      : previewClass === 'tpl-preview--viking'
        ? 'rgba(140, 180, 210, 0.08)'
        : 'rgba(180, 150, 110, 0.09)';
  top.addColorStop(0, topTint);
  top.addColorStop(0.4, 'rgba(255, 255, 255, 0.02)');
  top.addColorStop(1, 'transparent');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.4,
    width * 0.12,
    width * 0.5,
    height * 0.45,
    width * 0.88,
  );
  vignette.addColorStop(0, 'transparent');
  vignette.addColorStop(1, 'rgba(6, 4, 12, 0.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

async function fillCanvasBackground(ctx, template, width, height) {
  if (template.backgroundUrl) {
    try {
      const bg = await loadImage(template.backgroundUrl);
      ctx.save();
      ctx.globalAlpha = 1;
      drawImageCover(ctx, bg, width, height);
      if (template.previewClass === 'tpl-preview--f1') {
        applyF1PhotoGrade(ctx, width, height);
      } else if (
        template.previewClass === 'tpl-preview--wizard' ||
        template.previewClass === 'tpl-preview--viking' ||
        template.previewClass === 'tpl-preview--thrones'
      ) {
        applyFantasyPhotoGrade(ctx, width, height, template.previewClass);
      } else {
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = 'rgba(245, 242, 237, 0.06)';
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      return;
    } catch {
      /* fall through to gradient */
    }
  }
  const [c0, c1, c2] = gradientForClass(template.previewClass);
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, c0);
  g.addColorStop(0.45, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

export async function compositePortrait({
  subjectDataUrl,
  template,
  width = OUTPUT_WIDTH,
  height = OUTPUT_HEIGHT,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  await fillCanvasBackground(ctx, template, width, height);

  let subj;
  try {
    subj = await loadImage(subjectDataUrl);
  } catch {
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  /* Rounded-rect portrait window over theme (kiosk: no caption / logo baked in) */
  const rw = width * 0.84;
  const rh = height * 0.66;
  const rx = (width - rw) / 2;
  const ry = height * 0.13;
  const corner = Math.min(width, height) * 0.05;

  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(rx, ry, rw, rh, corner);
  } else {
    ctx.rect(rx, ry, rw, rh);
  }
  ctx.clip();

  const scale = Math.max(rw / subj.width, rh / subj.height);
  const sw = subj.width * scale;
  const sh = subj.height * scale;
  const sx = rx + rw / 2 - sw / 2;
  /* Bias crop upward so more head stays in frame */
  const sy = ry + rh / 2 - sh / 2 - height * 0.028;
  ctx.filter = subjectFilterForClass(template.previewClass);
  ctx.drawImage(subj, sx, sy, sw, sh);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function compositePreviewMock(
  template,
  width = OUTPUT_PREVIEW_WIDTH,
  height = OUTPUT_PREVIEW_HEIGHT,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  await fillCanvasBackground(ctx, template, width, height);

  const hasPhotoBg = Boolean(template.backgroundUrl);
  if (!hasPhotoBg) {
    const mrw = width * 0.82;
    const mrh = height * 0.62;
    const mrx = (width - mrw) / 2;
    const mry = height * 0.16;
    const mc = Math.min(width, height) * 0.055;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(mrx, mry, mrw, mrh, mc);
    } else {
      ctx.rect(mrx, mry, mrw, mrh);
    }
    ctx.fill();
  }

  const mockOverlay = (template.overlayText && String(template.overlayText).trim()) || '';
  if (mockOverlay) {
    const tx = (template.textX / 100) * width;
    const ty = (template.textY / 100) * height;
    const fs = Math.max(14, Math.round((template.fontSize || 40) * (width / OUTPUT_WIDTH)));
    ctx.font = `700 ${fs}px ${template.fontFamily || 'DM Sans, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, fs * 0.07);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.fillStyle = template.textColor || '#fff';
    ctx.strokeText(mockOverlay, tx, ty);
    ctx.fillText(mockOverlay, tx, ty);
  }

  if (template.logoUrl) {
    try {
      const lg = await loadImage(template.logoUrl);
      const base = Math.min(width, height) * (template.logoScale || 0.2);
      const lw = (lg.width / lg.height) * base;
      const lh = base;
      const lx = (template.logoX / 100) * width - lw / 2;
      const ly = (template.logoY / 100) * height - lh / 2;
      ctx.drawImage(lg, lx, ly, lw, lh);
    } catch {
      /* skip */
    }
  }

  return canvas.toDataURL('image/jpeg', 0.88);
}
