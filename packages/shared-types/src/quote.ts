import type { FormatMode } from "./project";

export type QuoteStatus = "draft" | "pending_approval" | "approved" | "superseded";

export interface QuoteSectionOutline {
  title: string;
  summary: string;
}

export interface Quote {
  id: string;
  projectId: string;
  version: number;
  isActive: boolean;
  formatMode: FormatMode;
  durationSec: number;
  language: string;
  voiceId: string;
  modelId: string;
  brandProfileId: string;
  sectionOutline: QuoteSectionOutline[];
  creditEstimate: number;
  resolution: string;
  aspectRatio: string;
  status: QuoteStatus;
  approvedAt: string | null;
  createdAt: string;
  warnings?: string[];
}
