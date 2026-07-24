"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { workspaces } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceSwitcher() {
  const [active, setActive] = useState(workspaces[0]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-2 px-2.5 font-normal" />
        }
      >
        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
          {active.name.slice(0, 1)}
        </span>
        <span className="hidden max-w-[120px] truncate sm:inline">{active.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} onClick={() => setActive(ws)} className="gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-medium">
              {ws.name.slice(0, 1)}
            </span>
            <div className="flex flex-1 flex-col">
              <span className="text-sm">{ws.name}</span>
              <span className="text-xs text-muted-foreground">{ws.plan}</span>
            </div>
            {active.id === ws.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
