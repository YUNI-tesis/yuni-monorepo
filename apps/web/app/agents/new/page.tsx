import Link from "next/link";
import { AgentEditor } from "@/components/AgentEditor";

export default function NewAgentPage() {
  return (
    <div className="min-h-screen bg-[#0E0418]">
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-6">
          <Link href="/agents" className="text-[#D365FF] hover:underline mb-4 inline-block text-sm">
            ← Volver a Agentes
          </Link>
          <h1 className="text-3xl font-bold text-white">Crear Nuevo Agente</h1>
          <p className="text-white/70 mt-2">Define un nuevo agente de IA</p>
        </div>
        <AgentEditor />
      </div>
    </div>
  );
}

