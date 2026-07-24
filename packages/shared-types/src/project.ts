export type ProjectStatus =
  | "draft"
  | "quoted"
  | "approved"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type EntryPath = "prompt_first" | "script_first";

export type FormatMode = "documentary" | "listicle";

export interface Project {
  id: string;
  userId: string;
  title: string;
  status: ProjectStatus;
  entryPath: EntryPath;
  formatMode: FormatMode;
  createdAt: string;
  updatedAt: string;
}
