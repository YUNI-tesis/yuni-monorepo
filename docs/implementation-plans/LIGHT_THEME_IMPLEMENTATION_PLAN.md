# Plan de Implementación: Light Theme

## 📋 Resumen Ejecutivo

Este documento describe el **análisis y la planificación** para implementar un **light theme** en la aplicación Yuni AI, manteniendo el mismo estilo visual (gradientes morado/cyan, acentos, tipografía) y **sin modificar funcionalidad**. Incluye la estrategia de tema dual (dark/light), la ubicación UX del control de cambio de tema y el plan de ejecución por fases.

**Fecha de Creación**: 2025-01-30  
**Estado**: ✅ Implementado (2025-01-30)  
**Alcance**: Solo theme y botón/switch de tema; cero cambios de lógica o features.

---

## 🎯 Objetivos

1. **Light theme**: Ofrecer un tema claro que respete la identidad visual actual (gradientes, acentos morado/cyan, bordes y cards con el mismo “feel”).
2. **Switch de tema**: Añadir un control (botón o toggle) para alternar entre dark y light.
3. **UX del switch**: Definir dónde colocar el control para que sea visible, accesible y coherente en todas las pantallas.
4. **Consistencia**: No cambiar comportamientos ni flujos; únicamente colores y variables de tema.

---

## 📊 Análisis del Estado Actual

### 2.1 Páginas de la aplicación

| Ruta | Descripción | Uso de tema actual |
|------|-------------|--------------------|
| `/` | Landing (Hero, About, Features, Technology, CTA) | Fondo oscuro `#0E0418`, LiquidBackground con gradientes, texto blanco/gris, bordes `white/10` |
| `/agents` | Lista de agentes | Contenedor `bg-[#0E0418]`, contenido con cards y listas |
| `/agents/new` | Crear agente | Mismo fondo, formulario con AgentEditor |
| `/agents/[agentId]` | Detalle + chat | Sidebar y panel con `bg-[#0E0418]`, bordes `white/10`, acentos `#D365FF` |
| `/auth/login` | Login | Centrado, `bg-[#0E0418]`, Card, TextField, enlaces `#D365FF` |
| `/auth/register` | Registro | Misma estructura que login |

**Resumen**: Todas las páginas asumen fondo oscuro y texto claro. No existe hoy distinción light/dark a nivel de CSS ni de estado.

### 2.2 Sistema de tema actual

- **`app/globals.css`**  
  - **`:root`**: Define paleta YUNI (`--color-bg-primary: #0E0418`, `--color-gradient-start/end`, `--color-purple`, `--color-accent`, etc.) y variables “legacy” (shadcn: `--background`, `--foreground`, `--card`, etc.) en valores **claros** (oklch blancos/grises).  
  - **`@theme`**: Tailwind v4 con `--color-background: #0E0418`, `--color-foreground: #ededed`, etc. (actualmente solo dark).  
  - **`.card`**: Clase fija `background: rgba(255,255,255,0.05)`, `border: 1px solid rgba(255,255,255,0.1)`.  
  - **`.dark`**: Redefine variables legacy a tonos oscuros (oklch).  
  - **Scrollbar**: Colores fijos (`--color-bg-primary`, `--color-purple`, `--color-accent`).

- **`app/layout.tsx`**  
  - `<html lang="en" className="dark">` → tema oscuro forzado.  
  - `<body className="... bg-[#0E0418] text-white">` → fondo y texto hardcodeados.

- **`src/lib/theme.ts`**  
  - Objeto JS con colores solo para dark (bg, gradient, purple, accent, text, border). No se usa en todos los componentes; muchos usan Tailwind directo.

- **Componentes**  
  - Uso mixto: variables CSS, clases Tailwind con colores literales (`bg-[#0E0418]`, `text-white`, `border-white/10`, `text-[#D365FF]`, `bg-white/5`, etc.).  
  - **Inventario aproximado**: ~205 ocurrencias en 38 archivos (bg, text, border con valores fijos).

### 2.3 Paleta actual (dark)

- **Fondo principal**: `#0E0418`
- **Gradientes**: start `#BE6ADC`, end `#64C3D7`
- **Acento**: `#D365FF`
- **Púrpura**: `#784EAB`
- **Grises**: `#333F55`, `#868D99`
- **Bordes**: `rgba(255,255,255,0.1)` / `white/10`
- **Texto**: blanco, `white/70`, `white/60`, etc.
- **Cards/superficies**: `rgba(255,255,255,0.05)`, `white/5`

