import { appConfig } from "@yuni/config";
import { Button } from "@yuni/ui";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Monorepo listo</p>
        <h1>{appConfig.appName}</h1>
        <p>Base limpia para construir YUNI por modulos, sin logica de producto todavia.</p>
        <Button>Continuar</Button>
      </section>
    </main>
  );
}
