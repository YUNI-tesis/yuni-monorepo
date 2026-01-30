# Plan de Unificación de Schemas de Prisma

**Objetivo**: Consolidar los dos schemas de Prisma separados (`apps/web/prisma` y `apps/agent/prisma`) en un paquete compartido `packages/database` para eliminar duplicación, simplificar mantenimiento y establecer una arquitectura de monorepo profesional.

**Prioridad**: Media  
**Esfuerzo Estimado**: 2-3 horas  
**Riesgo**: Medio (requiere cambios en múltiples archivos e imports)  
**Fecha de Creación**: 2025-01-30

---

## 📋 Tabla de Contenidos

1. [Contexto y Motivación](#contexto-y-motivación)
2. [Estado Actual](#estado-actual)
3. [Arquitectura Objetivo](#arquitectura-objetivo)
4. [Plan de Implementación Paso a Paso](#plan-de-implementación-paso-a-paso)
5. [Validación y Testing](#validación-y-testing)
6. [Plan de Rollback](#plan-de-rollback)
7. [Checklist de Implementación](#checklist-de-implementación)

---

## 🎯 Contexto y Motivación

### Problema Actual

El proyecto tiene **2 schemas de Prisma duplicados**:

1. **`apps/web/prisma/schema.prisma`** (138 líneas)
   - Contiene todos los modelos: User, Agent, Conversation, Message, Transcript, Document, DocumentChunk
   - Tiene las migraciones de la base de datos
   - Es el schema "completo"

2. **`apps/agent/prisma/schema.prisma`** (79 líneas)
   - Contiene solo: Agent, Document, DocumentChunk
   - NO tiene las migraciones
   - Es un subconjunto del schema de web

### Problemas que Causa

- ❌ **Duplicación de código**: Los modelos Agent, Document, DocumentChunk están duplicados
- ❌ **Mantenimiento doble**: Cambios en estos modelos deben hacerse en 2 lugares
- ❌ **Riesgo de inconsistencias**: Fácil olvidar actualizar uno de los dos schemas
- ❌ **Generación duplicada**: Necesitas correr `prisma generate` en ambas apps
- ❌ **No escala**: Si agregas más apps, necesitarías más schemas duplicados

### Beneficios de Unificar

- ✅ **Single source of truth**: Un solo schema, una sola fuente de verdad
- ✅ **Mantenimiento simplificado**: Cambios en un solo lugar
- ✅ **Arquitectura profesional**: Patrón usado en monorepos modernos (Turborepo, Nx, etc.)
- ✅ **Escalabilidad**: Fácil agregar más apps o servicios
- ✅ **Developer Experience**: Menos comandos, menos confusión
- ✅ **Type Safety**: Los tipos de Prisma están centralizados

---

## 📊 Estado Actual

### Estructura de Archivos

```
yuni-ai/
├── apps/
│   ├── web/
│   │   ├── prisma/
│   │   │   ├── schema.prisma (COMPLETO - 138 líneas)
│   │   │   ├── migrations/ (TIENE MIGRACIONES)
│   │   │   └── seed.ts
│   │   ├── src/lib/prisma.ts (exporta singleton)
│   │   └── package.json (tiene @prisma/client + prisma)
│   └── agent/
│       ├── prisma/
│       │   └── schema.prisma (PARCIAL - 79 líneas)
│       ├── tools/retrieval.ts (usa PrismaClient inline)
│       └── package.json (tiene @prisma/client + prisma)
└── pnpm-workspace.yaml (solo "apps/*")
```

### Archivos que Usan Prisma

**En `apps/web/`** (13 archivos):
- `src/lib/prisma.ts` - Singleton de PrismaClient
- `src/lib/retrieval.ts` - RAG queries
- `src/lib/auth.ts` - Autenticación
- `src/lib/storage.ts` - Storage operations
- `app/api/documents/**/*.ts` - Document APIs (7 archivos)
- `app/api/agents/**/*.ts` - Agent APIs
- `app/api/debug/**/*.ts` - Debug endpoints
- `prisma/seed.ts` - Database seeding
- `server/ws-server.ts` - WebSocket server

**En `apps/agent/`** (1 archivo):
- `tools/retrieval.ts` - Solo queries a Document y DocumentChunk

### Comandos Actuales

```bash
# Web
cd apps/web
pnpm db:generate  # Genera PrismaClient
pnpm db:migrate   # Corre migraciones
pnpm db:push      # Push schema a DB
pnpm db:studio    # Abre Prisma Studio

# Agent
cd apps/agent
pnpm db:generate  # Genera PrismaClient (duplicado)
```

---

## 🏗️ Arquitectura Objetivo

### Nueva Estructura

```
yuni-ai/
├── packages/
│   └── database/
│       ├── package.json
│       ├── tsconfig.json
│       ├── prisma/
│       │   ├── schema.prisma (schema completo movido de web)
│       │   ├── migrations/ (migraciones movidas de web)
│       │   └── seed.ts (seed movido de web)
│       └── src/
│           └── index.ts (exporta prisma singleton + tipos)
├── apps/
│   ├── web/
│   │   ├── ❌ prisma/ (ELIMINADO)
│   │   ├── src/lib/prisma.ts (ELIMINADO - usa @yuni/database)
│   │   └── package.json (depende de "@yuni/database")
│   └── agent/
│       ├── ❌ prisma/ (ELIMINADO)
│       ├── tools/retrieval.ts (usa @yuni/database)
│       └── package.json (depende de "@yuni/database")
└── pnpm-workspace.yaml (actualizado con "packages/*")
```

### Imports Después de la Migración

**Antes**:
```typescript
// apps/web/src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

// apps/agent/tools/retrieval.ts
import { PrismaClient } from "@prisma/client";
```

**Después**:
```typescript
// Cualquier app
import { prisma, Agent, Document, DocumentChunk } from "@yuni/database";
```

---

## 🚀 Plan de Implementación Paso a Paso

### Pre-requisitos

- [ ] Asegurarse de que no hay cambios sin commitear
- [ ] Crear backup de la base de datos (opcional pero recomendado)
- [ ] Verificar que ambas apps corren correctamente antes de empezar

```bash
# Verificar estado limpio
git status

# Backup DB (opcional)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

### PASO 1: Crear Estructura del Paquete Database

**Tiempo estimado**: 10 minutos

#### 1.1. Crear directorios

```bash
mkdir -p packages/database/src
mkdir -p packages/database/prisma
```

#### 1.2. Crear `packages/database/package.json`

```json
{
  "name": "@yuni/database",
  "version": "1.0.0",
  "description": "Shared Prisma client and database utilities for Yuni AI",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "tsx": "^4.19.2",
    "@types/node": "^20"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

#### 1.3. Crear `packages/database/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*", "prisma/**/*"],
  "exclude": ["node_modules"]
}
```

---

### PASO 2: Mover Schema y Migraciones

**Tiempo estimado**: 5 minutos

#### 2.1. Copiar schema completo de web

```bash
cp apps/web/prisma/schema.prisma packages/database/prisma/schema.prisma
```

#### 2.2. Copiar migraciones

```bash
cp -r apps/web/prisma/migrations packages/database/prisma/
```

#### 2.3. Copiar seed file

```bash
cp apps/web/prisma/seed.ts packages/database/prisma/seed.ts
```

#### 2.4. Actualizar imports en seed.ts

**Antes** (`apps/web/prisma/seed.ts`):
```typescript
import { PrismaClient } from "@prisma/client";
```

**Después** (`packages/database/prisma/seed.ts`):
```typescript
import { PrismaClient } from "@prisma/client";
// No cambia porque estamos en el mismo package
```

---

### PASO 3: Crear Entry Point del Paquete

**Tiempo estimado**: 5 minutos

#### 3.1. Crear `packages/database/src/index.ts`

```typescript
// Re-export PrismaClient and all generated types
export * from "@prisma/client";

// Create and export prisma singleton instance
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

---

### PASO 4: Actualizar pnpm Workspace

**Tiempo estimado**: 2 minutos

#### 4.1. Actualizar `pnpm-workspace.yaml`

**Antes**:
```yaml
packages:
  - "apps/*"
```

**Después**:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

### PASO 5: Generar Prisma Client en Database Package

**Tiempo estimado**: 3 minutos

```bash
cd packages/database
pnpm install
pnpm db:generate
```

**Validación**: Verificar que `node_modules/@prisma/client` existe en `packages/database/`

---

### PASO 6: Actualizar Apps para Usar @yuni/database

**Tiempo estimado**: 15 minutos

#### 6.1. Actualizar `apps/web/package.json`

**Agregar dependencia**:
```json
{
  "dependencies": {
    "@yuni/database": "workspace:*",
    // ... otras dependencias
  }
}
```

**Actualizar scripts** (eliminar comandos de prisma):
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    // ELIMINAR: "db:generate", "db:push", "db:migrate", "db:studio"
  }
}
```

#### 6.2. Actualizar `apps/agent/package.json`

**Agregar dependencia**:
```json
{
  "dependencies": {
    "@yuni/database": "workspace:*",
    // ... otras dependencias
  }
}
```

**Actualizar scripts** (eliminar comando de prisma):
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    // ELIMINAR: "db:generate"
  }
}
```

#### 6.3. Instalar dependencias

```bash
# Desde la raíz
pnpm install
```

---

### PASO 7: Actualizar Imports en Web App

**Tiempo estimado**: 10 minutos

#### 7.1. Eliminar `apps/web/src/lib/prisma.ts`

```bash
rm apps/web/src/lib/prisma.ts
```

#### 7.2. Actualizar archivos que importan desde `@/lib/prisma`

**Archivos a actualizar** (13 archivos):

1. `apps/web/src/lib/retrieval.ts`
2. `apps/web/src/lib/auth.ts`
3. `apps/web/src/lib/storage.ts`
4. `apps/web/app/api/documents/[documentId]/ingest/route.ts`
5. `apps/web/app/api/documents/[documentId]/summarize/route.ts`
6. `apps/web/app/api/documents/[documentId]/route.ts`
7. `apps/web/app/api/documents/[documentId]/download/route.ts`
8. `apps/web/app/api/documents/confirm-upload/route.ts`
9. `apps/web/app/api/documents/presign/route.ts`
10. `apps/web/app/api/agents/[agentId]/documents/route.ts`
11. `apps/web/app/api/debug/documents/route.ts`
12. `apps/web/server/ws-server.ts`

**Cambio a realizar**:

**Antes**:
```typescript
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client"; // si existe
```

**Después**:
```typescript
import { prisma, Prisma } from "@yuni/database";
```

#### 7.3. Script para automatizar (OPCIONAL)

```bash
# Buscar todos los archivos que importan desde @/lib/prisma
rg "from ['\"]@/lib/prisma['\"]" apps/web --files-with-matches

# Reemplazar automáticamente (CUIDADO: revisar después)
find apps/web -name "*.ts" -type f -exec sed -i '' \
  's/import { prisma } from "@\/lib\/prisma"/import { prisma } from "@yuni\/database"/g' {} \;
```

---

### PASO 8: Actualizar Imports en Agent App

**Tiempo estimado**: 5 minutos

#### 8.1. Actualizar `apps/agent/tools/retrieval.ts`

**Antes** (líneas 1-13):
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Después**:
```typescript
import { prisma } from "@yuni/database";
```

**Eliminar**: Las líneas 1-13 (creación del singleton)

---

### PASO 9: Limpiar Archivos Obsoletos

**Tiempo estimado**: 5 minutos

#### 9.1. Eliminar prisma folders de apps

```bash
# IMPORTANTE: Verificar primero que todo funciona antes de borrar
rm -rf apps/web/prisma
rm -rf apps/agent/prisma
```

#### 9.2. Eliminar dependencias de Prisma en apps

**En `apps/web/package.json`**, ELIMINAR:
```json
{
  "dependencies": {
    "@prisma/client": "^5.22.0"  // ELIMINAR
  },
  "devDependencies": {
    "prisma": "^5.20.0"  // ELIMINAR
  }
}
```

**En `apps/agent/package.json`**, ELIMINAR:
```json
{
  "dependencies": {
    "@prisma/client": "^5.20.0"  // ELIMINAR
  },
  "devDependencies": {
    "prisma": "^5.20.0"  // ELIMINAR
  }
}
```

#### 9.3. Reinstalar dependencias

```bash
# Desde la raíz
pnpm install
```

---

### PASO 10: Actualizar Scripts en Root Package.json

**Tiempo estimado**: 3 minutos

#### 10.1. Actualizar `package.json` en la raíz

**Agregar scripts de database**:
```json
{
  "scripts": {
    "dev": "pnpm -r dev",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "db:generate": "pnpm --filter @yuni/database db:generate",
    "db:push": "pnpm --filter @yuni/database db:push",
    "db:migrate": "pnpm --filter @yuni/database db:migrate",
    "db:studio": "pnpm --filter @yuni/database db:studio",
    "db:seed": "pnpm --filter @yuni/database db:seed"
  }
}
```

---

### PASO 11: Actualizar Build Scripts (Next.js)

**Tiempo estimado**: 3 minutos

#### 11.1. Actualizar `apps/web/package.json` build script

**Antes**:
```json
{
  "scripts": {
    "build": "dotenv -e .env.local --expand -- prisma generate && next build"
  }
}
```

**Después**:
```json
{
  "scripts": {
    "build": "next build"
  }
}
```

**Nota**: El `prisma generate` se debe correr desde el paquete `@yuni/database` antes de hacer build.

#### 11.2. Actualizar build workflow (si existe CI/CD)

Si tienes GitHub Actions o similar, actualizar:

**Antes**:
```yaml
- run: cd apps/web && pnpm db:generate
- run: cd apps/web && pnpm build
```

**Después**:
```yaml
- run: pnpm db:generate  # Desde la raíz
- run: cd apps/web && pnpm build
```

---

## ✅ Validación y Testing

### Test 1: Verificar que Prisma Client se Generó Correctamente

```bash
# Verificar que el paquete database tiene PrismaClient generado
ls packages/database/node_modules/@prisma/client

# Debería mostrar:
# - index.d.ts
# - index.js
# - package.json
# - schema.prisma
```

**✅ Pasa si**: Los archivos existen  
**❌ Falla si**: No existe la carpeta o está vacía

---

### Test 2: Verificar Imports en Web App

```bash
# Verificar que NO quedan imports del viejo prisma
rg "from ['\"]@/lib/prisma['\"]" apps/web

# Expected: No results found
```

**✅ Pasa si**: No hay resultados  
**❌ Falla si**: Encuentra archivos con el viejo import

---

### Test 3: Verificar Imports en Agent App

```bash
# Verificar que usa el nuevo import
rg "from ['\"]@yuni/database['\"]" apps/agent/tools/retrieval.ts

# Expected: import { prisma } from "@yuni/database";
```

**✅ Pasa si**: Encuentra el import  
**❌ Falla si**: No encuentra o tiene otro import

---

### Test 4: Compilación TypeScript

```bash
# Web app
cd apps/web
pnpm tsc --noEmit

# Agent app
cd apps/agent
pnpm tsc --noEmit
```

**✅ Pasa si**: No hay errores de TypeScript  
**❌ Falla si**: Hay errores de tipos o módulos no encontrados

---

### Test 5: Levantar Web App

```bash
cd apps/web
pnpm dev
```

**Verificar**:
1. La app levanta sin errores
2. Abrir http://localhost:3000
3. Login funciona (prueba conexión a DB)
4. Crear un agente funciona
5. Subir un documento funciona

**✅ Pasa si**: Todo funciona sin errores de Prisma  
**❌ Falla si**: Hay errores de módulos no encontrados o conexión a DB

---

### Test 6: Levantar Agent App

```bash
cd apps/agent
pnpm dev
```

**Verificar en logs**:
```
[RAG] Found X document summaries
[RAG] Found Y relevant chunks
```

**✅ Pasa si**: La app levanta y hace queries sin errores  
**❌ Falla si**: Hay errores de PrismaClient o módulos no encontrados

---

### Test 7: Prisma Studio

```bash
# Desde la raíz
pnpm db:studio
```

**Verificar**:
1. Prisma Studio abre en http://localhost:5555
2. Puedes ver todas las tablas (users, agents, documents, etc.)
3. Puedes hacer queries

**✅ Pasa si**: Studio funciona correctamente  
**❌ Falla si**: No encuentra el schema o hay errores de conexión

---

### Test 8: Database Operations (End-to-End)

```bash
# Test completo de CRUD
```

1. **Create**: Subir un nuevo documento via UI
2. **Read**: Hacer una query que use RAG
3. **Update**: Editar un agente
4. **Delete**: Eliminar un documento

**✅ Pasa si**: Todas las operaciones funcionan  
**❌ Falla si**: Alguna operación falla o da error de Prisma

---

### Test 9: Verificar que NO hay Prisma Clients Duplicados

```bash
# Verificar que apps NO tienen @prisma/client
ls apps/web/node_modules/@prisma/client 2>/dev/null
ls apps/agent/node_modules/@prisma/client 2>/dev/null

# Expected: No such file or directory
```

**✅ Pasa si**: Las carpetas NO existen  
**❌ Falla si**: Las carpetas existen (significa que no se eliminó correctamente)

---

### Test 10: Verificar Scripts en Root

```bash
# Test que los scripts funcionan desde la raíz
pnpm db:generate
pnpm db:studio &  # Background
sleep 3
curl http://localhost:5555
kill %1  # Kill prisma studio
```

**✅ Pasa si**: Los comandos funcionan desde la raíz  
**❌ Falla si**: Los comandos dan error o no encuentran el paquete

---

## 🔙 Plan de Rollback

Si algo sale mal, puedes hacer rollback siguiendo estos pasos:

### Opción 1: Rollback con Git (RECOMENDADO)

```bash
# Ver commits recientes
git log --oneline -5

# Rollback al commit anterior a los cambios
git reset --hard <commit-hash-antes-de-cambios>

# Limpiar node_modules y reinstalar
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

---

### Opción 2: Rollback Manual

#### Paso 1: Restaurar schemas en apps

```bash
# Recuperar desde git (sin commitear)
git checkout apps/web/prisma/schema.prisma
git checkout apps/agent/prisma/schema.prisma
git checkout apps/web/prisma/migrations

# O copiar desde backup
cp backup/web-schema.prisma apps/web/prisma/schema.prisma
cp backup/agent-schema.prisma apps/agent/prisma/schema.prisma
```

#### Paso 2: Restaurar dependencias en apps

**En `apps/web/package.json`**:
```json
{
  "dependencies": {
    "@prisma/client": "^5.22.0"
  },
  "devDependencies": {
    "prisma": "^5.20.0"
  },
  "scripts": {
    "db:generate": "dotenv -e .env.local --expand -- prisma generate",
    "db:push": "dotenv -e .env.local --expand -- prisma db push",
    "db:migrate": "dotenv -e .env.local --expand -- prisma migrate dev",
    "build": "dotenv -e .env.local --expand -- prisma generate && next build"
  }
}
```

**En `apps/agent/package.json`**:
```json
{
  "dependencies": {
    "@prisma/client": "^5.20.0"
  },
  "devDependencies": {
    "prisma": "^5.20.0"
  },
  "scripts": {
    "db:generate": "prisma generate --schema=./prisma/schema.prisma"
  }
}
```

#### Paso 3: Restaurar imports

**En `apps/web/src/lib/prisma.ts`** (crear si no existe):
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**En todos los archivos de web**, revertir:
```typescript
// Volver a:
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
```

**En `apps/agent/tools/retrieval.ts`**, restaurar el singleton (líneas 1-13).

#### Paso 4: Eliminar paquete database

```bash
rm -rf packages/database
```

#### Paso 5: Restaurar pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
```

#### Paso 6: Reinstalar

```bash
rm -rf node_modules apps/*/node_modules
pnpm install

# Regenerar Prisma clients
cd apps/web && pnpm db:generate
cd ../agent && pnpm db:generate
```

---

## 📋 Checklist de Implementación

### Pre-implementación

- [ ] Leer este documento completo
- [ ] Hacer commit de cualquier cambio pendiente
- [ ] Crear backup de la base de datos (opcional)
- [ ] Verificar que ambas apps funcionan correctamente
- [ ] Tener al menos 2-3 horas disponibles

---

### Implementación

#### Fase 1: Crear Paquete Database
- [ ] 1.1. Crear directorios `packages/database/src` y `packages/database/prisma`
- [ ] 1.2. Crear `packages/database/package.json`
- [ ] 1.3. Crear `packages/database/tsconfig.json`
- [ ] 2.1. Copiar `schema.prisma` de web a database
- [ ] 2.2. Copiar `migrations/` de web a database
- [ ] 2.3. Copiar `seed.ts` de web a database
- [ ] 3.1. Crear `packages/database/src/index.ts` con singleton
- [ ] 4.1. Actualizar `pnpm-workspace.yaml` con "packages/*"
- [ ] 5. Correr `pnpm install` y `pnpm db:generate` en database

#### Fase 2: Actualizar Apps
- [ ] 6.1. Agregar `"@yuni/database": "workspace:*"` en `apps/web/package.json`
- [ ] 6.2. Agregar `"@yuni/database": "workspace:*"` en `apps/agent/package.json`
- [ ] 6.3. Correr `pnpm install` desde la raíz

#### Fase 3: Actualizar Imports
- [ ] 7.1. Eliminar `apps/web/src/lib/prisma.ts`
- [ ] 7.2. Actualizar imports en 13 archivos de web (ver lista en PASO 7.2)
- [ ] 8.1. Actualizar `apps/agent/tools/retrieval.ts` (eliminar singleton, importar de @yuni/database)

#### Fase 4: Limpiar
- [ ] 9.1. Eliminar `apps/web/prisma/` y `apps/agent/prisma/`
- [ ] 9.2. Eliminar dependencias de Prisma en package.json de apps
- [ ] 9.3. Correr `pnpm install`
- [ ] 10.1. Actualizar scripts en `package.json` raíz
- [ ] 11.1. Actualizar build script en `apps/web/package.json`

---

### Testing y Validación

- [ ] Test 1: Verificar que Prisma Client se generó
- [ ] Test 2: Verificar que NO quedan imports viejos en web
- [ ] Test 3: Verificar imports en agent
- [ ] Test 4: Compilación TypeScript sin errores
- [ ] Test 5: Levantar web app y probar funcionalidades
- [ ] Test 6: Levantar agent app y verificar logs
- [ ] Test 7: Prisma Studio funciona
- [ ] Test 8: CRUD end-to-end funciona
- [ ] Test 9: NO hay Prisma clients duplicados
- [ ] Test 10: Scripts desde raíz funcionan

---

### Post-implementación

- [ ] Hacer commit con mensaje descriptivo
- [ ] Actualizar README.md con nuevos comandos si es necesario
- [ ] Documentar en changelog si existe
- [ ] Compartir cambios con el equipo
- [ ] Monitorear por 24-48 horas

---

## 📚 Comandos Quick Reference

### Antes de la Migración

```bash
# Web
cd apps/web
pnpm db:generate
pnpm db:migrate
pnpm db:studio

# Agent
cd apps/agent
pnpm db:generate
```

### Después de la Migración

```bash
# Todos los comandos desde la raíz
pnpm db:generate    # Genera Prisma Client
pnpm db:push        # Push schema a DB
pnpm db:migrate     # Corre migraciones
pnpm db:studio      # Abre Prisma Studio
pnpm db:seed        # Seedea la DB
```

---

## 🎓 Recursos Adicionales

### Referencias de Arquitectura

- **Turborepo Database Package**: https://turbo.build/repo/docs/handbook/sharing-code/internal-packages
- **Prisma in Monorepos**: https://www.prisma.io/docs/guides/other/prisma-in-a-monorepo
- **pnpm Workspaces**: https://pnpm.io/workspaces

### Proyectos de Referencia

- **Cal.com**: https://github.com/calcom/cal.com (usa `packages/prisma`)
- **Documenso**: https://github.com/documenso/documenso (usa `packages/prisma`)
- **Formbricks**: https://github.com/formbricks/formbricks (usa `packages/database`)

---

## 📝 Notas Importantes

### Sobre Migraciones

- **Después de la migración**, las migraciones se manejan SOLO desde `packages/database`
- Si necesitas crear una nueva migración: `pnpm db:migrate` desde la raíz
- Las apps NO deben tener sus propios comandos de migración

### Sobre Prisma Generate

- El `prisma generate` debe correrse en `packages/database` después de cambios en el schema
- En producción/CI, correr `pnpm db:generate` desde la raíz antes del build
- No es necesario correr `prisma generate` en cada app

### Sobre TypeScript

- Los tipos de Prisma se exportan desde `@yuni/database`
- No necesitas importar de `@prisma/client` directamente
- Todos los tipos (Agent, Document, Prisma.AgentWhereInput, etc.) están disponibles

### Sobre el .env

- El `DATABASE_URL` sigue estando en los `.env.local` de cada app
- El paquete `database` usa el `DATABASE_URL` del proceso que lo ejecuta
- No necesitas un `.env` en `packages/database`

---

## ❓ FAQ

### ¿Qué pasa con las migraciones existentes?

Las migraciones se copian tal cual a `packages/database/prisma/migrations/`. No se pierde nada y la DB sigue en el mismo estado.

### ¿Necesito regenerar la base de datos?

No. La base de datos no cambia. Solo estamos reorganizando el código.

### ¿Qué pasa si tengo cambios sin commitear en los schemas?

Debes commitearlos primero o perderás esos cambios. Asegúrate de tener un estado limpio antes de empezar.

### ¿Puedo seguir usando Prisma Studio?

Sí, pero ahora desde la raíz con `pnpm db:studio`.

### ¿Qué pasa en producción/CI?

Debes asegurarte de que tu pipeline corra `pnpm db:generate` antes de hacer build. Ejemplo:

```yaml
- run: pnpm install
- run: pnpm db:generate
- run: pnpm build
```

### ¿Puedo agregar más apps que usen el mismo database?

Sí, solo agrega `"@yuni/database": "workspace:*"` en sus dependencias.

### ¿Qué pasa si quiero volver a la arquitectura anterior?

Sigue el "Plan de Rollback" de este documento.

---

**Última Actualización**: 2025-01-30  
**Autor**: Equipo Yuni AI  
**Versión**: 1.0.0
