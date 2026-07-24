"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SettingsShell } from "@/components/settings/settings-shell";

type Pref = { id: string; title: string; description: string; on: boolean };

const INITIAL: Pref[] = [
  {
    id: "render",
    title: "Render complete",
    description: "Email when a 1080p export finishes or fails.",
    on: true,
  },
  {
    id: "quote",
    title: "Quote ready",
    description: "Notify when research quotes need approval.",
    on: true,
  },
  {
    id: "agent",
    title: "Editor Agent",
    description: "Desktop toast when Agent finishes a multi-step edit.",
    on: true,
  },
  {
    id: "product",
    title: "Product updates",
    description: "Occasional notes on new templates and motion presets.",
    on: false,
  },
  {
    id: "billing",
    title: "Billing alerts",
    description: "Low credits and renewal reminders (when billing ships).",
    on: false,
  },
];

export function NotificationsSettings() {
  const [prefs, setPrefs] = useState(INITIAL);

  return (
    <SettingsShell
      title="Notification settings"
      description="Choose how SkyClip keeps you in the loop."
    >
      <section className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {prefs.map((pref) => (
          <div key={pref.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor={pref.id} className="text-sm font-medium">
                {pref.title}
              </Label>
              <p className="text-xs text-muted-foreground">{pref.description}</p>
            </div>
            <Switch
              id={pref.id}
              checked={pref.on}
              onCheckedChange={(on) =>
                setPrefs((prev) => prev.map((p) => (p.id === pref.id ? { ...p, on } : p)))
              }
            />
          </div>
        ))}
      </section>
      <div className="flex justify-end">
        <Button
          className="rounded-full"
          onClick={() =>
            toast.success("Preferences saved", {
              description: "Stored in this browser until account sync lands.",
            })
          }
        >
          Save preferences
        </Button>
      </div>
    </SettingsShell>
  );
}
