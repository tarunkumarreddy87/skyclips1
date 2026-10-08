"use client";

import { useCallback, useRef, useState } from "react";
import { useEditorStore } from "@/lib/editor/store";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Italic,
  Minus,
  Move,
  Palette,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Video,
  Volume2,
  MousePointer2,
  Image as ImageIcon,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── tiny pill separator ─── */
function Sep() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-zinc-200" aria-hidden />;
}

/* ─── icon-only toolbar button ─── */
function Btn({
  title,
  icon,
  onClick,
  active,
  danger,
  className: extra,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "flex size-7 items-center justify-center rounded transition-colors",
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
        danger && !active && "hover:bg-red-50 hover:text-red-600",
        extra,
      )}
    >
      {icon}
    </button>
  );
}

/* ─── text label button (like "Color", "Background") ─── */
function LabelBtn({
  label,
  icon,
  onClick,
  active,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded px-2 text-[12px] font-medium transition-colors whitespace-nowrap",
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ─── font size stepper ─── */
function FontSizeStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-7 items-center gap-0 rounded border border-zinc-200 bg-white">
      <button
        type="button"
        title="Decrease font size"
        onClick={(e) => { e.stopPropagation(); onChange(Math.max(8, value - 2)); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex size-7 items-center justify-center text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 rounded-l"
      >
        <Minus className="size-3" />
      </button>
      <span className="min-w-[3.5rem] text-center text-[12px] font-medium tabular-nums text-zinc-800 border-x border-zinc-200 px-1">
        {value.toFixed(1)} pt
      </span>
      <button
        type="button"
        title="Increase font size"
        onClick={(e) => { e.stopPropagation(); onChange(Math.min(200, value + 2)); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex size-7 items-center justify-center text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 rounded-r"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

/* ─── color swatch ─── */
function ColorSwatch({
  color,
  onClick,
  title,
}: {
  color: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex size-7 items-center justify-center rounded hover:bg-zinc-100"
    >
      <span
        className="size-4 rounded-full border border-zinc-300 shadow-sm"
        style={{ backgroundColor: color || "#ffffff" }}
      />
    </button>
  );
}

/* ━━━━━━━━━━━━━━━━ MAIN TOOLBAR ━━━━━━━━━━━━━━━━ */

export function PreviewTopToolbar() {
  const selectedItem = useEditorStore((s) => s.getSelectedItem());
  const duplicateItem = useEditorStore((s) => s.duplicateItem);
  const deleteItem = useEditorStore((s) => s.deleteItem);
  const splitItem = useEditorStore((s) => s.splitItem);
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const selectItem = useEditorStore((s) => s.selectItem);
  const setRightPanelOpen = useEditorStore((s) => s.setRightPanelOpen);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const bringItemToFront = useEditorStore((s) => s.bringItemToFront);
  const sendItemToBack = useEditorStore((s) => s.sendItemToBack);
  const updateTextItem = useEditorStore((s) => s.updateTextItem);

  /* ── empty state ── */
  if (!selectedItem) {
    return null;
  }

  const item = selectedItem;
  const isText = item.type === "text" || item.type === "captions";
  const isMedia =
    item.type === "video" || item.type === "broll";
  const canSplit =
    item.type === "video" ||
    item.type === "broll" ||
    item.type === "narration" ||
    item.type === "music" ||
    item.type === "sfx" ||
    item.type === "text" ||
    item.type === "captions";

  function handleSplit() {
    const rightId = splitItem(item.id, playheadMs);
    if (rightId) {
      selectItem(rightId);
      setRightPanelOpen(true);
    }
  }

  /* ━━━━━━━━ TEXT TOOLBAR ━━━━━━━━ */
  if (isText && "fontSize" in item) {
    const fontLabel =
      "fontFamily" in item && item.fontFamily
        ? String(item.fontFamily).split(",")[0].replace(/['"]/g, "").trim()
        : "Default";

    return (
      <div className="flex h-10 w-full shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden bg-white border-b border-zinc-200 px-3 z-10 scrollbar-none">
        {/* Font family */}
        <LabelBtn
          icon={<Type className="size-3.5" />}
          label={fontLabel}
          onClick={() => { setActiveTool("text"); setRightPanelOpen(true); }}
        />

        <Sep />

        {/* Bold / Italic */}
        <Btn
          title="Bold"
          icon={<Bold className="size-3.5" />}
          active={item.fontWeight === "700" || item.fontWeight === "bold"}
          onClick={() =>
            updateTextItem(item.id, {
              fontWeight:
                item.fontWeight === "700" || item.fontWeight === "bold"
                  ? "400"
                  : "700",
            })
          }
        />
        <Btn
          title="Italic"
          icon={<Italic className="size-3.5" />}
          onClick={() => { setActiveTool("text"); setRightPanelOpen(true); }}
        />

        <Sep />

        {/* Font size stepper */}
        <FontSizeStepper
          value={item.fontSize}
          onChange={(v) => updateTextItem(item.id, { fontSize: v })}
        />

        <Sep />

        {/* Alignment */}
        {"alignment" in item && (
          <>
            <Btn
              title="Align Left"
              icon={<AlignLeft className="size-3.5" />}
              active={item.alignment === "left"}
              onClick={() => updateTextItem(item.id, { alignment: "left" })}
            />
            <Btn
              title="Align Center"
              icon={<AlignCenter className="size-3.5" />}
              active={item.alignment === "center"}
              onClick={() => updateTextItem(item.id, { alignment: "center" })}
            />
            <Btn
              title="Align Right"
              icon={<AlignRight className="size-3.5" />}
              active={item.alignment === "right"}
              onClick={() => updateTextItem(item.id, { alignment: "right" })}
            />
          </>
        )}

        <Sep />

        {/* Color */}
        <ColorSwatch
          color={"color" in item ? item.color : "#ffffff"}
          title="Text Color"
          onClick={() => { setActiveTool("text"); setRightPanelOpen(true); }}
        />
        <LabelBtn label="Color" onClick={() => { setActiveTool("text"); setRightPanelOpen(true); }} />

        <Sep />

        {/* Animations */}
        <LabelBtn
          icon={<Sparkles className="size-3.5" />}
          label="Animations"
          onClick={() => { setActiveTool("animations"); setRightPanelOpen(true); }}
        />

        <Sep />

        {/* Position */}
        <LabelBtn
          icon={<Move className="size-3.5" />}
          label="Position"
          onClick={() => { setActiveTool("text"); setRightPanelOpen(true); }}
        />

        <div className="flex-1 min-w-2" />

        {/* Right-side actions */}
        <Sep />
        <Btn
          title="Bring Forward"
          icon={<ChevronUp className="size-4" />}
          onClick={() => bringItemToFront(item.id)}
        />
        <Btn
          title="Send Backward"
          icon={<ChevronDown className="size-4" />}
          onClick={() => sendItemToBack(item.id)}
        />
        <Sep />
        {canSplit && (
          <Btn
            title="Split (S)"
            icon={<Scissors className="size-4" />}
            onClick={handleSplit}
          />
        )}
        <Btn
          title="Duplicate (⌘D)"
          icon={<Copy className="size-3.5" />}
          onClick={() => {
            const id = duplicateItem(item.id);
            if (id) { selectItem(id); setRightPanelOpen(true); }
          }}
        />
        <Btn
          title="Delete (Del)"
          icon={<Trash2 className="size-3.5" />}
          danger
          onClick={() => { deleteItem(item.id); selectItem(null); }}
        />
      </div>
    );
  }

  /* ━━━━━━━━ MEDIA / GENERIC TOOLBAR ━━━━━━━━ */
  return (
    <div className="flex h-10 w-full shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden bg-white border-b border-zinc-200 px-3 z-10 scrollbar-none">
      {/* Type label */}
      <div className="flex items-center gap-1.5 pr-2 mr-1 text-xs font-semibold text-zinc-500">
        {isMedia ? <Video className="size-3.5" /> : <Volume2 className="size-3.5" />}
        <span className="uppercase tracking-wider text-[11px]">{item.type}</span>
      </div>

      <Sep />

      {/* Animations */}
      <LabelBtn
        icon={<Sparkles className="size-3.5" />}
        label="Animations"
        onClick={() => { setActiveTool("animations"); setRightPanelOpen(true); }}
      />

      <Sep />

      {/* Position */}
      <LabelBtn
        icon={<Move className="size-3.5" />}
        label="Position"
        onClick={() => { setRightPanelOpen(true); }}
      />

      <div className="flex-1 min-w-2" />

      {/* Right-side actions */}
      <Sep />
      <Btn
        title="Bring Forward"
        icon={<ChevronUp className="size-4" />}
        onClick={() => bringItemToFront(item.id)}
      />
      <Btn
        title="Send Backward"
        icon={<ChevronDown className="size-4" />}
        onClick={() => sendItemToBack(item.id)}
      />
      <Sep />
      {canSplit && (
        <Btn
          title="Split (S)"
          icon={<Scissors className="size-4" />}
          onClick={handleSplit}
        />
      )}
      <Btn
        title="Duplicate (⌘D)"
        icon={<Copy className="size-3.5" />}
        onClick={() => {
          const id = duplicateItem(item.id);
          if (id) { selectItem(id); setRightPanelOpen(true); }
        }}
      />
      <Btn
        title="Delete (Del)"
        icon={<Trash2 className="size-3.5" />}
        danger
        onClick={() => { deleteItem(item.id); selectItem(null); }}
      />
    </div>
  );
}
