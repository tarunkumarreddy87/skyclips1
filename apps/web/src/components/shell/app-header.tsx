import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-6 backdrop-blur-sm">
      <div className="min-w-0">
        {title && <h1 className="truncate text-sm font-medium text-muted-foreground">{title}</h1>}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <WorkspaceSwitcher />
        <Avatar className="h-8 w-8">
          <AvatarFallback>TV</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
