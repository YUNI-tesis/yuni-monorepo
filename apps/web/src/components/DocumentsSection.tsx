"use client";

import { AgentContextSection } from "@/components/AgentContextSection";

interface DocumentsSectionProps {
  agentId: string;
}

/**
 * Wrapper for backward compatibility. Prefer using AgentContextSection directly
 * for the unified "Contexto" block (documents + optional notes).
 */
export function DocumentsSection({ agentId }: DocumentsSectionProps) {
  return (
    <AgentContextSection
      agentId={agentId}
      readOnly={false}
      contextText=""
      variant="sidebar"
    />
  );
}