---

## 🧩 Viabilidad del Light Theme (mismo estilo)

**Conclusión: es viable** mantener el mismo estilo en light.

- **Gradientes**: Los mismos gradientes morado → cyan funcionan sobre fondo claro; basta ajustar contraste (por ejemplo, gradiente un poco más saturado o con opacidad en fondos).
- **Acentos**: `#D365FF` y `#784EAB` son visibles sobre blanco/gris claro; se pueden usar igual o con variantes ligeramente más oscuras para contraste.
- **Cards y bordes**: Sustituir `white/5` y `white/10` por equivalentes “invertidos”: gris muy claro de fondo y borde gris suave (ej. `gray-100`/`gray-200` en Tailwind o variables).
- **Texto**: En light, texto oscuro (`gray-900`/`gray-800`) para principal y grises para secundario.
- **LiquidBackground**: El canvas con colores `#BE6ADC`, `#64C3D7`, `#D365FF` puede mantenerse; en light se puede bajar opacidad o añadir una capa clara encima para no restar legibilidad.
- **Scrollbar**: Definir variantes light en variables (fondo claro, thumb gris/morado).

Recomendación: **centralizar todo en variables CSS** (por ejemplo bajo `[data-theme="light"]` / `[data-theme="dark"]` o `.light` / `.dark`) y que los componentes usen esas variables o clases que las referencien, en lugar de hex/opacidades fijas.

---

## 📍 Ubicación del switch de tema (UX)

Criterios: **visibilidad**, **consistencia** entre páginas y **no entorpecer** acciones principales.

### Opciones evaluadas

| Ubicación | Pros | Contras |
|-----------|------|--------|
| **Navbar (landing) y TopBar (app)** | Siempre visible, asociado a “configuración de experiencia”. Coincide con patrones de muchas apps. | Ninguno relevante si el control es discreto. |
| **Solo en TopBar** | Un solo lugar en app. | En landing y auth no hay TopBar → el usuario no podría cambiar tema hasta entrar a /agents. |
| **Solo en footer** | No compite con la navegación. | Poco visible, no está en vista en scroll corto; en algunas páginas no hay footer (ej. detalle de agente). |
| **En un menú de usuario (dropdown)** | Agrupa con “Cerrar sesión” y posible configuración futura. | Un paso más para cambiar tema; menos descubrible. |
| **En una página “Settings”** | Lógico para opciones. | No existe aún; además el tema es una preferencia de “primera clase” que suele estar en header. |

### Recomendación

- **Landing (`/`)**: Incluir el **switch en la Navbar** (LandingNavbar), a la derecha, antes de los botones “Iniciar sesión” / “Comenzar” (o después del logo a la izquierda, según diseño). Debe ser visible sin scroll.
- **App autenticada** (agents, agent detail, etc.): Incluir el **mismo control en la TopBar**, junto a la navegación y el bloque de usuario (ej. entre “Agentes” y el email / “Cerrar sesión”). Así el usuario ve el switch en cuanto sale del landing.
- **Auth (login/register)**: No mostrar TopBar ni Navbar completa. Opciones:
  - **A)** Añadir una barra mínima (solo logo + switch de tema) en login/register para consistencia y para que el usuario pueda elegir tema antes de entrar.
  - **B)** No poner switch en auth y asumir que el tema se hereda del último elegido (guardado en `localStorage`); al entrar a app o landing sí puede cambiarlo.

Recomendación práctica: **A)** barra mínima en auth con logo + switch, para que la opción de tema exista en todas las rutas y el comportamiento sea predecible.

Resumen de ubicación:

- **Landing**: Navbar (derecha o izquierda, según layout).
- **App (agents, agent detail, etc.)**: TopBar (junto a nav + usuario).
- **Auth**: Barra mínima con logo + switch (mismo componente de switch que en Navbar/TopBar).

El control puede ser un **toggle** (sol/luna) o un **botón cíclico** (dark → light → system si más adelante se añade “system”). Se recomienda icono claro (sol = light, luna = dark) y `aria-label` para accesibilidad.

---

## 🔧 Plan de Ejecución por Fases

### Fase 1: Fundamentos de tema (CSS + estado)

