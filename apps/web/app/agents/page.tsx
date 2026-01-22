import { AgentsList } from "@/components/AgentsList";

export default function AgentsPage() {
  return (
    <div className="h-[calc(100vh-5rem)] bg-[#0E0418] overflow-y-auto">
      <div className="max-w-7xl mx-auto p-8">
        <AgentsList />
      </div>
    </div>
  );
}

