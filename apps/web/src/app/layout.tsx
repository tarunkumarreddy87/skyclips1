import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ProtectedSession } from "@/components/auth/protected-session";
import {
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
} from "@/lib/brand";
import "./globals.css";
import "@/components/editor/editor-agent.css";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
  description: PRODUCT_DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="font-sans font-vars-production"
    >
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          themes={["dark", "black", "light"]}
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider>
            <ProtectedSession>{children}</ProtectedSession>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
