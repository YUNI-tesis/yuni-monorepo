# Auditoría de notificaciones globales

Esta checklist separa resultados transitorios de acciones iniciadas por el usuario de los estados que
deben permanecer junto al contenido afectado. La implementación se considera completa cuando cada fila
queda cubierta por código y pruebas, y las búsquedas finales no encuentran feedback transitorio ad hoc.

| Flujo                      | Acción o estado                                    | Feedback previo                              | Tratamiento objetivo                                                 | Cobertura                  |
| -------------------------- | -------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- | -------------------------- |
| Autenticación              | Login, registro y logout                           | Error inline o sin feedback                  | Toast de éxito/error; preservar sesión si falla logout               | Integración web            |
| Shell                      | Carga de sesión                                    | Texto en header                              | Mantener contextual por ser un estado persistente                    | Prueba de layout existente |
| Avatares                   | Crear o editar                                     | `ErrorState`/texto de éxito antes de navegar | Toast de éxito/error global y persistente entre rutas                | Integración web            |
| Avatares                   | Validación y carga de catálogos                    | Campo o `ErrorState`                         | Mantener inline                                                      | Pruebas existentes         |
| Contexto                   | Guardar texto                                      | Error inline, sin éxito                      | Toast de éxito/error                                                 | Integración web            |
| Documentos                 | Subir uno o varios                                 | Progreso y error por fila                    | Resumen toast; conservar progreso/error por fila                     | Integración web            |
| Documentos                 | Eliminar o reintentar                              | Sin feedback y posible rechazo sin manejar   | Toast de éxito/error; mantener fila si falla                         | Integración web            |
| Compartir                  | Crear, copiar, activar, desactivar o eliminar link | Texto al pie o error de formulario           | Toast de éxito/error                                                 | Integración web            |
| Compartir                  | Slug inválido o duplicado                          | Error de campo/formulario                    | Mantener o mover al campo slug                                       | Pruebas de validación      |
| Accesos                    | Crear, reactivar, revocar o eliminar               | Texto al pie o error de diálogo              | Toast de éxito/error                                                 | Integración web            |
| Accesos                    | Email inválido, propio o duplicado                 | Error de campo/diálogo                       | Mantener ligado al email                                             | Pruebas de validación      |
| Límites                    | Guardar límites                                    | Texto al pie o error de diálogo              | Toast de éxito/error; validación numérica inline                     | Integración web            |
| Compartir                  | Cargar links o accesos                             | `ErrorState` con reintento                   | Mantener persistente                                                 | Pruebas existentes         |
| Grupos                     | Crear, editar o eliminar                           | Error inline o sin éxito                     | Toast de éxito/error                                                 | Integración web            |
| Grupos                     | Cargar grupos o avatares elegibles                 | `ErrorState`/error contextual                | Mantener persistente                                                 | Pruebas existentes         |
| Llamada individual         | Conectar, micrófono, interrumpir o guardar         | Toast local                                  | Toast global de error                                                | Ciclo de vida de llamada   |
| Llamada pública            | Conectar, guardar, cuota o duración                | Toast local/estado visual                    | Toast global de error o warning deduplicado                          | Ciclo de vida público      |
| Llamada grupal             | Operaciones visibles de la llamada                 | Error inline en el dock                      | Toast global de error/warning                                        | Ciclo de vida grupal       |
| Llamada grupal             | Error de participante o historial                  | Tarjeta/panel con reintento                  | Mantener contextual; toast adicional solo para el reintento iniciado | Ciclo de vida grupal       |
| Browser APIs               | Copiar link, reproducir voz o abrir popup          | Texto local o fallo silencioso               | Toast de resultado relevante; sin éxito para navegación/audio        | Integración web            |
| Inputs/archivos            | Formato, tamaño, required y reglas de campos       | Error junto al control                       | Mantener inline                                                      | Pruebas existentes         |
| Listas/actividad/dashboard | Loading, vacío, not-found y error de lectura       | Estados de página/panel                      | Mantener persistente                                                 | Pruebas existentes         |
| Procesos internos          | Heartbeats, telemetría, sincronización y turnos    | Silencioso o error agregado                  | Sin toast de éxito; elevar solo impacto visible agregado             | Ciclo de vida existente    |

## Búsqueda de cierre

- Revisar llamadas mutantes (`POST`, `PATCH`, `DELETE`, uploads y browser APIs) contra esta tabla.
- Revisar `setError`, `setFeedback`, `setSuccess`, `role="alert"`, `aria-live` y usos directos de `Toast`.
- Eliminar estados y estilos dedicados exclusivamente a feedback transitorio; conservar las excepciones
  contextuales registradas arriba.

## Validación ejecutada

- [x] La búsqueda residual deja solo validaciones de campos y estados persistentes/contextuales.
- [x] Pruebas de provider: ARIA, temporizadores, pausa, acción persistente, callbacks, deduplicación,
      reinicio de temporizador, límite de tres y capa superior sobre diálogos.
- [x] Pruebas de interacción: autenticación, avatares, contexto/documentos, compartir/límites, grupos y
      llamadas individuales/grupales.
- [x] Revisión manual desktop y mobile del design system: pila, textos, safe areas, foco, ausencia de
      overflow y superposición sobre un diálogo nativo.
- [x] Tests, typecheck y lint de `@yuni/ui` y `@yuni/web`.
