"use client";

import { useRef, type CSSProperties } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataList,
  Dialog,
  DropdownMenu,
  EmptyState,
  ErrorState,
  FileDrop,
  FormField,
  IconButton,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  Select,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
} from "@yuni/ui";

const swatches = [
  ["Background", "var(--yuni-color-bg)"],
  ["Surface", "var(--yuni-color-surface)"],
  ["Surface muted", "var(--yuni-color-surface-muted)"],
  ["Primary", "var(--yuni-color-primary)"],
  ["Accent", "var(--yuni-color-accent)"],
  ["Danger", "var(--yuni-color-danger)"],
  ["Success", "var(--yuni-color-success)"],
  ["Warning", "var(--yuni-color-warning)"],
] as const;

const rows = [
  { id: "1", name: "Demo public link", status: "Activo", sessions: "12" },
  { id: "2", name: "Testing interno", status: "Pausado", sessions: "3" },
];

export function ShowcaseClient() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <PageShell maxWidth="1180px">
      <PageHeader
        eyebrow="Design System"
        title="Componentes YUNI"
        description="Banco visual interno para revisar tokens, componentes y estados antes de construir pantallas de producto."
        actions={<Button onClick={() => dialogRef.current?.showModal()}>Abrir dialog</Button>}
      />

      <div className="yuni-stack">
        <section className="design-system-section">
          <h2>Tokens</h2>
          <div className="design-system-grid">
            {swatches.map(([label, color]) => (
              <div key={label} className="design-system-swatch" style={{ "--swatch-color": color } as CSSProperties}>
                <strong>{label}</strong>
                <span>{color}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="design-system-section">
          <h2>Typography</h2>
          <Card padding="md">
            <div className="design-system-type-scale">
              <p style={{ fontSize: "var(--yuni-font-3xl)", fontWeight: 900 }}>Titulo principal</p>
              <p style={{ fontSize: "var(--yuni-font-2xl)", fontWeight: 800 }}>Titulo de seccion</p>
              <p style={{ fontSize: "var(--yuni-font-lg)" }}>Texto destacado para interfaces operativas.</p>
              <p className="yuni-text-muted">Texto secundario para contexto y ayudas.</p>
            </div>
          </Card>
        </section>

        <section className="design-system-section">
          <h2>Buttons</h2>
          <Card padding="md">
            <div className="yuni-cluster">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
              <IconButton aria-label="Crear" icon="+" />
              <Tooltip content="Accion con tooltip">
                <IconButton aria-label="Informacion" icon="i" variant="ghost" />
              </Tooltip>
            </div>
          </Card>
        </section>

        <section className="design-system-section">
          <h2>Forms</h2>
          <Card padding="md">
            <div className="yuni-stack">
              <FormField label="Nombre" htmlFor="showcase-name" hint="Ejemplo de campo con ayuda.">
                <Input id="showcase-name" placeholder="YUNI Demo" />
              </FormField>
              <FormField label="Descripcion" htmlFor="showcase-description">
                <Textarea id="showcase-description" placeholder="Describe el avatar..." />
              </FormField>
              <FormField label="Voz" htmlFor="showcase-voice">
                <Select id="showcase-voice" defaultValue="alloy">
                  <option value="alloy">Alloy</option>
                  <option value="verse">Verse</option>
                </Select>
              </FormField>
              <FormField label="Campo con error" htmlFor="showcase-error" error="Este valor es obligatorio.">
                <Input id="showcase-error" invalid placeholder="Falta completar" />
              </FormField>
              <Input disabled placeholder="Campo deshabilitado" />
              <div className="yuni-cluster">
                <Checkbox label="Permitir texto" defaultChecked />
                <Switch label="Link activo" defaultChecked />
              </div>
              <FileDrop title="Subir contexto" description="PDF, TXT o DOCX para futuras pruebas visuales." multiple />
            </div>
          </Card>
        </section>

        <section className="design-system-section">
          <h2>Navigation</h2>
          <Card padding="md">
            <Tabs
              items={[
                { value: "info", label: "Informacion", content: <p className="yuni-text-muted">Contenido de informacion.</p> },
                { value: "share", label: "Compartir", content: <p className="yuni-text-muted">Contenido de compartir.</p> },
              ]}
            />
          </Card>
        </section>

        <section className="design-system-section">
          <h2>Feedback</h2>
          <div className="design-system-grid">
            <Card padding="md">
              <EmptyState title="Sin resultados" description="Todavia no hay elementos para mostrar." />
            </Card>
            <Card padding="md">
              <LoadingState title="Cargando datos" description="Esto es una vista de loading." />
            </Card>
            <Card padding="md">
              <ErrorState title="Error controlado" description="No pudimos completar la accion." />
            </Card>
          </div>
        </section>

        <section className="design-system-section">
          <h2>Data display</h2>
          <div className="design-system-grid">
            <MetricCard label="Sesiones" value="128" delta="+12%" tone="success" />
            <MetricCard label="Mensajes" value="842" delta="Estable" />
            <MetricCard label="Costo estimado" value="$3.42" delta="MVP" tone="warning" />
          </div>
          <Card padding="md">
            <DataList
              items={rows}
              getRowKey={(row) => row.id}
              columns={[
                { key: "name", header: "Nombre", render: (row) => row.name },
                { key: "status", header: "Estado", render: (row) => <Badge>{row.status}</Badge> },
                { key: "sessions", header: "Sesiones", render: (row) => row.sessions },
              ]}
            />
          </Card>
        </section>

        <section className="design-system-section">
          <h2>Overlay</h2>
          <Card padding="md">
            <div className="yuni-cluster">
              <DropdownMenu
                label="Acciones"
                items={[{ label: "Editar" }, { label: "Duplicar" }, { label: "Desactivar" }]}
              />
              <Button variant="secondary" onClick={() => dialogRef.current?.showModal()}>
                Ver dialog
              </Button>
            </div>
          </Card>
        </section>
      </div>

      <Dialog
        ref={dialogRef}
        title="Dialog del design system"
        description="Modal simple para validar estilos, foco y contenido."
      />
    </PageShell>
  );
}
