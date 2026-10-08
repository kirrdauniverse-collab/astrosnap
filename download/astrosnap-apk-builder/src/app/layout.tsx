import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AstroSnap – Asztrofotó asszisztens",
  description:
    "Telefonos asztrofotó alkalmazás: automatikus beállítások égbolt és célpont alapján, korrekciós fotók, képek egybeillesztése és színkorrekció.",
  keywords: [
    "asztrofotó",
    "astrophotography",
    "Tejút",
    "Hold",
    "bolygók",
    "stacking",
    "dark frame",
    "színkorrekció",
  ],
  authors: [{ name: "AstroSnap" }],
  icons: {
    icon: "/logo.svg",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "AstroSnap – Asztrofotó asszisztens",
    description: "Telefonos asztrofotó alkalmazás teljes utófeldolgozási pipeline-nal.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#050810",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground overflow-x-hidden`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
