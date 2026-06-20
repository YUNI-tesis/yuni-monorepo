# Prompt: Avatar Profile Info UI

Armame un plan especifico para el perfil del avatar, empezando por la tab `Informacion`.

Objetivo:
Mostrar la configuracion base del avatar y dejar el perfil preparado para las tabs finales de producto.

Ruta:

- `/avatars/[avatarId]`

Debe incluir:

- layout de perfil con tabs finales:
  - Informacion
  - Contexto
  - Compartir
  - Actividad
- implementar solo tab `Informacion` en este modulo si las demas quedan para planes posteriores
- nombre
- descripcion
- Live Avatar seleccionado
- voz
- instrucciones/persona resumidas
- estado de disponibilidad del avatar en lenguaje de producto
- boton editar para owners
- boton interactuar para owners o usuarios con acceso
- vista compartida segura cuando el avatar fue compartido con el usuario autenticado

Reglas:

- `Contexto`, `Compartir` y `Actividad` pueden quedar placeholders si se implementan despues
- no mostrar Knowledge Base, provider IDs ni detalles tecnicos de sync en la UI normal
- no incluir chat ni llamada
- validar ownership o acceso compartido via API
- si avatar no existe o el usuario no tiene acceso, mostrar error/404 controlado
- no mostrar prompts internos, documentos ni instrucciones completas a usuarios compartidos

Checklist:

- owner carga avatar propio
- usuario con acceso carga vista compartida limitada
- muestra informacion completa para owner
- boton editar navega a `/avatars/[avatarId]/edit` solo si corresponde
- boton interactuar navega a `/interact/[avatarId]`
