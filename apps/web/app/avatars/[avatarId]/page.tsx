import { Card, PageHeader, PageShell } from "@yuni/ui";
import styles from "../../../components/avatar-builder/AvatarBuilder.module.css";
import { HandoffActions } from "./HandoffActions";

type AvatarProfileHandoffPageProps = {
  params: Promise<{
    avatarId: string;
  }>;
};

export default async function AvatarProfileHandoffPage({ params }: AvatarProfileHandoffPageProps) {
  const { avatarId } = await params;

  return (
    <PageShell maxWidth="760px">
      <PageHeader
        eyebrow="Avatar creado"
        title="Perfil en preparacion"
        description="El avatar ya fue creado. En el proximo modulo esta ruta va a mostrar informacion y compartir."
      />
      <Card className="yuni-stack" padding="lg">
        <p className="yuni-eyebrow">ID del avatar</p>
        <strong className={styles.handoffId}>{avatarId}</strong>
        <HandoffActions />
      </Card>
    </PageShell>
  );
}
