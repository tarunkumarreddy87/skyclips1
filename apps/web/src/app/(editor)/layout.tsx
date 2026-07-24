export default function EditorShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] h-svh w-svw overflow-hidden bg-[#111111] text-white">
      {children}
    </div>
  );
}
