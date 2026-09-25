import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Visite Virtuelle 3D Photogrammétrie | Leica Cyclone Register 360",
  description:
    "Explorez le site industriel et l'intérieur des cuves en visite virtuelle 3D immersive HD 360°, modélisé par photogrammétrie Leica Cyclone Register 360.",
  keywords: [
    "visite virtuelle 3d",
    "photogrammetrie leica",
    "leica cyclone register 360",
    "cuves virtuelles 360",
    "panorama 360",
    "jet clickone",
  ],
  authors: [{ name: "Leica Cyclone 360 Team" }],
  openGraph: {
    title: "Visite Virtuelle 3D Photogrammétrie | Leica Cyclone Register 360",
    description:
      "Explorez le site industriel et l'intérieur des cuves en visite virtuelle 3D immersive HD 360°.",
    type: "website",
    locale: "fr_FR",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
