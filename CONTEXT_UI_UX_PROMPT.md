# Prompt de implementación: Rediseño UI/UX de Contexto y Documentos

**Objetivo:** Un agente de desarrollo debe implementar un cambio profundo en la UI/UX del “contexto” del agente: unificar contexto escrito y documentos en una sola experiencia, priorizar archivos subidos, permitir agregar documentos desde la creación del agente con drag-and-drop, y permitir ver cada documento desde su ítem.

---

## 1. Análisis del estado actual

### 1.1 Estructura actual

- **Página de detalle del agente** (`app/agents/[agentId]/page.tsx`):
  - Sidebar con: nombre, descripción, avatar, Voz, **System Prompt**, **Contexto** (texto), **DocumentsSection** (lista + botón “Subir”), Editar / Eliminar.
  - “Contexto” y “Documentos” son bloques separados; el usuario percibe dos fuentes de conocimiento distintas.

- **Página de crear/editar agente** (`app/agents/new/page.tsx`, `AgentEditor.tsx`):
  - Formulario con: nombre, descripción, System Prompt, **Contexto (Base de conocimiento)** (textarea), Voz.
  - **No hay forma de subir documentos al crear el agente**; solo texto en “Contexto”.

- **DocumentsSection** (`src/components/DocumentsSection.tsx`):
  - Solo en la página de detalle (no en el editor).
  - Input file oculto + botón “Subir”; lista de documentos con estado, acciones Descargar / Procesar / Resumir / Eliminar.
  - No hay drag-and-drop; no hay vista previa / “ver documento” desde el ítem.

### 1.2 Problemas a resolver

1. **Contexto fragmentado:** “Contexto” (texto) y “Documentos” se ven y usan por separado; el usuario quiere **un solo concepto de contexto** (todo lo que el agente usa para responder).
2. **Documentos solo después de crear:** No se pueden agregar archivos al **crear** el agente, solo después en la página de detalle.
3. **Sin drag-and-drop:** La subida es solo mediante clic en “Subir” y selector de archivo; se pide **drag-and-drop** como método principal.
4. **Texto vs archivos:** El contexto escrito será **mínimo o nulo**; **lo principal deben ser los archivos subidos**. La UI debe reflejar esta prioridad (archivos primero, texto complementario).
5. **Ver documento:** Desde cada ítem de documento debe haber una forma clara de **ver el documento subido** (abrir en nueva pestaña, modal con si es posible preview, o descarga según tipo).

---

## 2. Requisitos funcionales y de UX

### 2.1 Un solo bloque “Contexto”

- **Un único bloque “Contexto”** (o “Base de conocimiento”) que contenga:
  - **Archivos subidos** como contenido principal (lista/cards de documentos con drag-and-drop para agregar).
  - **Texto opcional** como complemento (campo pequeño: “Notas adicionales” o “Contexto escrito (opcional)”), colapsable o secundario.
- No debe existir un título “Documentos” separado del “Contexto”; los documentos son **parte del contexto**.
- En la **vista de solo lectura** (detalle del agente): mostrar el mismo bloque unificado (archivos + texto opcional). En **crear/editar**: mismo bloque con capacidad de agregar/quitar archivos y editar texto.

### 2.2 Documentos desde la creación del agente

- En la **página de crear agente** (`/agents/new`), el formulario debe incluir el **mismo bloque de Contexto unificado** con posibilidad de:
  - Arrastrar y soltar archivos (y/o clic para seleccionar).
  - Subir a S3 vía presign/confirm **antes** de crear el agente, o en un flujo “crear agente y luego asociar documentos en el mismo paso”.
- Opción de diseño recomendada: **crear el agente primero** (POST con nombre, descripción, systemPrompt, context opcional) y en la misma pantalla, antes de “Crear Agente”, tener la zona de contexto con drag-and-drop que suba archivos a **borrador** (documentos con `agentId` del agente recién creado). Alternativa: flujo en dos pasos (Paso 1: datos básicos + crear; Paso 2: redirigir a detalle/edición para agregar documentos). La implementación debe elegir uno y mantener coherencia (p. ej. no pedir `agentId` antes de tener agente: o se usa “crear luego agregar en detalle” o un endpoint de “draft” si se implementa).
- En **editar agente** (`AgentEditor` con `agentId`): el bloque Contexto unificado debe estar presente con drag-and-drop y lista de documentos ya subidos.

