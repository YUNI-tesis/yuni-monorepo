# Prompt: UI Design System

Armame un plan específico para el Design System de YUNI.

Objetivo:
Crear una base visual y de componentes reutilizables para que el frontend sea escalable, consistente, fácil de codear y fácil de mantener antes de construir las pantallas grandes del producto.

Debe incluir:

- `packages/ui` como fuente principal del design system
- tokens de diseño
- estilos globales mínimos en `apps/web`
- componentes comunes reutilizables
- patrones de layout
- formularios
- estados visuales
- accesibilidad básica
- documentación de uso
- estrategia para evitar duplicación de CSS/componentes

Tokens mínimos:

- colores
- superficies/backgrounds
- bordes
- radius
- spacing
- typography
- shadows
- z-index
- focus rings
- estados: hover, active, disabled, error, success, warning

Componentes mínimos:

- `Button`
- `IconButton`
- `Input`
- `Textarea`
- `Select`
- `Checkbox`
- `Switch`
- `Tabs`
- `Card`
- `Modal/Dialog`
- `Dropdown/Menu`
- `Badge`
- `Tooltip`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `PageShell`
- `PageHeader`
- `SidebarLayout`
- `FormField`
- `FileDrop`
- `MetricCard`
- `DataList` o `Table` simple

Reglas de diseño:

- UI en español.
- Código/componentes en inglés.
- No armar landing todavía salvo que sea necesaria.
- No usar cards dentro de cards.
- Cards con border radius máximo 8px salvo excepción explícita.
- Interfaces operativas deben sentirse densas, claras y escaneables, no como landing de marketing.
- Usar iconos en botones cuando corresponda.
- No hardcodear estilos repetidos en features.
- Features consumen componentes de `packages/ui` y estilos/tokens compartidos.
- Textos no deben solaparse ni romper botones/cards en mobile.
- No usar una paleta de un solo color dominante.

Estructura deseada:

- `packages/ui/src/tokens`
- `packages/ui/src/components`
- `packages/ui/src/layout`
- `packages/ui/src/forms`
- `packages/ui/src/feedback`
- `packages/ui/src/data-display`
- `packages/ui/src/index.ts`

Debe definir:

- cómo exportar componentes
- cómo importar desde `apps/web`
- si se usa CSS modules, CSS variables, clases globales o una combinación
- cómo convivir con `apps/web/app/globals.css`
- ejemplos de uso para formularios y layouts

No incluir:

- ABM de avatares
- Auth nuevo
- Share
- Interact
- Live Avatar real
- Chat
- RAG

Checklist:

- `packages/ui` tiene tokens reutilizables
- `packages/ui` exporta componentes base
- `apps/web` usa el design system en páginas existentes de auth/dashboard si corresponde
- no queda CSS duplicado innecesario
- componentes son accesibles por teclado cuando aplica
- componentes tienen estados disabled/loading/error cuando aplica
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pasan
