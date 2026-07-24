import type { Project } from "./project";
import type { Quote } from "./quote";

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
} from "./motion-templates";
export {
  MOTION_TEMPLATE_IDS,
  MOTION_TEMPLATE_CATALOG,
  getTemplateMeta,
  templatesByCategory,
  shippedTemplates,
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
export type { OverlayChromeTheme, ChapterVariant, StyleBag } from "./overlay-chrome";
export {
  resolveChapterVariant,
  chapterTitleChromeStyle,
  subscribeCtaChromeStyle,
  cssColorFromThemeToken,
  overlayChromeFromPalette,
} from "./overlay-chrome";