### 2.3 Drag-and-drop para agregar documentos

- **Zona de drop** siempre visible dentro del bloque Contexto (en crear y en editar/detalle cuando se permite edición):
  - Área con borde punteado o fondo sutil, texto tipo “Arrastra archivos aquí o haz clic para seleccionar”.
  - Aceptar múltiples archivos en un solo drop/selección cuando sea posible.
  - Tipos permitidos: PDF, TXT, DOCX, imágenes (según backend). Mismo criterio que en `DocumentsSection` actual (y validación en front y backend).
  - Tamaño máximo (ej. 20 MB) indicado en la UI y validado.
  - Estados claros: idle, hover/drag-over (highlight), uploading (progreso por archivo si es posible), error (mensaje por archivo o global).
- Mantener el flujo actual de API: `POST /api/documents/presign` → PUT a URL presignada → `POST /api/documents/confirm-upload`. El drag-and-drop solo cambia la forma de elegir archivos, no el backend.

### 2.4 Prioridad visual: archivos primero, texto secundario

- En el bloque Contexto:
  - **Primero:** lista/cards de documentos (título tipo “Archivos del contexto” o integrado en “Contexto”).
  - **Después:** campo de texto opcional, con etiqueta que deje claro que es complementario (ej. “Notas adicionales (opcional)”) y posiblemente colapsable o más pequeño.
- En la vista de detalle (solo lectura), mismo orden: listar documentos como parte del contexto; debajo, el texto opcional si existe.

### 2.5 Ver documento desde cada ítem

- Cada ítem de documento en la lista debe ofrecer una acción explícita **“Ver”** (o icono de ojo / abrir):
  - Comportamiento: obtener URL de descarga (`GET /api/documents/[documentId]/download`) y abrir en nueva pestaña (o, si se implementa, abrir modal con preview para PDF/imagen).
  - Mantener también “Descargar” si se desea (descarga directa con nombre de archivo); “Ver” puede ser “abrir en nueva pestaña” para ver en el navegador.
- En móvil/tablet, el mismo patrón: “Ver” y/o “Descargar” accesible desde el ítem.

### 2.6 Consistencia con el resto de la app

- Tema oscuro existente (`#0E0418`, bordes `white/10`, acentos morados).
- Componentes existentes: `Button`, `fetchWithAuth`, etc.
- Sin eliminar funcionalidad actual: Procesar (ingest), Resumir, Eliminar deben seguir disponibles desde cada ítem (o desde un menú de acciones del ítem).

---

## 3. Especificación técnica para el implementador

### 3.1 Archivos y componentes a tocar/crear

- **AgentEditor** (`src/components/AgentEditor.tsx`):
  - Incluir el bloque “Contexto” unificado:
    - Si `agentId` existe: mostrar lista de documentos del agente + zona de drag-and-drop + campo de texto opcional “Notas adicionales”.
    - Si no existe `agentId` (crear): mostrar zona de drag-and-drop deshabilitada con mensaje “Podrás agregar archivos después de crear el agente”, O implementar flujo en dos pasos (crear → redirigir → misma UI de contexto en detalle/edición). No inventar endpoints; si no hay `agentId`, no se puede llamar a `presign` con `agentId`. Por tanto: en **crear**, la opción segura es no subir documentos hasta tener agente (mostrar mensaje + link “Agregar archivos después de crear”) o un flujo explícito “Paso 2: agregar contexto” tras crear.
  - Reemplazar el textarea actual “Contexto (Base de conocimiento)” por este bloque unificado (archivos + texto opcional).

- **Página de detalle del agente** (`app/agents/[agentId]/page.tsx`):
  - Eliminar la separación “Contexto” (texto) + “DocumentsSection”.
  - Mostrar un **solo bloque “Contexto”** que incluya:
    - Lista de documentos (con “Ver”, Descargar, Procesar, Resumir, Eliminar según estado).
    - Texto opcional (notas) si existe.
  - Si en detalle se permite “editar contexto” sin ir a la pantalla de edición completa, incluir ahí también la zona de drop; si no, al menos “Ver” y acciones desde cada ítem.

