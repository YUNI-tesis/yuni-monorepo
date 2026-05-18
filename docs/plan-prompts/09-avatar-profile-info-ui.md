# Prompt: Avatar Profile Info UI

Armame un plan específico para el perfil del avatar, tab Información.

Objetivo:
Mostrar la configuración base del avatar y accesos a editar/interactuar.

Ruta:

- `/avatars/[avatarId]`

Debe incluir:

- layout de perfil con tabs:
  - Información
  - Compartir
- implementar solo tab Información en este módulo
- nombre
- descripción
- Live Avatar seleccionado
- voz
- instrucciones/persona
- contexto
- documentos asociados como lista/shell
- botón editar
- botón interactuar

Reglas:

- Share tab puede quedar placeholder si se implementa en módulo posterior
- no incluir chat ni llamada
- validar ownership vía API
- si avatar no existe o no pertenece al usuario, mostrar error/404 controlado

Checklist:

- perfil carga avatar propio
- muestra información completa
- botón editar navega a `/avatars/[avatarId]/edit`
- botón interactuar navega a `/interact/[avatarId]`
