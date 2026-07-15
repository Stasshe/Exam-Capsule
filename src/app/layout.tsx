import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Exam Capsule",
  description: "検証可能な操作証跡を持つブラウザ試験デモ。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
