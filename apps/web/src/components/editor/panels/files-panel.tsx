"use client";

import { useState } from "react";
import Image from "next/image";
import { useEditorStore } from "@/lib/editor/store";
import { resolveMediaUrl } from "@/lib/editor/media-url";

export function FilesPanel() {
  const assets = useEditorStore((s) => s.assets);
  const [view, setView] = useState<"grid" | "list">("list");

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-zinc-500">{assets.length} project assets</span>
        <div className="flex gap-2 text-[10px]">
          <button
            type="button"
            className={view === "list" ? "text-white" : "text-zinc-600"}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            type="button"
            className={view === "grid" ? "text-white" : "text-zinc-600"}
            onClick={() => setView("grid")}
          >
            Grid
          </button>
        </div>
      </div>

      <div className={view === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-1"}>
        {assets.map((asset) => {
          const thumb =
            resolveMediaUrl(asset.thumbnailUrl || "") ||
            (asset.mediaType === "image" ? resolveMediaUrl(asset.url) : "") ||
            "";
          return (
            <div
              key={asset.id}
              className="flex items-center gap-2 rounded-lg border border-white/10 p-1.5 hover:bg-white/5"
            >
              {thumb ? (
                <Image
                  src={thumb}
                  alt=""
                  width={32}
                  height={20}
                  className="rounded object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex size-8 items-center justify-center rounded bg-white/5 text-[9px] uppercase text-zinc-600">
                  {asset.mediaType.slice(0, 3)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] text-zinc-300">{asset.label}</p>
                <p className="text-[9px] text-zinc-600">{asset.sourceType}</p>
              </div>
            </div>
          );
        })}
        {assets.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-600">No assets in this project yet.</p>
        ) : null}
      </div>
    </div>
  );
}
