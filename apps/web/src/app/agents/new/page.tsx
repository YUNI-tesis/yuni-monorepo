import Link from "next/link";
import { AgentEditor } from "@/components/AgentEditor";
import { Header } from "@/components/Header";

export default function NewAgentPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black flex flex-col">
      <Header />
      <div className="max-w-4xl mx-auto p-8 flex-1">
        <div className="mb-6">
          <Link href="/agents" className="text-blue-600 hover:underline mb-4 inline-block">
            ← Volver a Agentes
          </Link>
          <h1 className="text-3xl font-bold">Crear Nuevo Agente</h1>
        </div>
        <AgentEditor />
      </div>
    </div>
  );
}

