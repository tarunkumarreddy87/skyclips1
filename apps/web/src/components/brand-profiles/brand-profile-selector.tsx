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
  "inline-flex h-8 max-w-[220px] items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-xs font-semibold tracking-wide text-zinc-200 transition-all hover:border-white/16 hover:bg-white/[0.07] hover:text-white";

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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={TRIGGER}
                aria-label="Brand profile"
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
              <span className="font-medium text-muted-foreground">Brand profile</span>
            )}
            <ChevronDown className="size-3 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="z-[100] w-[268px] rounded-xl border-white/10 bg-[#1c1c1e] p-1.5 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]"
          >
            <DropdownMenuGroup>
              {profiles.map((p) => {
                const selected = p.id === active?.id;
                return (
                  <DropdownMenuItem
                    key={p.id}
                    className={cn(
                      "group flex cursor-pointer items-center gap-2.5 rounded-lg py-2.5 pl-2 pr-1 text-white outline-none data-highlighted:bg-white/8",
                      selected && "bg-white/6",
                    )}
                    onClick={() => setActiveProfileId(p.id)}
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
                      className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
                      aria-label={`Edit ${p.name}`}
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
            <DropdownMenuSeparator className="my-1.5 bg-white/10" />
            <DropdownMenuItem
              className="gap-2 rounded-lg py-2.5 text-sm font-medium text-white data-highlighted:bg-white/8"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4 text-zinc-300" />
              New brand profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CreateBrandProfileDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
