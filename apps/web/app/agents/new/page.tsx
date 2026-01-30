import Link from "next/link";
import { AgentEditor } from "@/components/AgentEditor";

export default function NewAgentPage() {
  return (
    <div className="min-h-screen h-screen bg-background overflow-y-auto flex flex-col">
      <div className="max-w-4xl mx-auto p-8 flex-1 w-full">
        <div className="mb-6">
          <Link href="/agents" className="text-accent-theme hover:underline mb-4 inline-block text-sm">
            ← Volver a Agentes
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Crear Nuevo Agente</h1>
          <p className="text-muted-foreground mt-2">Define un nuevo agente de IA</p>
        </div>
        <AgentEditor />
      </div>
    </div>
  );
}
