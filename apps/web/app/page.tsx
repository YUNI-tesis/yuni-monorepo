import { appConfig } from "@yuni/config";
import Link from "next/link";
import React from "react";
import { Card, PageHeader, PageShell } from "@yuni/ui";

export default function HomePage() {
  return (
    <PageShell centered maxWidth="760px">
      <Card padding="lg">
        <PageHeader
          eyebrow="YUNI"
          title={appConfig.appName}
          description="Landing publica en preparacion. El espacio privado de trabajo esta en el dashboard."
          actions={
            <Link className="yuni-button yuni-button--primary yuni-button--md" href="/dashboard">
              <span>Ir a dashboard</span>
            </Link>
          }
        />
      </Card>
    </PageShell>
  );
}
