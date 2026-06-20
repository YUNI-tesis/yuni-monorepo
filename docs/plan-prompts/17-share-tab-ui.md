# Prompt: Avatar Share Tab UI

Armame un plan especifico para la tab `Compartir` del perfil del avatar.

Objetivo:
Permitir que el owner gestione links publicos con email obligatorio e invitaciones/accesos por email o cuenta.

Ruta:

- `/avatars/[avatarId]`, tab `Compartir`

Debe incluir:

- lista/tabla de links publicos
- crear nuevo link
- copiar link
- preview publico
- activar/desactivar link
- eliminar link
- lista/tabla de invitaciones o accesos directos
- agregar email invitado
- mostrar estado de invitacion/acceso:
  - pendiente
  - vinculado a cuenta
  - revocado
- revocar acceso
- empty/loading/error states
- aviso claro de privacidad: el creador puede ver actividad y transcripts de usos compartidos

Reglas:

- Share vive dentro del perfil del avatar
- no mezclar con Interact
- metricas, transcripts y progreso viven en la tab `Actividad`, no en `Compartir`
- no mostrar prompts/contexto/documentos al publico ni a usuarios compartidos
- no implementar llamadas publicas en esta tab
- todo link publico debe pedir email antes de iniciar sesion

Checklist:

- creador gestiona links publicos
- creador gestiona invitaciones/accesos por email
- copiar link funciona
- link desactivado muestra estado claro
- acceso revocado impide nuevas sesiones
