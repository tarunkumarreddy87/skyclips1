"use client";

import { cn } from "@/lib/utils";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: "sm" | "md";
}

export function IconButton({ className, active, size = "md", children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-zinc-400 transition-all duration-200 ease-out hover:bg-white/[0.08] hover:text-white",
        size === "sm" ? "size-8" : "size-9",
        active && "bg-[#2563EB]/20 text-[#93C5FD] ring-1 ring-[#2563EB]/35",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
