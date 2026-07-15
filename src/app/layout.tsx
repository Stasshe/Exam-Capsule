import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Exam Capsule",
  description: "A controlled browser assessment with verifiable interaction evidence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
