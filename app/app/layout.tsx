import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Zilla_Slab } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const display = Zilla_Slab({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400"],
  display: "swap",
});

export const metadata: Metadata = {
  // A published export is one map, and its tab says which.
  title: process.env.NEXT_PUBLIC_STATIC_MAP ?? "Mira",
  description:
    "See what an agent actually changed in your codebase — and what the analysis could not prove.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme is set on <html> by the script below, before React loads.
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Browser extensions stamp attributes on <body> before React loads. */}
      <body className="h-full overflow-hidden" suppressHydrationWarning>{children}</body>
    </html>
  );
}
