import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/styles.css";

export const metadata: Metadata = {
  title: "WorkLedger — Private work records",
  description:
    "Track time, proof, earnings, invoices, and backups in one private workspace.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1f3d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
