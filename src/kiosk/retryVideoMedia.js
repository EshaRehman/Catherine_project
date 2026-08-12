/**
 * "Going back for another go" clip, shown between a finished/failed attempt and
 * the camera reopening.
 *
 * REFRAMED to 1080x1320 — the portrait frame's own ratio — for the same reason
 * the processing loop is: this clip now plays inside .kiosk-portrait-frame
 * rather than full-bleed, and the raw source is 720x1280 (0.5625) against the
 * frame's 0.818, so object-fit: cover would have cropped it hard.
 *
 * The source carries 36/76 left/right and 144/186 top/bottom of black margin
 * (ffmpeg cropdetect agrees: crop=608:952:36:144). Cropping to that content and
 * padding back out to a 9:11 box puts the mascot at 94.1% of the frame height —
 * matching the processing clip's 94.2%, so the robot reads at the same size
 * across both stages. Content sits at 73% of the width rather than the
 * processing clip's 85%, which is inherent: this artwork is narrower and taller.
 * The side margin is pure black and so is the clip's own background — measured
 * (0,0,0) in both the letterbox and behind the mascot — so the padding is
 * genuinely invisible. (The processing source is NOT pure black there, which is
 * why its pad boundary can be faintly visible; this one has no such seam.)
 *
 * No loop treatment here: RetryTransitionScreen plays it once and caps playback,
 * so the first/last frame mismatch that the processing loop had to solve never
 * shows.
 *
 * To regenerate after editing the source:
 *   ffmpeg -i Robot_loading_animation_design_202608081030.mp4 \
 *     -vf "fps=24,crop=608:952:36:144,pad=828:1012:110:30:black,\
 *          scale=1080:1320,format=yuv420p" \
 *     -an -c:v libx264 -crf 18 -preset slow Robot_retry_framed.mp4
 */
import retryVideoUrl from '../../Robot_retry_framed.mp4';

export default retryVideoUrl;
