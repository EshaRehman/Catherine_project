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
  if (previewClass === 'tpl-preview--cyber')
    return ['#0a0f1a', '#1a0a2e', '#00f0ff'];
  return ['#2a2420', '#4a4038', '#c4a574'];
}

export async function compositePortrait({
  subjectDataUrl,
  template,
  width = 1080,
  height = 1920,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const [c0, c1, c2] = gradientForClass(template.previewClass);
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, c0);
  g.addColorStop(0.45, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  if (template.backgroundUrl) {
    try {
      const bg = await loadImage(template.backgroundUrl);
      const s = Math.max(width / bg.width, height / bg.height);
      const dw = bg.width * s;
      const dh = bg.height * s;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(bg, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    } catch {
      /* keep gradient */
    }
  }

  let subj;
  try {
    subj = await loadImage(subjectDataUrl);
  } catch {
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  const cx = width * 0.5;
  const cy = height * 0.42;
  const rw = width * 0.72;
  const rh = height * 0.52;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
  ctx.clip();

  const scale = Math.max(rw / subj.width, rh / subj.height);
  const sw = subj.width * scale;
  const sh = subj.height * scale;
  const sx = cx - sw / 2;
  const sy = cy - sh / 2;
  ctx.filter =
    template.previewClass === 'tpl-preview--cyber'
      ? 'saturate(1.35) contrast(1.12) brightness(1.05)'
      : template.previewClass === 'tpl-preview--f1'
        ? 'saturate(1.25) contrast(1.15) brightness(1.02)'
        : 'saturate(1.05) contrast(1.08) brightness(1.03)';
  ctx.drawImage(subj, sx, sy, sw, sh);
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(40px)';
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rw / 2 + 30, rh / 2 + 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = c2;
  ctx.fill();
  ctx.restore();

  if (template.overlayText) {
    const tx = (template.textX / 100) * width;
    const ty = (template.textY / 100) * height;
    const fs = Math.max(18, Math.round((template.fontSize || 40) * (width / 720)));
    ctx.font = `700 ${fs}px ${template.fontFamily || 'DM Sans, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, fs * 0.08);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.fillStyle = template.textColor || '#fff';
    ctx.strokeText(template.overlayText, tx, ty);
    ctx.fillText(template.overlayText, tx, ty);
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

  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function compositePreviewMock(template, width = 540, height = 960) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const [c0, c1, c2] = gradientForClass(template.previewClass);
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, c0);
  g.addColorStop(0.55, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  if (template.backgroundUrl) {
    try {
      const bg = await loadImage(template.backgroundUrl);
      const s = Math.max(width / bg.width, height / bg.height);
      const dw = bg.width * s;
      const dh = bg.height * s;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(bg, (width - dw) / 2, (height - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    } catch {
      /* ignore */
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.4, width * 0.22, height * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  if (template.overlayText) {
    const tx = (template.textX / 100) * width;
    const ty = (template.textY / 100) * height;
    const fs = Math.max(14, Math.round((template.fontSize || 40) * (width / 720)));
    ctx.font = `700 ${fs}px ${template.fontFamily || 'DM Sans, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, fs * 0.07);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.fillStyle = template.textColor || '#fff';
    ctx.strokeText(template.overlayText, tx, ty);
    ctx.fillText(template.overlayText, tx, ty);
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
