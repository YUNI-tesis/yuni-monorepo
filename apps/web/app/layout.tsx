import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/syne";
import "@fontsource/audiowide";
import { AppLayout } from "../components/app-layout/AppLayout";
import { ToastProvider } from "@yuni/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "YUNI — Avatares de IA con identidad, voz y contexto",
  description:
    "Creá avatares de inteligencia artificial con identidad, contexto y voz. Compartilos y comprendé cada interacción.",
  applicationName: "YUNI",
  keywords: ["avatares de IA", "IA conversacional", "voz en tiempo real", "tesis", "YUNI"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <ToastProvider>
          <AppLayout>{children}</AppLayout>
        </ToastProvider>
      </body>
    </html>
  );
}
