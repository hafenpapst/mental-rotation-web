import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ✅ Mobile-Viewport + Theme-Farbe (richtiges Zuhause für themeColor)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // nutzt den ganzen Bildschirm inkl. Notch-Bereich
  themeColor: "#35a78a", // ← hierhin verschoben
};

// ✅ Nur Titel + Beschreibung bleiben im Metadata-Block
export const metadata: Metadata = {
  title: "Mentale Rotation – 3D",
  description:
    "Wie gut ist Ihr räumliches Denken? Testen Sie Ihre Fähigkeit zur mentalen Rotation von 3D-Objekten in diesem interaktiven Test.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
