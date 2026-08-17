import type { Metadata } from "next";
import { AppLayout } from "../components/app-layout/AppLayout";
import "./globals.css";

const AUDIOWIDE_FONT_URL = "https://fonts.googleapis.com/css2?family=Audiowide&display=swap";

export const metadata: Metadata = {
  title: "YUNI",
  description: "Base limpia del monorepo YUNI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={AUDIOWIDE_FONT_URL} />
      </head>
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
