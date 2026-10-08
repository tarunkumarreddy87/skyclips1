"use client";

import {
  brandProfiles,
  getBrandProfile,
  voices,
  type FormatMode,
  type MockProject,
  type ModelId,
  type ReasoningLevel,
} from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { FileText, Mic } from "lucide-react";

interface QuoteStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: MockProject;
  onUpdate: (updates: Partial<MockProject>) => void;
  onApprove: () => void;
  attachmentLabel?: string | null;
}

export function QuoteStatementDialog({
  open,
  onOpenChange,
  project,
  onUpdate,
  onApprove,
  attachmentLabel,
}: QuoteStatementDialogProps) {
  const brand = getBrandProfile(project.brandProfileId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Quote Statement</DialogTitle>
          <DialogDescription>
            Review production settings and estimated credits before generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quote-title">Title</Label>
            <Input
              id="quote-title"
              value={project.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={project.format} onValueChange={(v) => onUpdate({ format: v as FormatMode })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="documentary">Documentary</SelectItem>
                  <SelectItem value="listicle">Listicle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <Select
                value={String(project.durationSec)}
                onValueChange={(v) => onUpdate({ durationSec: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 min</SelectItem>
                  <SelectItem value="180">3 min</SelectItem>
                  <SelectItem value="300">5 min</SelectItem>
                  <SelectItem value="420">7 min</SelectItem>
                  <SelectItem value="600">10 min</SelectItem>
                  <SelectItem value="900">15 min</SelectItem>
                  <SelectItem value="1800">30 min</SelectItem>
                  <SelectItem value="3600">60 min</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={project.language} onValueChange={(v) => v && onUpdate({ language: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                  <SelectItem value="te">Telugu</SelectItem>
                  <SelectItem value="ta">Tamil</SelectItem>
                  <SelectItem value="kn">Kannada</SelectItem>
                  <SelectItem value="ml">Malayalam</SelectItem>
                  <SelectItem value="bn">Bengali</SelectItem>
                  <SelectItem value="mr">Marathi</SelectItem>
                  <SelectItem value="gu">Gujarati</SelectItem>
                  <SelectItem value="pa">Punjabi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={project.model} onValueChange={(v) => onUpdate({ model: v as ModelId })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skyclip-v1">SkyClip v1</SelectItem>
                  <SelectItem value="skyclip-v1-pro">SkyClip v1 Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Brand profile</Label>
              <Select value={project.brandProfileId} onValueChange={(v) => v && onUpdate({ brandProfileId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {brandProfiles.map((bp) => (
                    <SelectItem key={bp.id} value={bp.id}>
                      {bp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Voice</Label>
              <Select value={project.voice} onValueChange={(v) => v && onUpdate({ voice: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(attachmentLabel || project.hasCustomScript || project.hasCustomVoiceover) && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="mb-2 font-medium">Attachments</p>
              {attachmentLabel && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {attachmentLabel}
                </p>
              )}
              {project.hasCustomVoiceover && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mic className="h-4 w-4" />
                  Custom voiceover attached
                </p>
              )}
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div>
              <p className="text-sm text-muted-foreground">Credits used when generation starts</p>
              <p className="text-2xl font-semibold">{project.estimatedCredits}</p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>{brand?.name ?? "Default"} brand</p>
              <p>{Math.round(project.durationSec / 60)} min · {project.format}</p>
            </div>
          </div>

          <Button className="w-full" size="lg" onClick={onApprove}>
            Approve and continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
