"use client";

import { toast } from "sonner";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsShell } from "@/components/settings/settings-shell";

const WORKSPACES = [
  { id: "1", name: "My Workspace", members: 1, role: "Owner", current: true },
  { id: "2", name: "Creativly Team", members: 4, role: "Editor", current: false },
];

export function WorkspacesSettings() {
  return (
    <SettingsShell
      title="Workspaces"
      description="Switch teams and invite collaborators when multi-seat billing ships."
    >
      <div className="space-y-3">
        {WORKSPACES.map((ws) => (
          <div
            key={ws.id}
            className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#2a1f4a] to-[#15202b] text-sm font-semibold text-white">
                {ws.name.slice(0, 1)}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{ws.name}</p>
                  {ws.current ? (
                    <Badge variant="secondary" className="rounded-full text-[10px]">
                      Current
                    </Badge>
                  ) : null}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3" />
                  {ws.members} member{ws.members === 1 ? "" : "s"} · {ws.role}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={ws.current}
              onClick={() =>
                toast.message("Switch workspace", {
                  description: "Multi-workspace handoff is preview-only for now.",
                })
              }
            >
              {ws.current ? "Active" : "Switch"}
            </Button>
          </div>
        ))}
      </div>
      <Button
        className="rounded-full"
        onClick={() =>
          toast.message("New team", {
            description: "Team creation ships with billing seats.",
          })
        }
      >
        <Plus data-icon="inline-start" />
        New Team
      </Button>
    </SettingsShell>
  );
}
