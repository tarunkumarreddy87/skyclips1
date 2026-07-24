import type { ProjectStatus } from "@hanuman/shared-types";

/** Route for a project based on API lifecycle status. */
export function projectHref(status: ProjectStatus | string, id: string): string {
  switch (status) {
    case "draft":
    case "quoted":
      return `/projects/${id}/quote`;
    case "approved":
    case "queued":
    case "running":
    case "failed":
    case "completed":
      // Stay on queue for completed so users see timeline-ready + open editor CTA
      // (MP4 export still happens from the editor).
      return `/projects/${id}/queue`;
    default:
      return `/projects/${id}/queue`;
  }
}

export function useMockProjectsList(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_PROJECTS === "true";
}
