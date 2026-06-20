import type { Metadata } from "next";
import { AppLayout } from "../components/app-layout/AppLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "YUNI",
  description: "Base limpia del monorepo YUNI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
