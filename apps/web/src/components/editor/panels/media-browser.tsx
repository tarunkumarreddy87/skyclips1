"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Replace, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { useEditorStore } from "@/lib/editor/store";
import {
  deriveMediaProxies,
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
import { probeUploadDuration } from "@/lib/editor/probe-upload";

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
      addBroll({ url, label: "Media", durationMs: 4000 });
    }
    setUrlInput("");
  };

  const handleLocalFile = async (file: File | undefined) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("Upload an image or video file");
      return;
    }
    if (!projectId) {
      toast.error("Project not loaded");
      return;
    }
    setUploading(true);
    try {
      const durationMs = await probeUploadDuration(file);
      const mediaType = file.type.startsWith("video/") ? "video" as const : "image" as const;
      const { uploadUrl, s3Key, downloadUrl } = await requestMediaUploadUrl(
        projectId,
        file.name,
        file.type || (isVideo ? "video/mp4" : "image/jpeg"),
      );
      await uploadFileToPresignedUrl(uploadUrl, file);
      const previewUrl = downloadUrl || uploadUrl;
      const label = file.name.replace(/\.[^.]+$/, "") || (isVideo ? "Video" : "Image");

      let proxyMeta: Record<string, string> | undefined;
      if (isVideo) {
        try {
          const derived = await deriveMediaProxies(projectId, s3Key);
          proxyMeta = {
            proxyKey: derived.proxyKey,
            posterKey: derived.posterKey,
            proxyUrl: derived.proxyUrl,
            posterUrl: derived.posterUrl,
          };
          if (derived.spriteKey) proxyMeta.spriteKey = derived.spriteKey;
          if (derived.spriteUrl) proxyMeta.spriteUrl = derived.spriteUrl;
        } catch (err) {
          console.warn("[media-browser] proxy derive failed; scheduling backfill", err);
          toast.message("Uploaded — preview proxy will generate shortly");
        }
      }

      let createdAssetId: string | null = null;
      if (mode === "replace" && targetItemId) {
        addAssetFromUrl(previewUrl, targetItemId, {
          sourceKey: s3Key,
          label,
          proxyMeta,
        });
        const match = useEditorStore
          .getState()
          .assets.find((a) => a.metadata?.sourceKey === s3Key);
        createdAssetId = match?.id ?? null;
      } else {
        addBroll({
          url: previewUrl,
          label,
          durationMs: isVideo ? 8000 : 4000,
          sourceKey: s3Key,
          sourceType: "local",
          mediaType: isVideo ? "video" : "image",
          thumbnailUrl: proxyMeta?.posterUrl,
          metadata: proxyMeta,
        });
        const match = useEditorStore
          .getState()
          .assets.find((a) => a.metadata?.sourceKey === s3Key);
        createdAssetId = match?.id ?? null;
      }

      // If derive failed (or raced), backfill once in background.
      if (isVideo && !proxyMeta && createdAssetId) {
        const assetId = createdAssetId;
        void deriveMediaProxies(projectId, s3Key)
          .then((derived) => {
            useEditorStore.getState().patchAssetProxyMeta(assetId, {
              proxyKey: derived.proxyKey,
              posterKey: derived.posterKey,
              spriteKey: derived.spriteKey ?? undefined,
              proxyUrl: derived.proxyUrl,
              posterUrl: derived.posterUrl,
              spriteUrl: derived.spriteUrl ?? undefined,
            });
          })
          .catch((e) => console.warn("[media-browser] proxy backfill failed", e));
      }

      toast.success(isVideo ? "Video uploaded" : "Image uploaded");
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
    if (asset.mediaType === "audio") return;
    addBroll({ url: asset.url, label: asset.label, durationMs: asset.durationMs ?? 4000, mediaType: asset.mediaType, sourceType: asset.sourceType, sourceKey: asset.metadata?.sourceKey });
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
            placeholder="Paste image or video URL…"
            className="h-8 border-white/10 bg-white/5 text-xs"
            onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
          />
          <Button size="sm" className="h-7 w-full text-xs" disabled={!urlInput.trim()} onClick={handleUrlSubmit}>
            {mode === "replace" ? "Use URL" : "Add media"}
          </Button>
        </TabsContent>
        <TabsContent value="local" className="mt-2 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
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
            {uploading ? "Uploading to cloud…" : "Upload image or video"}
          </button>
          <p className="text-[10px] text-zinc-500">
            Videos get a 540p proxy + poster for editor preview; export still uses the original.
          </p>
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
                  resolveMediaUrl(asset.metadata?.posterUrl || "") ||
                  resolveMediaUrl(asset.thumbnailUrl || "") ||
                  (asset.mediaType === "image" ? resolveMediaUrl(asset.url) : "") ||
                  "";
                if (!thumb) {
                  return (
                    <div className="absolute inset-0 bg-zinc-800" aria-hidden />
                  );
                }
                // Never use MP4 as browser thumb grid source.
                if (/\.(mp4|webm|mov)(\?|#|$)/i.test(thumb)) {
                  return (
                    <div className="absolute inset-0 bg-zinc-800" aria-hidden />
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
