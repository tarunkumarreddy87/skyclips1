export default function EditorShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="editor-theme-surface fixed inset-0 z-[100] h-svh w-svw overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}
