/**
 * "Going back for another go" clip, shown between a finished/failed attempt and
 * the camera reopening.
 *
 * Unlike the processing clip this one is NOT reframed to the portrait frame's
 * 1080x1320. It plays full-bleed instead, and the source already fits that
 * almost exactly: 720x1280 is a ratio of 0.5625 against the kiosk window's
 * 685x1214 = 0.564, so object-fit: cover crops well under a percent. The
 * source's black margins (36px left / 76px right / 144px top / 186px bottom)
 * disappear into the app's dark background rather than reading as letterboxing,
 * which is why the crop/pad/scale dance in processingVideoMedia.js is not
 * needed here.
 */
import retryVideoUrl from '../../Robot_loading_animation_design_202608081030.mp4';

export default retryVideoUrl;
