/**
 * Web-safe entry for @remotion/player (no registerRoot / CLI / Lambda).
 * Import from `@hanuman/remotion-renderer/preview` in Next.js client code only.
 */

export { TimelineComposition } from "./compositions/TimelineComposition";
export { transitionSeriesDurationFrames, mapEditorSecToExportSec } from "./lib/timing";
export {
  captionBoxStyle,
  DEFAULT_CAPTION_TRANSFORM,
} from "./components/CaptionsOverlays";
export type {
  TimelineCompositionProps,
  TimelineManifestV1,
} from "./lib/types";
