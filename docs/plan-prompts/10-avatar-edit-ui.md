# Prompt: Avatar Edit UI

Armame un plan específico para edición de avatares.

Objetivo:
Crear `/avatars/[avatarId]/edit` para editar identidad, voz, Live Avatar, instrucciones, contexto y documentos.

Debe incluir:

- carga inicial del avatar
- formulario editable
- selector de voz
- selector de Live Avatar visual
- filedrop shell para documentos/contexto
- guardado con `PATCH /avatars/:avatarId`
- estados de loading/error/success
- navegación de regreso al perfil

Reglas:

- no mostrar “ABM avatar”
- no incluir chat ni llamada
- no pedir ownerId al cliente
- no permitir cambiar `mode` ni `sandbox`
- no fallback local

Checklist:

- usuario edita avatar propio
- usuario no edita avatar ajeno
- cambios se reflejan en perfil
