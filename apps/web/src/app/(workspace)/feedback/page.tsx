import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground">Tell us what to improve in the production workspace.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback">Message</Label>
            <Textarea id="feedback" placeholder="What worked well? What felt confusing?" rows={5} />
          </div>
          <Button>Submit (mock)</Button>
        </CardContent>
      </Card>
    </div>
  );
}
