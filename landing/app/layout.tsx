import { Inter, JetBrains_Mono, Recursive } from "next/font/google";
import { THEME_SCRIPT } from "../../app/lib/theme";
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

// The page's own voice. Its Mono axis sets anything that is code, so prose and code are one family.
// Inter and JetBrains Mono stay for the drawings of the app, which use the app's faces.
const recursive = Recursive({
  variable: "--font-page",
  subsets: ["latin"],
  axes: ["MONO", "CASL"],
  display: "swap",
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme is set on <html> by the script below, before React loads: the app's, so a reader's choice there holds here.
    <html lang="en" className={`${inter.variable} ${mono.variable} ${recursive.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Browser extensions stamp attributes on <body> before React loads. */}
      <body className="h-full overflow-hidden" suppressHydrationWarning>{children}</body>
    </html>
  );
}
