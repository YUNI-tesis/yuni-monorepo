import { getCurrentUser } from "@/lib/auth-helpers";
import { Hero, About, Features, Technology, CTA, LandingNavbar } from "@/components/landing";

export default async function Home() {
  const user = await getCurrentUser();

  // Always show landing page (public). Fondo líquido viene del layout (LiquidBackground).
  return (
    <main className="relative">
      <LandingNavbar />
      <Hero />
      <About />
      <Features />
      <Technology />
      <CTA />
      
      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-white/60 mb-4">
            © 2025 Yuni AI. Desarrollado por Santiago Peres y Lucas Lovaglio.
          </p>
          <p className="text-white/40 text-sm">
            Plataforma multi-agente para crear, gestionar y conversar con agentes de IA personalizados.
          </p>
        </div>
      </footer>
    </main>
  );
}