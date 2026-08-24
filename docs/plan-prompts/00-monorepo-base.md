# Prompt: Monorepo Base Desde Cero

> Estado actual: la estructura evolucionó. `apps/realtime` fue retirado el 2026-08-24 porque el
> frontend se conecta directamente a los providers de voz mediante tokens efímeros emitidos por la
> API. Ver decision record `0021`.

Armame un plan detallado para configurar desde cero el monorepo de YUNI.

Objetivo:
Crear una base limpia, mantenible y modular para apps y packages.

Stack deseado:

- pnpm workspace
- TypeScript strict
- Next.js App Router para web
- API separada
- Realtime separado
- Worker separado
- Packages internos compartidos

Estructura objetivo:

- apps/web
- apps/api
- apps/realtime
- apps/worker
- packages/db
- packages/domain
- packages/config
- packages/ui
- packages/ai
- packages/voice
- packages/avatars
- packages/storage
- packages/observability

El plan debe incluir:

- estructura de carpetas
- scripts raíz
- tsconfig base
- lint/format
- estrategia de imports internos
- convenciones de nombres
- qué NO implementar todavía
- checklist de aceptación

Reglas:

- preservar `.git`
- borrar código legacy antes de crear la base nueva
- un solo lockfile
- no usar Turborepo todavía
- no implementar producto todavía
