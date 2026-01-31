import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { LiquidBackgroundLandingOnly } from "@/components/LiquidBackgroundLandingOnly";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fuentes de display cargadas por link (evita error next/font/google/target.css en monorepo/Turbopack)
const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Audiowide&family=Bebas+Neue&family=Exo+2&family=Inter:wght@400;500;600&family=Michroma&family=Orbitron&family=Outfit:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500&family=Rajdhani:wght@500&family=Raleway&family=Sora&family=Space+Grotesk&family=Space+Mono&family=Syne&family=Tektur&family=Unbounded&family=Zen+Dots&display=swap";

export const metadata: Metadata = {
  title: "YUNI - AI Avatar Platform",
  description: "Create, manage, and interact with AI avatars",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link href={GOOGLE_FONTS_URL} rel="stylesheet" />
      </head>
      <body
        className={`${geistMono.variable} font-sans antialiased bg-[#0E0418] text-white`}
      >
        <div className="min-h-screen flex flex-col relative">
          <LiquidBackgroundLandingOnly />
          <div className="relative z-10 flex-1 flex flex-col min-h-screen">
            <Providers>{children}</Providers>
          </div>
        </div>
      </body>
    </html>
  );
}
