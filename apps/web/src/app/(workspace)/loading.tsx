import { Loader2 } from "lucide-react";
export default function WorkspaceLoading() {
  return <div role="status" aria-label="Loading page" className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
}
