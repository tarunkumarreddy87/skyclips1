"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Replace, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { useEditorStore } from "@/lib/editor/store";
import {
  requestMediaUploadUrl,
  searchStockPhotos,
  uploadFileToPresignedUrl,
  type StockPhotoItem,
} from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/editor/types";
import { resolveMediaUrl } from "@/lib/editor/media-url";

interface MediaBrowserProps {
  mode?: "browse" | "replace";
  itemId?: string;
}

function stockToAsset(item: StockPhotoItem): Asset {
  return {
    id: item.id,
    mediaType: "image",
    sourceType: "stock",
    label: item.label,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    metadata: item.photographer
      ? { photographer: item.photographer, source: item.source }
      : { source: item.source },
  };
}

export function MediaBrowser({ mode = "browse", itemId }: MediaBrowserProps) {
  const projectId = useEditorStore((s) => s.project.id);
  const query = useEditorStore((s) => s.ui.mediaSearchQuery);
  const setMediaSearch = useEditorStore((s) => s.setMediaSearch);
  const sourceTab = useEditorStore((s) => s.ui.mediaSourceTab);
  const setMediaSourceTab = useEditorStore((s) => s.setMediaSourceTab);
  const selectedItemId = useEditorStore((s) => s.ui.selectedItemId);
  const replaceMedia = useEditorStore((s) => s.replaceMedia);
  const addAssetFromUrl = useEditorStore((s) => s.addAssetFromUrl);
  const addBroll = useEditorStore((s) => s.addBroll);
  const assets = useEditorStore((s) => s.assets);
  const [urlInput, setUrlInput] = useState("");
  const [stockItems, setStockItems] = useState<Asset[]>([]);
  const [stockStatus, setStockStatus] = useState<"idle" | "loading" | "ready" | "error" | "unconfigured">(
    "idle",
  );
  const [stockError, setStockError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const targetItemId = itemId ?? selectedItemId;

  useEffect(() => {
    if (sourceTab !== "stock") return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setStockStatus("loading");
      setStockError(null);
      try {
        const res = await searchStockPhotos(query || "documentary history", 24);
        if (cancelled) return;
        if (!res.configured) {
          setStockItems([]);
          setStockStatus("unconfigured");
          return;
        }
        setStockItems(res.items.map(stockToAsset));
        setStockStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStockItems([]);
        setStockStatus("error");
        setStockError(e instanceof Error ? e.message : "Stock search failed");
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, sourceTab]);

  const filtered = useMemo(
    () =>
      assets.filter((a) => {
        if (a.mediaType === "audio") return false;
        const matchesQuery = !query || a.label.toLowerCase().includes(query.toLowerCase());
        const matchesTab =
          sourceTab === "local"
            ? a.sourceType === "local" || a.sourceType === "url"
            : sourceTab === "url"
              ? true
              : a.sourceType === "stock" || a.sourceType === "licensed";
        return matchesQuery && (sourceTab === "url" ? a.sourceType === "url" || a.sourceType === "local" : matchesTab);
      }),
    [assets, query, sourceTab],
  );

  const handleUrlSubmit = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (mode === "replace" && targetItemId) {
      addAssetFromUrl(url, targetItemId);
    } else {
      addBroll({ url, label: "Image", durationMs: 4000 });
    }
    setUrlInput("");
  };

  const handleLocalFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (!projectId) {
      toast.error("Project not loaded");
      return;
    }
    setUploading(true);
    try {
      const { uploadUrl, s3Key, downloadUrl } = await requestMediaUploadUrl(
        projectId,
        file.name,
        file.type || "image/jpeg",
      );
      await uploadFileToPresignedUrl(uploadUrl, file);
      const previewUrl = downloadUrl || uploadUrl;
      const label = file.name.replace(/\.[^.]+$/, "") || "Image";
      if (mode === "replace" && targetItemId) {
        addAssetFromUrl(previewUrl, targetItemId, { sourceKey: s3Key, label });
      } else {
        addBroll({
          url: previewUrl,
          label,
          durationMs: 4000,
          sourceKey: s3Key,
          sourceType: "local",
        });
      }
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const gridItems: Asset[] = sourceTab === "stock" ? stockItems : filtered;

  const applyAsset = (asset: Asset) => {
    if (mode === "replace" && targetItemId) {
      const state = useEditorStore.getState();
      if (!state.assets.some((a) => a.id === asset.id)) {
        useEditorStore.setState({ assets: [...state.assets, asset] });
      }
      replaceMedia(targetItemId, asset.id);
      return;
    }
    addBroll({ url: asset.url, label: asset.label, durationMs: 4000, sourceType: asset.sourceType });
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
        <Input
          value={query}
          onChange={(e) => setMediaSearch(e.target.value)}
          placeholder={mode === "replace" ? "Search to replace…" : "Search Pexels…"}
          className="h-8 border-white/10 bg-white/5 pl-8 text-xs text-white placeholder:text-zinc-600"
        />
      </div>

      <Tabs value={sourceTab} onValueChange={(v) => v && setMediaSourceTab(v as typeof sourceTab)}>
        <TabsList className="h-8 w-full bg-white/5">
          <TabsTrigger value="stock" className="flex-1 text-[10px]">
            Stock
          </TabsTrigger>
          <TabsTrigger value="local" className="flex-1 text-[10px]">
            Upload
          </TabsTrigger>
          <TabsTrigger value="url" className="flex-1 text-[10px]">
            URL
          </TabsTrigger>
        </TabsList>
        <TabsContent value="url" className="mt-2 space-y-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste image URL…"
            className="h-8 border-white/10 bg-white/5 text-xs"
            onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
          />
          <Button size="sm" className="h-7 w-full text-xs" disabled={!urlInput.trim()} onClick={handleUrlSubmit}>
            {mode === "replace" ? "Use URL" : "Add image"}
          </Button>
        </TabsContent>
        <TabsContent value="local" className="mt-2 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void handleLocalFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-white/15 px-4 py-6 text-xs text-zinc-400 transition-colors hover:border-white/30 hover:bg-white/[0.03] hover:text-zinc-200 disabled:opacity-50",
            )}
          >
            <Upload className="size-5" />
            {uploading ? "Uploading to cloud…" : "Upload image"}
          </button>
          <p className="text-[10px] text-zinc-500">Saved to project storage so renders stay durable.</p>
        </TabsContent>
      </Tabs>

      {sourceTab === "stock" && stockStatus === "loading" ? (
        <p className="text-[10px] text-zinc-500">Searching Pexels…</p>
      ) : null}
      {sourceTab === "stock" && stockStatus === "unconfigured" ? (
        <p className="text-[10px] text-amber-400/90">
          Pexels API key not configured on the API. Set PEXELS_API_KEY to enable live stock.
        </p>
      ) : null}
      {sourceTab === "stock" && stockStatus === "error" ? (
        <p className="text-[10px] text-red-400/90">{stockError}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {gridItems.map((asset) => (
          <div
            key={asset.id}
            className="group overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-colors hover:border-white/20"
          >
            <div className="relative aspect-video bg-zinc-800">
              {(() => {
                const thumb =
                  resolveMediaUrl(asset.thumbnailUrl || "") ||
                  (asset.mediaType === "image" ? resolveMediaUrl(asset.url) : "") ||
                  "";
                if (!thumb) return null;
                if (asset.mediaType === "video" || /\.(mp4|webm|mov)(\?|#|$)/i.test(thumb)) {
                  return (
                    <video
                      src={thumb}
                      muted
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 size-full object-cover"
                    />
                  );
                }
                return (
                  <Image src={thumb} alt={asset.label} fill className="object-cover" unoptimized />
                );
              })()}
            </div>
            <div className="p-1.5">
              <p className="truncate text-[10px] text-zinc-400">{asset.label}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 h-6 w-full gap-1 text-[10px] text-blue-400 hover:text-blue-300"
                onClick={() => applyAsset(asset)}
              >
                {mode === "replace" && targetItemId ? (
                  <>
                    <Replace className="size-3" />
                    Replace
                  </>
                ) : (
                  <>
                    <ImagePlus className="size-3" />
                    Add
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
