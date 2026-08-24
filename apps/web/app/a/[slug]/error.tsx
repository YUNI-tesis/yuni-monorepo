"use client";

import { Button, Card, ErrorState, PageShell } from "@yuni/ui";
import { YuniLogo } from "../../../components/brand/YuniLogo";

export default function PublicAvatarError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageShell centered maxWidth="720px">
      <Card padding="lg">
        <div style={{ display: "grid", justifyItems: "center", gap: "1.5rem" }}>
          <YuniLogo aria-hidden="true" />
          <ErrorState
            title="No pudimos abrir el avatar"
            description="La página tuvo un problema inesperado. Comprobá tu conexión y volvé a intentar."
            action={<Button onClick={reset}>Reintentar</Button>}
          />
        </div>
      </Card>
    </PageShell>
  );
}
