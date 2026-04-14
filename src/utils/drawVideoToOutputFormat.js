import {
  OUTPUT_ASPECT_RATIO,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
} from '../constants/outputFormat.js';

/**
 * Center-crops `video` to portrait 4:5 and draws into `canvas` at outW×outH.
 * @returns {boolean} false if video has no dimensions yet
 */
export function drawVideoCenterCropToCanvas(
  video,
  canvas,
  outW = OUTPUT_WIDTH,
  outH = OUTPUT_HEIGHT,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;

  if (canvas.width !== outW || canvas.height !== outH) {
    canvas.width = outW;
    canvas.height = outH;
  }

  const ctx = canvas.getContext('2d', { alpha: false });
  const srcAr = vw / vh;
  let sx;
  let sy;
  let sw;
  let sh;

  if (srcAr > OUTPUT_ASPECT_RATIO) {
    sh = vh;
    sw = Math.round(vh * OUTPUT_ASPECT_RATIO);
    sx = Math.round((vw - sw) / 2);
    sy = 0;
  } else {
    sw = vw;
    sh = Math.round(vw / OUTPUT_ASPECT_RATIO);
    sx = 0;
    sy = Math.round((vh - sh) / 2);
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  return true;
}
