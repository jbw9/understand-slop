import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // A published export is one map, and its tab says which.
  title: process.env.NEXT_PUBLIC_STATIC_MAP ?? "understand-slop",
  description:
    "See what an agent actually changed in your codebase — and what the analysis could not prove.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme is set on <html> by the script below, before React loads.
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Browser extensions stamp attributes on <body> before React loads. */}
      <body className="h-full overflow-hidden" suppressHydrationWarning>{children}</body>
    </html>
  );
}
