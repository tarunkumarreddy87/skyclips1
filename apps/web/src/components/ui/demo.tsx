"use client";

import React, { useState } from "react";
import {
  AtSign,
  ChevronDown,
  ArrowUp,
  Sparkles,
  Bot,
  Check,
  CheckSquare,
  Wand2,
  Plus,
} from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CHIP: React.CSSProperties = {
  borderRadius: 36,
  background: "rgba(255, 255, 255, 0.04)",
  boxShadow:
    "inset 0 0 0 1px rgba(255, 255, 255, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
};

const USER_AVATAR =
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";

const QUICK_PROMPTS = [
  "Trim awkward silences & tighten pacing",
  "Add modern glitch transition on next cut",
  "Find and insert relevant high-res B-roll",
  "Generate dynamic kinetic captions with colors",
  "Apply cinematic warm color grading",
];

export function ChatInput() {
  const [value, setValue] = useState("");
  const [selectedModel, setSelectedModel] = useState<"smart" | "fast">("smart");
  const [selectAll, setSelectAll] = useState(false);

  return (
    <div
      style={{
        width: 380,
        maxWidth: "100%",
        borderRadius: 20,
        background: "#161618",
        boxShadow:
          "inset 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 16px 40px -10px rgba(0, 0, 0, 0.7)",
        overflow: "hidden",
        position: "relative",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          minHeight: 136,
        }}
      >
        {/* Top Context & Select All row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 24,
              padding: "0 6px",
              gap: 4,
              ...CHIP,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={USER_AVATAR}
              alt="User avatar"
              style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover" }}
            />
            <AtSign className="size-3 text-zinc-400" />
          </div>

          <button
            type="button"
            onClick={() => setSelectAll((prev) => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              height: 24,
              padding: "0 8px",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              border: selectAll ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 36,
              background: selectAll ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.03)",
              color: selectAll ? "#6ee7b7" : "#a1a1aa",
              transition: "all 0.15s ease",
            }}
          >
            {selectAll ? (
              <CheckSquare className="size-3 text-emerald-400" />
            ) : (
              <AtSign className="size-3 text-zinc-400" />
            )}
            {selectAll ? "All clips selected" : "Select all"}
          </button>
        </div>

        {/* Text Input */}
        <textarea
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={selectAll ? "Ask to edit all timeline clips..." : "Ask to edit or choose a prompt..."}
          style={{
            fontSize: 13,
            lineHeight: "18px",
            color: "#f4f4f5",
            background: "transparent",
            border: "none",
            outline: "none",
            padding: "10px 4px 0",
            width: "100%",
            resize: "none",
            fontFamily: "inherit",
          }}
        />

        {/* Bottom Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: "auto",
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {/* Attach */}
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.04)",
              border: "none",
              color: "#a1a1aa",
              cursor: "pointer",
            }}
          >
            <Plus className="size-3.5" />
          </button>

          {/* Prompt Selector Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    height: 24,
                    padding: "0 8px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#d4d4d8",
                    cursor: "pointer",
                    ...CHIP,
                  }}
                />
              }
            >
              <Wand2 className="size-3 text-amber-400" />
              Prompts
              <ChevronDown className="size-3 text-zinc-500" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-64 overflow-hidden rounded-2xl border-white/[0.1] bg-[#222224] p-1.5 text-zinc-200 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-zinc-400 uppercase">
                <Sparkles className="size-3 text-amber-400" />
                Prompt Presets
              </div>
              <DropdownMenuSeparator className="bg-white/[0.06]" />
              {QUICK_PROMPTS.map((prompt) => (
                <DropdownMenuItem
                  key={prompt}
                  className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-300 hover:bg-white/[0.08]"
                  onClick={() => setValue(prompt)}
                >
                  {prompt}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Model Selector Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    height: 24,
                    padding: "0 8px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: selectedModel === "smart" ? "#fed7aa" : "#d4d4d8",
                    cursor: "pointer",
                    ...CHIP,
                  }}
                />
              }
            >
              <Bot className={selectedModel === "smart" ? "size-3 text-orange-400" : "size-3 text-blue-400"} />
              {selectedModel === "smart" ? "SkyClip Pro" : "SkyClip v1"}
              <ChevronDown className="size-3 text-zinc-500" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-56 overflow-hidden rounded-2xl border-white/[0.1] bg-[#222224] p-1.5 text-zinc-200 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1 text-[10px] uppercase text-zinc-500">
                  AI Model
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center justify-between text-xs"
                  onClick={() => setSelectedModel("fast")}
                >
                  <span>SkyClip v1 · Fast</span>
                  {selectedModel === "fast" && <Check className="size-3.5 text-blue-400" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center justify-between text-xs"
                  onClick={() => setSelectedModel("smart")}
                >
                  <span>SkyClip Pro · Smart</span>
                  {selectedModel === "smart" && <Check className="size-3.5 text-orange-400" />}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Send Button */}
          <button
            type="button"
            aria-label="Send"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              marginLeft: "auto",
              padding: 0,
              border: "none",
              borderRadius: "50%",
              background: value ? "linear-gradient(135deg, #3b82f6, #6366f1)" : "rgba(255,255,255,0.06)",
              color: value ? "#ffffff" : "#71717a",
              cursor: value ? "pointer" : "default",
              boxShadow: value ? "0 0 12px rgba(59,130,246,0.4)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            <ArrowUp className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Default() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 600,
        maxWidth: "100%",
        minHeight: 360,
        margin: "0 auto",
        background: "#0d0d0f",
        borderRadius: 24,
      }}
    >
      <BorderBeam size="md" colorVariant="colorful">
        <ChatInput />
      </BorderBeam>
    </div>
  );
}

export { Default as BorderBeamDemo };
