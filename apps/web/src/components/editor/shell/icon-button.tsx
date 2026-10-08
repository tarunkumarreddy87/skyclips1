"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IconButtonProps extends Omit<ComponentProps<typeof Button>, "size"> {
  active?: boolean;
  size?: "sm" | "md";
}

export function IconButton({ className, active, size = "md", children, ...props }: IconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size === "sm" ? "icon-sm" : "icon"}
      className={cn(
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-primary/15 text-primary ring-1 ring-primary/25",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
