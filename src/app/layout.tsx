import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "@fontsource-variable/onest/wght.css";
import "@fontsource-variable/chivo-mono/wght.css";
import { SITE } from "@/lib/site";
import "./globals.css";

// Read from the installed package, never fetched at build time, and preloaded with a metric-matched
// fallback so the large headline does not shift when it arrives.
const display = localFont({
  src: "../../node_modules/@fontsource-variable/league-gothic/files/league-gothic-latin-wdth-normal.woff2",
  variable: "--font-league-gothic",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${SITE.name} | Video editing`,
  description: `${SITE.name} is a video editing studio. Watch the reel, then send your footage.`,
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
