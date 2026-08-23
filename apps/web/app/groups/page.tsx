import type { Metadata } from "next";
import { GroupsHub } from "../../components/groups/GroupsHub";

export const metadata: Metadata = {
  title: "Grupos — YUNI",
  description: "Creá grupos de avatares y coordiná conversaciones con múltiples perspectivas.",
};

export default function GroupsPage() {
  return <GroupsHub />;
}
