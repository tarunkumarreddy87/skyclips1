"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Scissors,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { resolveTransform } from "@/lib/editor/transform";
import { cn } from "@/lib/utils";

/**
 * Floating selection chrome.
 * - media: vertical pill on the right (Rush)
 * - text: Creativly-style horizontal bar above the selection
 */
export function CanvasElementToolbar({
  className,
  variant,
}: {
  className?: string;
  /** Override; defaults from selected item type. */
  variant?: "media" | "text";
}) {
  const selectedItem = useEditorStore((s) => s.getSelectedItem());
  const duplicateItem = useEditorStore((s) => s.duplicateItem);
  const deleteItem = useEditorStore((s) => s.deleteItem);
  const splitItem = useEditorStore((s) => s.splitItem);
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const selectItem = useEditorStore((s) => s.selectItem);
  const setRightPanelOpen = useEditorStore((s) => s.setRightPanelOpen);
  const updateItemTransform = useEditorStore((s) => s.updateItemTransform);
  const activeTool = useEditorStore((s) => s.ui.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  if (!selectedItem) return null;

  const item = selectedItem;
  const isText =
    variant === "text" ||
    (variant !== "media" && (item.type === "text" || item.type === "captions"));
  const canSplit =
    item.type === "video" ||
    item.type === "broll" ||
    item.type === "narration" ||
    item.type === "music" ||
    item.type === "sfx" ||
    item.type === "text" ||
    item.type === "captions";
  const transform = resolveTransform(
    "transform" in item ? item.transform : undefined,
    "position" in item ? item.position : undefined,
  );

  function withTransform(patch: Partial<typeof transform>) {
    updateItemTransform(item.id, { ...transform, ...patch });
  }

  function handleSplit() {
    const rightId = splitItem(item.id, playheadMs);
    if (rightId) {
      selectItem(rightId);
      setRightPanelOpen(true);
    }
  }

  if (isText) {
    return (
      <div
        data-element-toolbar
        className={cn(
          "pointer-events-auto absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-white/12 bg-[#1a1a1c]/96 px-1.5 py-1 text-zinc-100 shadow-[0_12px_32px_rgba(0,0,0,0.55)] backdrop-blur-md",
          "bottom-full mb-2.5",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <IconOnly
          title="Text effects"
          accent
          icon={<Sparkles className="size-3.5" strokeWidth={1.75} />}
          onClick={() => {
            setActiveTool(activeTool === "animations" ? "text" : "animations");
            setRightPanelOpen(true);
          }}
        />
        <Sep />
        <IconOnly
          title="Flip horizontal"
          icon={<FlipHorizontal2 className="size-3.5" strokeWidth={1.75} />}
          onClick={() => {
            const next = -(Math.sign(transform.scaleX) || 1) * Math.abs(transform.scaleX || 1);
            withTransform({ scaleX: next === 0 ? -1 : next });
          }}
        />
        <IconOnly
          title="Flip vertical"
          icon={<FlipVertical2 className="size-3.5" strokeWidth={1.75} />}
          onClick={() => {
            const next = -(Math.sign(transform.scaleY) || 1) * Math.abs(transform.scaleY || 1);
            withTransform({ scaleY: next === 0 ? -1 : next });
          }}
        />
        <Sep />
        <IconOnly
          title="Center horizontally"
          icon={<AlignCenterHorizontal className="size-3.5" strokeWidth={1.75} />}
          onClick={() => withTransform({ x: 50 })}
        />
        <IconOnly
          title="Center vertically"
          icon={<AlignCenterVertical className="size-3.5" strokeWidth={1.75} />}
          onClick={() => withTransform({ y: 50 })}
        />
        <Sep />
        {canSplit ? (
          <IconOnly
            title="Split at playhead (S)"
            icon={<Scissors className="size-3.5" strokeWidth={1.75} />}
            onClick={handleSplit}
          />
        ) : null}
        <IconOnly
          title="Duplicate (⌘/Ctrl+D)"
          icon={<Copy className="size-3.5" strokeWidth={1.75} />}
          onClick={() => {
            const id = duplicateItem(item.id);
            if (id) {
              selectItem(id);
              setRightPanelOpen(true);
            }
          }}
        />
        <IconOnly
          title="Delete"
          danger
          icon={<Trash2 className="size-3.5" strokeWidth={1.75} />}
          onClick={() => {
            deleteItem(item.id);
            selectItem(null);
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-element-toolbar
      className={cn(
        "pointer-events-auto absolute top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-full border border-white/14 bg-[#1c1c1c]/95 p-1 text-zinc-100 shadow-[0_14px_36px_rgba(0,0,0,0.55)] backdrop-blur-md",
        "right-0 translate-x-[calc(100%+8px)] max-[480px]:translate-x-0 max-[480px]:right-1",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {canSplit ? (
        <IconOnly
          title="Split at playhead (S)"
          icon={<Scissors className="size-3.5" strokeWidth={1.75} />}
          onClick={handleSplit}
        />
      ) : null}
      <IconOnly
        title="Duplicate (⌘/Ctrl+D)"
        icon={<Copy className="size-3.5" strokeWidth={1.75} />}
        onClick={() => {
          const id = duplicateItem(item.id);
          if (id) {
            selectItem(id);
            setRightPanelOpen(true);
          }
        }}
      />
      <IconOnly
        title="Delete"
        danger
        icon={<Trash2 className="size-3.5" strokeWidth={1.75} />}
        onClick={() => {
          deleteItem(item.id);
          selectItem(null);
        }}
      />
    </div>
  );
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-white/12" aria-hidden />;
}

function IconOnly({
  title,
  icon,
  onClick,
  danger,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/10 hover:text-white",
        danger && "text-red-400/90 hover:bg-red-500/15 hover:text-red-300",
        accent && "text-sky-400 hover:bg-sky-500/15 hover:text-sky-300",
      )}
    >
      {icon}
    </button>
  );
}