- **Nuevo componente recomendado: `ContextBlock` o `AgentContextSection`** (nombre a elección):
  - Props: `agentId?: string`, `readOnly?: boolean`, `contextText?: string`, `onContextTextChange?: (value: string) => void` (para edición).
  - Contenido:
    - Zona de drag-and-drop (si `agentId` y no `readOnly`).
    - Lista de documentos con ítems que incluyan: nombre, estado, **Ver**, Descargar, Procesar/Resumir/Eliminar según corresponda.
    - Campo de texto opcional “Notas adicionales” (solo si no readOnly o mostrando valor en readOnly).
  - Usar `fetchWithAuth` para presign, confirm, list, download; reutilizar lógica actual de `DocumentsSection` pero integrada en este componente.

- **DocumentsSection** actual:
  - Refactorizar: extraer lógica de listado, subida, presign/confirm, ingest, summarize, delete y “Ver”/Descargar en hooks o dentro del nuevo `ContextBlock`; dejar de mostrar “Documentos” como sección aparte. Opcionalmente mantener `DocumentsSection` como wrapper que solo renderiza `ContextBlock` con `agentId` por compatibilidad durante la transición.

### 3.2 Flujo de datos

- **Listar documentos:** `GET /api/agents/[agentId]/documents` (ya existe).
- **Subir:** `POST /api/documents/presign` (body: `agentId`, `filename`, `mimeType`, `sizeBytes`) → PUT a `upload.url` con `upload.headers` → `POST /api/documents/confirm-upload` (body: `documentId`). Mismo flujo para cada archivo en un drop múltiple.
- **Ver documento:** `GET /api/documents/[documentId]/download` → `window.open(url)` o descarga con nombre.
- **Editar contexto escrito:** PATCH del agente con `context` (string). El texto opcional del bloque Contexto se guarda en `agent.context`.

### 3.3 Validación y errores

- Validar tipos MIME y tamaño en el cliente antes de llamar a presign (mostrar error en la zona de drop o debajo).
- Mostrar errores por archivo (fallo en upload o confirm) sin borrar el resto de la lista.
- Mantener estados de documento (PENDING, UPLOADING, UPLOADED, INGESTING, READY, FAILED) en la UI con badges o iconos consistentes con el diseño actual.

### 3.4 Accesibilidad y UX

- Zona de drop con `role="button"` o equivalente y soporte de teclado (Enter/Space para abrir selector).
- Mensajes de error asociados a la zona de drop o a cada ítem.
- En cada ítem de documento, botón “Ver” con etiqueta clara (aria-label o texto visible).

---

## 4. Criterios de aceptación (resumen)

- [ ] Existe un **único bloque “Contexto”** que integra archivos + texto opcional (no dos secciones separadas “Contexto” y “Documentos”).
- [ ] En **crear agente** se explica que los archivos se agregan después de crear, O se implementa un flujo en dos pasos con la misma UI de contexto tras crear; en **editar agente** sí se pueden agregar documentos con drag-and-drop.
- [ ] **Drag-and-drop** funcional para agregar documentos (y opción de clic para seleccionar) en la zona de contexto cuando hay `agentId`.
- [ ] La **prioridad visual** es: primero lista de documentos, después texto opcional (notas).
- [ ] Cada ítem de documento tiene acción **“Ver”** (abrir en nueva pestaña o preview) además de Descargar/Eliminar y, según estado, Procesar/Resumir.
- [ ] Estilos y componentes coherentes con el tema oscuro y el resto de la app.
- [ ] No se elimina funcionalidad existente (ingest, resumen, eliminación); solo se reorganiza y mejora la UX.

---

## 5. Notas para el implementador

- **Backend:** No es necesario cambiar APIs; solo usar correctamente `presign`, `confirm-upload`, `GET documents`, `download`, `ingest`, `summarize`, `DELETE`.
- **Crear agente sin agentId:** No llamar a presign sin `agentId`; el flujo “agregar documentos después de crear” es válido y evita complejidad de drafts.
- **Idioma:** Mantener español en etiquetas y mensajes (“Contexto”, “Ver”, “Notas adicionales”, “Arrastra archivos aquí”, etc.).
- Este documento es la **única fuente de verdad** para este rediseño; cualquier duda de alcance debe resolverse a favor de un único bloque Contexto, documentos como prioridad y “Ver” desde cada ítem.
