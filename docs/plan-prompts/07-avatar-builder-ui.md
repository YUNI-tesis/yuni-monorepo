# Prompt: Avatar Builder UI

Armame un plan específico para la UI de creación de avatares de YUNI.

Objetivo:
Crear `/avatars/new` como wizard simple para configurar un avatar.

Debe incluir:

- ruta `/avatars/new`
- estructura frontend por features:
  - `components/avatar-builder`
  - `hooks/useAvatarBuilder.ts`
  - cliente API reutilizable
- pasos:
  - nombre
  - descripción
  - elegir Live Avatar visual
  - elegir voz
  - instrucciones/persona
  - contexto
  - documentos/filedrop visual
  - review y guardar
- estados de loading/error/success
- redirección al perfil al guardar

Reglas:

- no mostrar texto “Wizard simple”
- no usar “ABM avatar” en UI
- no pedir “nombre visual”; usar el nombre del avatar
- Live Avatar selector usa datos del provider/API
- voice selector debe ser visual y usable
- filedrop puede quedar como shell si ingestión real va en otro módulo

Checklist:

- usuario autenticado puede crear avatar desde UI
- errores de API se muestran
- botón guardar bloquea doble submit
- responsive básico
