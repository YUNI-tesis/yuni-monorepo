# Evolución de la arquitectura en la landing

## Status

accepted

El contenido sigue vigente. La interacción manual de la primera versión se reemplazó por el recorrido ligado al scroll de [ADR 0028](0028-landing-evolution-scroll.md).

## Related plan

Landing pública; estado registrado en [el índice de planes](../../plan-prompts/README.md).

## Date

2026-10-05. Revisado el 2026-11-09 para alinearlo con el informe.

## Context

La landing mostraba la arquitectura actual, pero no las iteraciones que la hicieron posible durante la tesis. La primera versión (5 de octubre) tomó como referencia un HTML del equipo y contaba seis etapas. Después, la sección 5.1 del informe («Evolución de la arquitectura») y sus Figuras 6 a 12 fijaron la versión final de esa historia: siete etapas, cada una motivada por una limitación de la anterior. La primera versión de la landing la contradecía en tres puntos: le faltaba la etapa del primer conocimiento propio, ordenaba el conocimiento después del avatar en vivo y no mostraba el servidor WebSocket ni su retiro.

## Options considered

- Mantener la síntesis propia de la landing: más breve, pero contradice al informe, que es la fuente que leen los evaluadores.
- Contar en la landing las mismas siete etapas del informe, con esquemas simplificados de sus figuras.

## Decision

La subsección presenta las siete etapas de 5.1, con sus nombres y en el mismo orden: primer circuito de voz, conversación en tiempo real, primer conocimiento propio, primer rostro, avatar en vivo, conversación delegada y conocimiento en el proveedor, y conversación grupal.

Cada etapa combina una pregunta, la decisión, lo aprendido y un esquema. El esquema reproduce los componentes y las conexiones de su figura (6 a 12):

- tres zonas: navegador, servidores de YUNI y proveedores externos;
- tres tipos de conexión: audio y video, pedidos y datos, y sincronización en segundo plano;
- la marca «nuevo» en lo que se suma en esa etapa, y la lista de lo que deja de usarse (el servidor WebSocket y la búsqueda propia, en la sexta).

Las fechas salen del cronograma ejecutado (Figura 4) y describen adopciones en YUNI, no lanzamientos de los proveedores. La sección cierra con el criterio que el informe extrae del recorrido: YUNI delega lo que ocurre en tiempo real y conserva la configuración, los documentos originales, los permisos y el historial.

No se publican cifras de latencia, costos, comparaciones comerciales ni resultados de aprendizaje.

## Rationale

La landing y el informe cuentan la misma historia a públicos distintos; si difieren, uno de los dos parece equivocado. Tomar el informe como fuente evita esa duda y deja una sola versión que mantener.

## Implementation notes

- `evolution-content.ts` guarda el contenido: etapas, nodos con zona y fila, conexiones con tipo y rótulo, y lo que se retira. El total de etapas sale de la lista; ningún «06» o «seis» queda fijo en el código ni en el CSS (`--stage-count`).
- `ArchitectureEvolution.tsx` dibuja las zonas, los nodos y las conexiones. Las conexiones dentro de una zona son rectas; la de LiveAvatar con ElevenLabs en la etapa grupal rodea la columna para no cruzar el nodo de OpenAI.
- La descripción accesible de cada esquema nombra zonas, componentes nuevos, conexiones con su rótulo y lo que se retira.
- Se reutilizan los tokens de la landing y las fuentes Syne/Manrope, con temas claro y oscuro.
- `content.ts`: la capacidad «Contexto documental» ya no dice «conocimiento propio», porque desde la sexta etapa el conocimiento vive en la base del proveedor.
- Sin nuevas dependencias, llamadas a proveedores ni cambios en el circuito de voz.

## User/product impact

La landing permite recorrer la evolución con las mismas etapas y componentes que el informe. Los esquemas son explicativos; no representan una llamada real ni una medición de rendimiento.

## Cost/UX/security tradeoffs

Siete esquemas con hasta siete nodos son más densos que los de la primera versión. En celular se ocultan los detalles de cada nodo y las zonas usan rótulos cortos.

## Sources

- Informe de tesis, sección 5.1 y Figuras 6 a 12; fuentes de las figuras en `docs/thesis/v1-4/arquitectura/generar_etapas.py`.
- Cronograma ejecutado (Figura 4 del informe).
- Historial del monorepo: `2579471b` (primer MVP), `4ee814e8` (Realtime), `91854b5e`, `e4e827ab` y `eaa953ff` (3D y lip-sync), `749009fe` (LiveAvatar).
- [ADR 0002: ElevenLabs-first](0002-plan-24a-elevenlabs-first-mvp-option.md).
- [ADR 0004: llamada individual](0004-elevenlabs-liveavatar-private-call-mvp.md).
- [ADR 0007: sincronización de conocimiento](0007-elevenlabs-knowledge-base-context-sync.md).
- [ADR 0018: agentes atómicos](0018-atomic-elevenlabs-group-agents.md).
- [ADR 0019: sesiones grupales independientes](0019-strict-floor-independent-liveavatar-group-sessions.md).
- [ADR 0021](0021-retire-unused-realtime-service.md), retiro del servidor WebSocket, y [ADR 0026](0026-user-preemptible-group-call-floor.md), interrupción de la persona en la llamada grupal.

## Validation

TypeScript y ESLint de `@yuni/web`. `ArchitectureEvolution.test.tsx` comprueba que las etapas coinciden con las del informe, que cada conexión une componentes existentes, que la sexta etapa retira el servidor WebSocket y la búsqueda propia, y el recorrido con la línea de tiempo y las flechas. Revisión visual en local de las siete etapas, en temas claro y oscuro, en escritorio y celular, y con movimiento reducido.

## Evidence to collect later

La validación de esta subsección corresponde a presentación e interacción. No agrega evidencia sobre desempeño de llamadas ni aceptación con usuarios.
