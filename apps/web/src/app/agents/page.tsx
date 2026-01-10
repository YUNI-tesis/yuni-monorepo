import { AgentsList } from "@/components/AgentsList";
import { Header } from "@/components/Header";

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Header />
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Agentes</h1>
        </div>
        <AgentsList />
      </div>
    </div>
  );
}

