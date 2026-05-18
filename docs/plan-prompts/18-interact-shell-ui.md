# Prompt: Interact Shell UI

Armame un plan específico para la shell de Interact.

Objetivo:
Separar interacción del ABM y preparar la UI para conversaciones privadas.

Rutas:

- `/interact`
- `/interact/[avatarId]`

Debe incluir:

- listado/selector de avatares propios
- layout de interacción
- panel lateral preparado para historial
- datos mínimos del avatar
- botón nueva conversación
- botón iniciar llamada como placeholder

Reglas:

- no editar configuración desde Interact
- no implementar chat real si va en otro módulo
- preparado para futuro multiagente/grupos sin implementarlo

Checklist:

- `/interact` lista avatares
- seleccionar avatar navega a `/interact/[avatarId]`
- layout queda listo para conectar conversaciones
