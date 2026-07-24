import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const docLinks = [
  { title: "Architecture overview", href: "/docs/architecture/overview", external: false },
  { title: "Pipeline stages", href: "/docs/architecture/pipeline-stages", external: false },
  { title: "Timeline manifest", href: "/docs/architecture/timeline-manifest", external: false },
  { title: "Local development", href: "/docs/runbooks/local-dev", external: false },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
        <p className="text-sm text-muted-foreground">Product and engineering references for SkyClip.</p>
      </div>
      <div className="space-y-3">
        {docLinks.map((doc) => (
          <Card key={doc.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">{doc.title}</CardTitle>
              <Button variant="ghost" size="sm" render={<Link href={doc.href} />}>
                Open
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Repository documentation (static links — wire to docs site later).
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
