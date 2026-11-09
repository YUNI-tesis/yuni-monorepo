# Evolución de la landing ligada al scroll

## Status

accepted

## Related plan

Landing pública. Reemplaza la interacción manual de [ADR 0027](0027-landing-architecture-evolution.md) y conserva su contenido: las siete etapas de la sección 5.1 del informe.

## Date

2026-10-05. Revisado el 2026-11-09: el recorrido pasa a siete etapas.

## Context

El equipo pidió recuperar la animación de scroll del HTML de referencia después de integrar la primera versión del timeline.

## Decision

El encabezado permanece en el flujo de la página. El esquema, el relato y los controles quedan fijos bajo la navegación durante un recorrido de un `100svh` por etapa más `20svh` (`720svh` con siete etapas), calculado en CSS con `--stage-count`. La posición de scroll determina la etapa activa en ambos sentidos. Los botones de hitos y anterior/siguiente desplazan al punto correspondiente del mismo recorrido mediante la instancia de Lenis que ya usa la landing, o scroll nativo en dispositivos táctiles.

Los nodos compartidos cambian de posición, los nuevos aparecen con una transición y las conexiones muestran el flujo. Los caminos SVG y los nodos comparten duración y curva de transición.

## UX and accessibility

- El bloque respeta la altura disponible bajo el encabezado. En mobile se compactan los hitos y se priorizan el esquema y la decisión.
- Bajo 700 px de altura o 360 px de ancho, la presentación conserva el relato completo y la selección manual para evitar recortes dentro de un bloque fijo.
- Con movimiento reducido no se crea un tramo extendido de scroll ni se animan los nodos o conexiones.
- Los botones mantienen nombres accesibles, foco y selección. La descripción accesible del esquema incluye las responsabilidades de cada nodo.
- El scroll continúa hacia la siguiente sección al completar el recorrido; no se capturan ni bloquean los eventos de rueda.

## Implementation and validation

Sin dependencias nuevas. La posición se lee como máximo una vez por frame; el estado de React cambia cuando cambia la etapa. Los listeners se retiran al desmontar el componente. La revisión incluye TypeScript, ESLint, las pruebas de la landing (entre ellas `ArchitectureEvolution.test.tsx`) y verificación visual del scroll hacia adelante, hacia atrás y por selección manual, en escritorio y mobile.

## Sources

- HTML de referencia aportado por el equipo: `YUNI Evolución.html`.
- `apps/web/components/landing/ArchitectureEvolution.tsx` y su módulo CSS.
- `useSmoothScroll` en `LandingExperience.tsx`.
- [ADR 0027](0027-landing-architecture-evolution.md), para el contenido de las etapas y sus fuentes.
