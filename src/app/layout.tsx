import type { Metadata, Viewport } from "next";
import { ToolGuard } from "@/components/tool-guard";

import "./globals.css";

export const metadata: Metadata = {
  title: "Exam Capsule",
  description: "検証可能な操作証跡を持つブラウザ試験デモ。",
  applicationName: "Exam Capsule",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/icon-512.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-background text-foreground antialiased">
        <ToolGuard />
        {children}
      </body>
    </html>
  );
}
