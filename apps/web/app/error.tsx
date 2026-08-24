"use client";

import { Button, Card, ErrorState, PageShell } from "@yuni/ui";

export default function PrivateAreaError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageShell centered maxWidth="720px">
      <Card padding="lg">
        <ErrorState
          title="No pudimos cargar esta sección"
          description="Ocurrió un error inesperado. Podés volver a intentar sin perder tu sesión."
          action={<Button onClick={reset}>Reintentar</Button>}
        />
      </Card>
    </PageShell>
  );
}
