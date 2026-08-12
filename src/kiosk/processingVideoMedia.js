/**
 * Processing / “creating your transformation” clip inside the portrait frame.
 *
 * Robot_loading_seamless.mp4 is a build of Robot_animating_loading_screen_*.mp4
 * with two changes, both of which the raw source needs:
 *
 * 1. REFRAMED to 1080x1320 — the frame's own ratio. The source is 720x1280 with
 *    107px of black above the robot and 196px below the text, so dropping it in
 *    with object-fit:contain letterboxed it to 69% of the frame width. Cropping
 *    those black margins and padding to 1080x1320 lets object-fit:cover fill the
 *    frame edge to edge: content goes from 69%->84% of the width and 76%->94% of
 *    the height, and nothing is clipped (measured margins 39/38/85/85px).
 *
 * 2. DISSOLVED LOOP — the source drifts as it plays: by its last frame the robot
 *    sits ~0.9% larger than at its first, so a plain `loop` snapped scale back
 *    every 8s, which read as a zoom-then-jump. Measured, that seam was 8.35 mean
 *    / 18.2% of pixels against 1.16 median for a natural one-frame step — about
 *    4x normal motion, landing all at once.
 *
 *    The fix dissolves the trailing 12 frames (0.5s) onto the opening 12 rather
 *    than cutting: the output is source frames 0-179, with frames 180-191 faded
 *    out over the top of frames 0-11. The wrap then lands on 179->180, a real
 *    consecutive pair, so it steps like ordinary motion — seam 0.63 mean / 0.1%,
 *    below the clip's own median step, and the scale snap drops from 0.104 to
 *    0.005 (typical frame-to-frame drift is 0.025). Costs 0.5s (8s -> 7.5s).
 *
 *    A longer dissolve is not better: the fade has a fixed mismatch to absorb,
 *    so fewer frames each carry more of it. K=8 measured worse on every axis
 *    (seam 0.71, scale snap 0.104, and 12.3% peak sharpness loss vs 11.0%).
 *
 * The command below reproduces the checked-in file exactly — keep it that way.
 * The previous recipe here described an xfade build that the shipped file did
 * not actually contain, which is how the jump went unnoticed. If the source is
 * ever re-exported with a genuinely matching first/last frame, drop the
 * split/trim/fade/overlay stages and keep only the crop/pad/scale.
 *
 * To regenerate after editing the source:
 *   ffmpeg -i Robot_animating_loading_screen_202608071508.mp4 -filter_complex \
 *     "[0:v]fps=24,crop=720:977:0:107,pad=848:1037:64:30:black,scale=1080:1320,split[m1][m2]; \
 *      [m1]trim=start_frame=0:end_frame=180,setpts=PTS-STARTPTS,fps=24[base]; \
 *      [m2]trim=start_frame=180:end_frame=192,setpts=PTS-STARTPTS,fps=24, \
 *          format=yuva420p,fade=t=out:st=0:d=0.5:alpha=1[tail]; \
 *      [base][tail]overlay=eof_action=pass,format=yuv420p[v]" \
 *     -map "[v]" -an -c:v libx264 -crf 18 -preset slow Robot_loading_seamless.mp4
 */
import processingVideoUrl from '../../Robot_loading_seamless.mp4';

export default processingVideoUrl;
