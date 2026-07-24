import localFont from "next/font/local";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceMain } from "@/components/workspace-main";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/** Local font — avoids Google Fonts fetch failures during Docker/ECS builds. */
const instrumentSerif = localFont({
  src: "../../fonts/InstrumentSerif-Regular.ttf",
  variable: "--font-studio-serif",
  display: "swap",
  weight: "400",
});

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      defaultOpen={false}
      className={cn(instrumentSerif.variable, "bg-background")}
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem",
          "--header-height": "0px",
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset className="bg-background md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none">
        <WorkspaceMain>{children}</WorkspaceMain>
      </SidebarInset>
    </SidebarProvider>
  );
}
