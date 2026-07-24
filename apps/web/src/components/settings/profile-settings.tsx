"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsShell } from "@/components/settings/settings-shell";

export function ProfileSettings() {
  const [name, setName] = useState("Tarun Reddy");
  const [email, setEmail] = useState("tarun@example.com");
  const [handle, setHandle] = useState("tarun");

  return (
    <SettingsShell
      title="Profile settings"
      description="Your public identity across workspaces and exports."
    >
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar className="size-16">
            <AvatarFallback className="bg-[#3B82F6] text-lg font-semibold text-white">
              TR
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() =>
              toast.message("Avatar upload coming soon", {
                description: "Profile photo storage ships with account auth.",
              })
            }
          >
            Change photo
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="handle">Handle</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                @
              </span>
              <Input
                id="handle"
                className="pl-7"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/\s/g, "").toLowerCase())}
              />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            className="rounded-full"
            onClick={() =>
              toast.success("Profile saved locally", {
                description: "Sync to account API when auth is wired.",
              })
            }
          >
            Save profile
          </Button>
        </div>
      </section>
    </SettingsShell>
  );
}
