import type { Project } from "./project";
import type { Quote } from "./quote";
export type { MotionScene, MotionSceneLayer, MotionKeyframe } from "./motion-scene";
export type { ClipVisualEffects } from "./visual-effects";
export { VIDEO_FILTERS, VIDEO_EFFECTS, clipVisualFilter } from "./visual-effects";

export interface Brief {
  id: string;
  projectId: string;
  promptText: string | null;
  scriptText: string | null;
  scriptS3Key: string | null;
  targetDurationSec: number | null;
  language: string;
  createdAt: string;
}

export interface ProjectDetail extends Project {
  brief: Brief | null;
  activeQuote: Quote | null;
}

export interface ProjectList {
  items: Project[];
  total: number;
}

export type { Project, ProjectStatus, EntryPath, FormatMode } from "./project";
export type { Quote, QuoteStatus, QuoteSectionOutline } from "./quote";
export type { ProgressEvent, ProgressStageStatus } from "./progress";
export type {
  ThemeId,
  ThemePreset,
  ThemePalette,
  ThemeVisualGrade,
  BrandProfile,
} from "./themes";
export {
  THEME_PRESETS,
  THEME_LIST,
  BRAND_PROFILES,
  resolveThemeId,
  getTheme,
  inferThemeFromText,
} from "./themes";
export type {
  CaptionStyleId,
  CaptionStyleMeta,
  CaptionWordTiming,
} from "./caption-style";
export {
  CAPTION_STYLE_IDS,
  CAPTION_STYLE_META,
  DEFAULT_CAPTION_STYLE,
  resolveCaptionStyleId,
  estimateWordTimings,
  wordSpeakWeight,
  wordsForCaption,
  activeWordIndex,
} from "./caption-style";
export type {
  MotionTemplateCategory,
  MotionTemplateMeta,
  TemplateId,
  EditorialARollId,
  EditorialARollTemplate,
  MotionComponentId,
} from "./motion-templates";
export {
  MOTION_TEMPLATE_IDS,
  EDITORIAL_A_ROLL_IDS,
  isEditorialARollId,
  MOTION_TEMPLATE_CATALOG,
  MOTION_GRAPHIC_MANIFEST_TYPES,
  getTemplateMeta,
  getTemplateByManifestType,
  templatesByCategory,
  shippedTemplates,
  shippedMotionGraphicTemplates,
  defaultSlotsForTemplate,
  isMotionGraphicManifestType,
  stillClipKenBurnsAnimation,
  stillClipParallaxPanAnimation,
} from "./motion-templates";
export {
  wrapCaptionLines,
  splitNarrationForTts,
  chunkNarrationForCaptions,
  captionsFromTtsPieces,
  captionsForSectionWindow,
} from "./caption-chunks";
export type { CaptionChunk, TtsPieceClock } from "./caption-chunks";
export type { TimelineManifestV1, VideoClip, BrollClip, AudioClip, MusicClip, CaptionClip, Overlay, Transition, TransitionType, ElementTransform, ElementAnimation, AnimationPreset, LoopPreset, AnimationEdge, ParallaxPanParams, ParallaxDirection, GraphicObject, GraphicKeyframe, TextStyle } from "./timeline";
export type { OverlayChromeTheme, ChapterVariant, StyleBag } from "./overlay-chrome";
export { DOCUMENTARY_LAYOUTS } from "./motion-templates";
export type { DocumentaryLayout } from "./motion-templates";
export type { HtmlTemplate, HtmlTemplateAsset, TemplateLayerEdit } from "./html-template";
export {
  resolveChapterVariant,
  chapterTitleChromeStyle,
  subscribeCtaChromeStyle,
  cssColorFromThemeToken,
  overlayChromeFromPalette,
} from "./overlay-chrome";

export { threeSceneSchema, threeSceneDataSchema, threeObjectPose, createThreePreset } from "./three-scene";
export type { ThreeScene, ThreeObject, ThreeVector } from "./three-scene";
