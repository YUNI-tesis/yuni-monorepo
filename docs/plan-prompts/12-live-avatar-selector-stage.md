# Prompt: Live Avatar Selector Y Stage

Armame un plan específico para los componentes frontend de Live Avatar.

Objetivo:
Permitir seleccionar un avatar visual y renderizar el stage de Live Avatar en builder, perfil, interact y público.

Debe incluir:

- `LiveAvatarSelector`
- `LiveAvatarStage`
- `useLiveAvatarSession`
- estados loading/error/empty
- thumbnail/displayName
- integración con `GET /live-avatar/avatars`

Reglas:

- no usar assets locales
- no usar fallback 3D
- no guardar GLB ni modelos
- si Live Avatar falla, mostrar error controlado
- mode/sandbox no son configurables en UI

Checklist:

- builder puede seleccionar avatar visual
- perfil muestra avatar visual
- stage soporta errores sin romper página
