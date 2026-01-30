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
      <footer className="border-t border-theme py-12 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-muted-theme mb-4">
            © 2025 Yuni AI. Desarrollado por Santiago Peres y Lucas Lovaglio.
          </p>
          <p className="text-muted-theme text-sm opacity-80">
            Plataforma multi-agente para crear, gestionar y conversar con agentes de IA personalizados.
          </p>
        </div>
      </footer>
    </main>
  );
}