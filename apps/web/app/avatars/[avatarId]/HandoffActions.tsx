"use client";

import { useRouter } from "next/navigation";
import { Button } from "@yuni/ui";

export function HandoffActions() {
  const router = useRouter();

  return (
    <div className="yuni-cluster">
      <Button onClick={() => router.push("/avatars/new")}>Crear otro avatar</Button>
      <Button variant="secondary" onClick={() => router.push("/dashboard")}>
        Volver al dashboard
      </Button>
    </div>
  );
}
