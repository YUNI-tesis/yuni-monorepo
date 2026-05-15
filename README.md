# YUNI

Base limpia del monorepo de YUNI.

## Requisitos

- Node.js 20+
- pnpm 10.8.1+
- Docker + Docker Compose para PostgreSQL local

## Instalacion

```bash
pnpm install
cp .env.example .env.local
pnpm db:up
pnpm db:migrate:dev
pnpm db:seed
```

## Scripts

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:realtime
pnpm dev:worker
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:up
pnpm db:up:test
pnpm db:down
pnpm db:down:volumes
pnpm db:migrate:dev
pnpm db:seed
pnpm db:reset
```

## Base De Datos Local

YUNI usa PostgreSQL local con Docker Compose.

```bash
pnpm db:up
```

Levanta `postgres` en `localhost:5432` con:

```txt
DATABASE_URL=postgresql://yuni:yuni@localhost:5432/yuni_dev?schema=public
```

Para una DB efimera de test:

```bash
pnpm db:up:test
```

Disponible en:

```txt
TEST_DATABASE_URL=postgresql://yuni:yuni@localhost:5433/yuni_test?schema=public
```

Para reiniciar la DB de desarrollo desde migraciones y seed:

```bash
pnpm db:reset
```

Para apagar servicios:

```bash
pnpm db:down
```

Para borrar tambien el volumen persistente de desarrollo:

```bash
pnpm db:down:volumes
```

## Estructura

```txt
apps/
  web/        Next.js App Router
  api/        API HTTP principal
  realtime/   WebSocket server
  worker/     Procesos async

packages/
  db/
  domain/
  config/
  ui/
  ai/
  voice/
  avatars/
  storage/
  observability/
```

Esta fase no implementa producto. Solo deja una base modular para construir YUNI por partes.
