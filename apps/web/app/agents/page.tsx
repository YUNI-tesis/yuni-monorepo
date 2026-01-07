import Link from "next/link";
import { AgentsList } from "@/components/AgentsList";

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-6">
          <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">
            ← Inicio
          </Link>
          <h1 className="text-3xl font-bold">Agentes</h1>
        </div>
        <AgentsList />
      </div>
    </div>
  );
}

