# Prompt: App Shell Navigation E Inicio

Estado: implementado el 2026-06-21. El alcance final se resolvio con `/dashboard` como pantalla privada principal, `/` publica con CTA a dashboard, navegacion privada `Dashboard` + `Mis avatares`, filtros de avatares y `Interactuar` como accion contextual.

Armame un plan especifico para hacer YUNI navegable como una aplicacion privada coherente.

Objetivo:
Agregar una app shell privada y ordenar la navegacion final alrededor de `Inicio` y `Mis avatares`.

Contexto:

- Hoy existen rutas de auth, dashboard, crear avatar, perfil de avatar, editar avatar e Interact parcial.
- La direccion de producto vigente esta en `0009-product-navigation-sharing-background-sync.md`.
- `Mis avatares` es la pantalla principal para avatares propios y compartidos.
- `Interactuar` es una accion contextual desde un avatar, no una tab principal obligatoria.

Debe incluir:

- shell privada reusable para rutas autenticadas
- navegacion principal con accesos a:
  - Inicio
  - Mis avatares
  - Crear avatar como accion primaria o secundaria, no como tab equivalente
- Inicio con resumen operativo:
  - avatares recientes
  - actividad reciente
  - contexto/documentos con problemas visibles
  - links o accesos compartidos activos
  - acciones claras para crear avatar y abrir Mis avatares
- Mis avatares como destino principal:
  - filtros `Todos`, `Propios`, `Compartidos conmigo`
  - cards/lista con acciones segun permiso
  - `Interactuar` navega a `/interact/[avatarId]`
- links coherentes desde perfil y edicion
- placeholders controlados para tabs futuras de perfil o actividad
- responsive basico
- tests de navegacion/render cuando aplique

Reglas:

- no implementar chat real
- no implementar share real en este modulo
- no implementar voz real en este modulo
- no cambiar contratos de API salvo que sea imprescindible
- no exponer rutas privadas a usuarios sin sesion
- mantener el estilo del design system existente
- no mostrar `Interact` como nav principal si no es necesario para debug/demo

Checklist:

- el usuario puede navegar la app privada sin escribir paths manualmente
- Inicio muestra acciones utiles y alertas accionables, no solo datos de sesion
- Mis avatares contempla propios y compartidos
- `Interactuar` tiene una ruta destino coherente con `/interact/[avatarId]`
- auth/proxy sigue protegiendo rutas privadas
