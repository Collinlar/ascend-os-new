import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font, so the identity typefaces cost no
// external request and cause no layout shift. That keeps the Ghanaian
// mobile performance budget intact while still using the brand faces.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AscendSME. Run the business. Build credibility.",
  description:
    "Start with what your business needs today. Everything stays connected as you grow. Sell, take orders, receive bookings, create documents and build a verifiable record of your business.",
  // Without a manifest the till is a website, not something a merchant can
  // put on a home screen and open like an app.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ascend POS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1D2E",
  // A till is held, tapped and sometimes knocked. Pinch zoom on a selling
  // grid only ever happens by accident, and a zoomed-in till mid-queue is
  // a cashier fighting the tool.
  maximumScale: 1,
  userScalable: false,
  // Handhelds increasingly have rounded corners and notches; the grid
  // should reach the edges without hiding a tile under one.
  viewportFit: "cover",
};

import WorkspaceNav from "@/components/shell/WorkspaceNav";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${hanken.variable} ${plexMono.variable}`}>
      <body>
        {/* One navigation for every workspace surface. It renders nothing
            when signed out, and nothing on the till or the public pages. */}
        <WorkspaceNav />
        {children}
      </body>
    </html>
  );
}
