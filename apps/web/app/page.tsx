import { appConfig } from "@yuni/config";
import { Button, Card, PageHeader, PageShell } from "@yuni/ui";

export default function HomePage() {
  return (
    <PageShell centered maxWidth="760px">
      <Card padding="lg">
        <PageHeader
          eyebrow="Monorepo listo"
          title={appConfig.appName}
          description="Base limpia para construir YUNI por modulos, sin logica de producto todavia."
          actions={<Button>Continuar</Button>}
        />
      </Card>
    </PageShell>
  );
}
