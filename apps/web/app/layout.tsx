import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConditionalTopBar } from "@/components/ConditionalTopBar";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YUNI - AI Avatar Platform",
  description: "Create, manage, and interact with AI avatars",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0E0418] text-white`}
      >
        <div className="min-h-screen flex flex-col">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
