export const DEFAULT_AGENT_MODEL_PATH = "/assets/angelica.glb";

export function getAgentInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "AI";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}
