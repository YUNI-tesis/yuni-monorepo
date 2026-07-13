# Prompt: Public Avatar UI

Armame un plan especifico para la vista publica del avatar compartido.

Rutas:

- `/a/[publicSlug]`
- `/a/[publicSlug]/session`

Objetivo:
Permitir que visitantes vean el avatar compartido, se identifiquen por email e inicien texto o llamada.

Debe incluir:

- fetch de datos publicos
- LiveAvatarStage
- nombre/descripcion
- formulario de email antes de iniciar
- aviso de privacidad: el creador puede ver actividad y transcripts
- CTA iniciar conversacion despues de identificar email
- estado link no disponible
- sugerencia de login si el email corresponde a cuenta existente
- no requiere login para usar link, salvo que el link/grant lo exija en una evolucion posterior

Reglas:

- no mostrar prompts/contexto/documentos
- no mostrar datos privados del creador
- no permitir sesion si link desactivado
- describir al participante como identificado por email
- email debe viajar a la creacion de sesion publica

Checklist:

- link activo renderiza avatar
- link desactivado muestra bloqueo
- email invalido muestra error junto al campo
- iniciar sesion navega a `/session`
- copy deja claro el alcance de visibilidad para el creador
