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
 * 2. CROSSFADED LOOP — the source's last frame differs from its first by 9.64
 *    mean / 9.1% of pixels, against 0.2-1.9 for a natural one-frame step, so a
 *    plain `loop` jumps every 8s. The final 1.5s is dissolved back onto the
 *    opening 1.5s, which drops the seam to 3.29 / 1.9%. Costs 1.5s of runtime
 *    (8s -> 6.5s). If the source is ever re-exported with a genuinely matching
 *    first/last frame, drop the trim/xfade stages and keep only the crop/pad.
 *
 * To regenerate after editing the source:
 *   ffmpeg -i Robot_animating_loading_screen_202608071508.mp4 -filter_complex \
 *     "[0:v]trim=start=1.5,setpts=PTS-STARTPTS,fps=24[a]; \
 *      [0:v]trim=start=0:end=1.5,setpts=PTS-STARTPTS,fps=24[b]; \
 *      [a][b]xfade=transition=fade:duration=1.5:offset=5[x]; \
 *      [x]crop=720:977:0:107,pad=848:1037:64:30:black,scale=1080:1320,format=yuv420p[v]" \
 *     -map "[v]" -an -c:v libx264 -crf 20 -preset slow Robot_loading_seamless.mp4
 */
import processingVideoUrl from '../../Robot_loading_seamless.mp4';

export default processingVideoUrl;
