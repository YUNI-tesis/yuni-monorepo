import Link from "next/link";
import { AgentEditor } from "@/components/AgentEditor";
import { Header } from "@/components/Header";

export default function NewAgentPage() {
  return (
    <div className="min-h-screen relative bg-[#0a0a0f]">
      <Header />
      <div className="max-w-[1920px] px-6 lg:px-8 py-12">
        <div className="pb-8">
          <Link 
            href="/agents" 
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group"
          >
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a Agentes
          </Link>
          <h1 className="text-4xl font-bold gradient-text mb-2 tracking-tight">Crear Nuevo Agente</h1>
          <p className="text-gray-400 text-lg">Configura un nuevo asistente de IA personalizado</p>
        </div>
        <AgentEditor />
      </div>
    </div>
  );
}

