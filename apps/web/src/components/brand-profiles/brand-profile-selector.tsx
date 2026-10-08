"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandProfileAvatar } from "@/components/brand-profiles/brand-profile-avatar";
import { CreateBrandProfileDialog } from "@/components/brand-profiles/create-brand-profile-dialog";
import { useBrandProfileStore } from "@/lib/brand-profiles";
import { cn } from "@/lib/utils";

const TRIGGER =
  "inline-flex h-8 max-w-[220px] items-center justify-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 text-xs font-semibold tracking-wide text-foreground transition-all hover:border-foreground/25 hover:bg-accent";

export function BrandProfileSelector({ className }: { className?: string }) {
  const router = useRouter();
  const profiles = useBrandProfileStore((s) => s.profiles);
  const activeProfileId = useBrandProfileStore((s) => s.activeProfileId);
  const setActiveProfileId = useBrandProfileStore((s) => s.setActiveProfileId);
  const active = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className={cn("flex items-center gap-1.5", className)}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={TRIGGER}
                aria-label="Channel profile"
              />
            }
          >
            {active ? (
              <>
                <BrandProfileAvatar
                  name={active.name}
                  hue={active.avatarHue}
                  avatarUrl={active.avatarUrl}
                />
                <span className="max-w-[120px] truncate uppercase">{active.name}</span>
              </>
            ) : (
              <span className="font-medium text-muted-foreground">Channel profile</span>
            )}
            <ChevronDown className="size-3 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="z-[100] w-[268px] rounded-xl border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
          >
            <DropdownMenuGroup>
              {profiles.map((p) => {
                const selected = p.id === active?.id;
                return (
                  <DropdownMenuItem
                    key={p.id}
                    className={cn(
                      "group flex cursor-pointer items-center gap-2.5 rounded-lg py-2.5 pl-2 pr-1 text-popover-foreground outline-none data-highlighted:bg-accent",
                      selected && "bg-accent",
                    )}
                    onSelect={() => setActiveProfileId(p.id)}
                  >
                    <BrandProfileAvatar
                      name={p.name}
                      hue={p.avatarHue}
                      avatarUrl={p.avatarUrl}
                      size="md"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      aria-label={`Edit ${p.name}`}
                      onMouseEnter={() => router.prefetch(`/brand-profiles/${p.id}`)}
                      onFocus={() => router.prefetch(`/brand-profiles/${p.id}`)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/brand-profiles/${p.id}`);
                      }}
                    >
                      <Settings2 className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-1.5 bg-border" />
            <DropdownMenuItem
              className="gap-2 rounded-lg py-2.5 text-sm font-medium text-popover-foreground data-highlighted:bg-accent"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4 text-muted-foreground" />
              New channel profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {createOpen && <CreateBrandProfileDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </>
  );
}
