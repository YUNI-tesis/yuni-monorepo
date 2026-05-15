# Prompt: Public Avatar UI

Armame un plan específico para la vista pública del avatar.

Rutas:

- `/a/[publicSlug]`
- `/a/[publicSlug]/session`

Objetivo:
Permitir que visitantes vean el avatar compartido e inicien texto o llamada.

Debe incluir:

- fetch de datos públicos
- LiveAvatarStage
- nombre/descripción
- CTA iniciar conversación
- estado link no disponible
- no requiere login

Reglas:

- no mostrar prompts/contexto/documentos
- no mostrar datos del creador
- no permitir sesión si link desactivado

Checklist:

- link activo renderiza avatar
- link desactivado muestra bloqueo
- iniciar sesión navega a `/session`
