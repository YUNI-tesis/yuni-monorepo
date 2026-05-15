import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YUNI",
  description: "Base limpia del monorepo YUNI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
