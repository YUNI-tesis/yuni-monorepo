import { AgentsList } from "@/components/AgentsList";
import { Header } from "@/components/Header";

export default function AgentsPage() {
  return (
    <div className="min-h-screen relative bg-[#0a0a0f]">
      <Header />
      <div className="max-w-[1920px] px-6 lg:px-8 py-12">
        <AgentsList />
      </div>
    </div>
  );
}

