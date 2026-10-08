"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "./textarea";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="input-group" role="group" className={cn("flex w-full flex-col rounded-xl border border-input bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring/40", className)} {...props} />;
}

function InputGroupAddon({ className, align = "block-end", ...props }: React.ComponentProps<"div"> & { align?: "block-start" | "block-end" }) {
  return <div data-slot="input-group-addon" data-align={align} className={cn("flex items-center gap-1 px-2 py-2 text-muted-foreground", align === "block-start" && "order-first", className)} {...props} />;
}

const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <Textarea ref={ref} data-slot="input-group-control" className={cn("resize-none border-0 shadow-none focus-visible:ring-0", className)} {...props} />
));
InputGroupTextarea.displayName = "InputGroupTextarea";

export { InputGroup, InputGroupAddon, InputGroupTextarea };
