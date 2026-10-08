export interface HtmlTemplateAsset { key: string; kind: "image" | "video" | "object"; url: string; required: boolean }
export interface HtmlTemplate {
  id: string; profileId: string; name: string; description: string; tags: string[];
  html: string; css: string; js: string; durationSec: number;
  assets: HtmlTemplateAsset[]; aiEnabled: boolean;
  audioCues?: Array<{ at: number; sound: "whoosh" | "impact" | "tick" | "rise" | "press-paper" | "press-impact" | "press-marker" | "press-whoosh" | "press-pencil" | "press-rise" | "press-exit"; gain: number }>;
}
export interface TemplateLayerEdit { text?: string; color?: string; fontSize?: number; x?: number; y?: number; scaleX?: number; scaleY?: number; hidden?: boolean }
