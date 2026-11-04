import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mayor Studios",
  description: "Mayor Studios is a professional video editing studio.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