- **Objetivo**: Definir light/dark solo con CSS y estado en cliente, sin tocar lógica de negocio.
- **Tareas**:
  1. En `globals.css`, definir un bloque **light** (por ejemplo `[data-theme="light"]` o `.light` en `html`) con variables para:
     - Fondo principal, foreground, card, bordes, inputs, scrollbar.
     - Misma paleta conceptual (gradientes, acento, purple) adaptada a fondo claro.
  2. Sustituir en `layout.tsx` la clase fija `dark` y los `bg-[#0E0418] text-white` del body por clases que usen variables (ej. `bg-background text-foreground` o clases que dependan de las nuevas variables).
  3. Añadir **ThemeProvider** (React context) que:
     - Lea/guarde preferencia en `localStorage` (ej. `yuni-theme`: `"light"` | `"dark"`).
     - Aplique `data-theme` (o clase) en `document.documentElement`.
     - Exponga `theme` y `setTheme` (o `toggleTheme`) para el switch.
  4. Integrar el provider en `Providers` (o en `layout` si es client) para que el tema se aplique antes del primer paint si es posible (script inline en `head` para evitar flash).
- **Entregables**: Tema light definido a nivel CSS; cambio de tema vía JS que persiste en `localStorage`; ninguna página con comportamiento nuevo, solo colores.

### Fase 2: Migrar componentes a variables de tema

- **Objetivo**: Eliminar colores hardcodeados para que dark y light se comporten bien en todas las pantallas.
- **Tareas**:
  1. Listar todos los archivos con `bg-[#0E0418]`, `text-white`, `border-white/10`, `text-[#D365FF]`, `bg-white/5`, etc. (ya identificados ~38 archivos).
  2. Sustituir por clases Tailwind que usen variables del tema (por ejemplo `bg-background`, `text-foreground`, `border-border`, `text-accent`) o por nuevas utilidades en `globals.css` (ej. `bg-surface`, `text-muted-foreground`) mapeadas en light y dark.
  3. Revisar `theme.ts`: extender con valores light o dejar de usarlo para colores de UI y usar solo CSS variables.
  4. Ajustar `.card` y cualquier otra clase global para que usen variables (card background, card border).
  5. Revisar scrollbar, focus rings y estados hover para ambos temas.
- **Entregables**: Cero (o mínimo) hex/opacidad fija de tema en componentes; mismo aspecto actual en dark; light coherente con el estilo definido.

### Fase 3: Componente switch y ubicación UX

- **Objetivo**: Un solo componente de switch y colocarlo en Navbar, TopBar y (opcional) barra mínima de auth.
- **Tareas**:
  1. Crear componente **ThemeSwitch** (o **ThemeToggle**): icono sol/luna (o un solo icono que cambie), uso de `ThemeProvider`, `aria-label`, y opcionalmente tooltip “Tema claro / Tema oscuro”.
  2. Añadir ThemeSwitch en **LandingNavbar** en la posición acordada.
  3. Añadir ThemeSwitch en **TopBar** junto a la navegación/sesión.
  4. Para auth: añadir barra mínima con logo + ThemeSwitch en layout de login/register o en las propias páginas.
  5. Comprobar que el tema persiste al recargar y al navegar entre landing ↔ app ↔ auth.
- **Entregables**: Switch visible y funcional en todas las rutas definidas; preferencia persistida; sin cambios de funcionalidad.

### Fase 4: Ajustes visuales y detalles

- **Objetivo**: Pulir contraste, accesibilidad y casos borde.
- **Tareas**:
  1. Revisar contraste (WCAG) en light para texto y botones.
  2. Ajustar **LiquidBackground** en light (opacidad o overlay) para que no reste legibilidad.
  3. Revisar modales, dropdowns y popovers si existen (que usen variables de tema).
  4. Probar en móvil que el switch sea táctil y visible.
- **Entregables**: Light theme sin problemas de contraste ni de legibilidad; mismo estilo reconocible.

---

## 📁 Archivos a Tocar (resumen)

| Área | Archivos |
|-----|----------|
| **Tema / layout** | `app/globals.css`, `app/layout.tsx` |
| **Estado de tema** | Nuevo: `src/lib/theme-provider.tsx` (o similar); `src/components/Providers.tsx` |
| **Switch** | Nuevo: `src/components/ThemeSwitch.tsx` |
| **Navegación** | `src/components/landing/Navbar.tsx`, `src/components/TopBar.tsx` |
| **Auth** | `app/auth/login/page.tsx`, `app/auth/register/page.tsx` (o layout compartido para barra mínima) |
| **Páginas** | `app/page.tsx`, `app/agents/page.tsx`, `app/agents/new/page.tsx`, `app/agents/[agentId]/page.tsx` (sustituir clases fijas por variables) |
| **Componentes** | Todos los que tengan `bg-[#...]`, `text-white`, `border-white/...`, `text-[#D365FF]`, etc. (lista en Fase 2) |
| **Utilidad** | `src/lib/theme.ts` (opcional: ampliar o deprecar uso para UI) |

No se modifican: APIs, hooks de datos, lógica de negocio, flujos de auth o de agentes.

---

## ✅ Criterios de Aceptación

- [x] Existe un tema **light** que mantiene el estilo actual (gradientes, acentos, sensación de cards y bordes).
- [x] Existe un **switch** (toggle o botón) para cambiar entre dark y light.
- [x] El switch está en **Navbar** (landing), **TopBar** (app) y en **auth** (barra mínima con logo + switch).
- [x] La preferencia de tema se **persiste** (localStorage, clave `yuni-theme`) y se aplica al cargar la app (script inline anti-flash).
- [x] **Ninguna funcionalidad** existente cambia; solo colores y tema.
- [x] Colores de tema migrados a variables CSS y clases semánticas (`bg-surface`, `border-theme`, `text-theme`, etc.).
- [x] En **dark**, la apariencia actual se mantiene.
- [x] Accesibilidad: switch con `aria-label` y `title` ("Tema claro" / "Tema oscuro").
- [x] **WCAG AA (light theme)**: Contraste ≥4.5:1 texto normal, ≥3:1 texto grande/UI; anillos de foco visibles; mensajes de error/éxito con contraste AA.

---

## ♿ Cumplimiento WCAG AA (Light Theme)

Tras la implementación se realizó una pasada de accesibilidad para que el tema claro cumpla **WCAG 2.x Nivel AA**:

### Contraste (1.4.3)

- **Texto normal**: ≥4.5:1 sobre fondo. En light theme: `--color-foreground` (#1a1a2e), `--color-muted` (#52525b), `--color-muted-strong` (#3f3f46), `--color-accent` (#6d28d9) sobre `--color-background` (#f5f3f9).
- **Texto grande / UI**: Bordes y elementos de interfaz con ≥3:1. `--color-border-theme` (#b8b5c4), `--color-border-theme-strong` (#8b8799).
- **Mensajes de error/éxito**: Variables `--color-error-text` (light: #b91c1c, dark: #f87171) y `--color-success-text` (light: #15803d, dark: #4ade80). Clases `.text-error-theme`, `.text-success-theme`.

### Enfoque visible (2.4.7)

- Variable `--color-focus-ring` (light: #6d28d9, dark: #d365ff). Controles interactivos usan `focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]` para anillo de foco con contraste ≥3:1.
- Utilidad `.focus-ring-theme` disponible para consistencia.

### Componentes actualizados

- TextField, Select, MessageComposer, AgentEditor, AgentContextSection: anillo de foco con `--color-focus-ring`.
- ThemeSwitch, TopBar (botón Cerrar sesión): `focus-visible` con anillo accesible.
- Mensajes de error: `text-error-theme` + `role="alert"` donde corresponde.
- Mensajes de éxito (auth): `text-success-theme` + `role="status"`.
- Texto secundario (carga, descripciones, placeholders): `text-muted-theme` / `text-muted-foreground` en lugar de `text-gray-400`/`text-gray-500` fijos.

---

## 📌 Notas para el Implementador

- **Orden recomendado**: Fase 1 → Fase 2 → Fase 3 → Fase 4. No implementar el switch en todas las páginas antes de tener las variables light listas, para evitar doble trabajo.
- **Flash de tema**: Para evitar parpadeo al cargar, considerar un script pequeño en `layout` que lea `localStorage` y setee `data-theme` antes de pintar (o una clase en el `html` generado por servidor si la preferencia se pudiera pasar por cookie; por simplicidad, suele bastar con aplicar tema en el primer render del provider y aceptar un posible flash mínimo).
- **LiquidBackground**: Si en light molesta, se puede ocultar en `/` para light o reducir opacidad; debe quedar documentado en el código.
- **Idioma**: Mantener español en etiquetas y tooltips del switch (“Tema claro”, “Tema oscuro”) si el resto de la UI está en español.

Este documento es la **referencia de diseño y planificación** para la implementación del light theme. Cualquier duda de alcance debe resolverse a favor de: mismo estilo, solo tema + switch, sin cambios de funcionalidad.
