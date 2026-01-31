# @yuni/database

Shared Prisma client and database utilities for Yuni AI monorepo.

## 🎯 Purpose

This package centralizes:
- Prisma schema
- Database migrations
- Prisma Client singleton
- Database seed scripts

All apps in the monorepo import from `@yuni/database` instead of managing their own Prisma instances.

## 📦 Installation

This package is automatically available to all workspace apps. Just add it to your dependencies:

```json
{
  "dependencies": {
    "@yuni/database": "workspace:*"
  }
}
```

## 🚀 Usage

### In Your Code

```typescript
// Import prisma client and types
import { prisma, Prisma, Agent, Document, User } from "@yuni/database";

// Use prisma client
const agents = await prisma.agent.findMany();

// Use generated types
const createAgent: Prisma.AgentCreateInput = {
  name: "My Agent",
  description: "...",
  // ...
};
```

### Commands

From the **root of the monorepo**, run:

```bash
# Generate Prisma Client (run after schema changes)
pnpm db:generate

# Push schema to database (dev only)
pnpm db:push

# Create and apply migrations (requires interactive terminal)
pnpm db:migrate

# Apply existing migrations (non-interactive)
cd packages/database && pnpm exec dotenv -e ../../.env -- prisma migrate deploy

# Open Prisma Studio
pnpm db:studio

# Seed the database
pnpm db:seed
```

## 🔧 Configuration

### Environment Variables

The package requires a `.env` file in the **root of the monorepo** with:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
```

See `.env.example` in the root for reference.

### Schema Location

The Prisma schema is located at:
```
packages/database/prisma/schema.prisma
```

### Migrations

Migrations are stored in:
```
packages/database/prisma/migrations/
```

## 🛠️ Development

### Making Schema Changes

1. Edit `packages/database/prisma/schema.prisma`
2. Generate Prisma Client: `pnpm db:generate`
3. Create migration: Open a terminal in `packages/database` and run:
   ```bash
   pnpm exec dotenv -e ../../.env -- prisma migrate dev --name your_migration_name
   ```

### First-Time Setup

If you're setting up a fresh database:

1. Make sure `.env` exists in the root with `DATABASE_URL`
2. Run migrations:
   ```bash
   cd packages/database
   pnpm exec dotenv -e ../../.env -- prisma migrate deploy
   ```
3. Seed the database (optional):
   ```bash
   pnpm db:seed
   ```

### Existing Database

If migrating from separate schemas (like we just did):

1. Mark existing migrations as applied:
   ```bash
   cd packages/database
   pnpm exec dotenv -e ../../.env -- prisma migrate resolve --applied <migration_name>
   ```

## 📁 Structure

```
packages/database/
├── package.json       # Package configuration
├── tsconfig.json      # TypeScript config
├── prisma/
│   ├── schema.prisma  # Database schema
│   ├── migrations/    # Migration history
│   └── seed.ts        # Seed script
└── src/
    └── index.ts       # Exports prisma singleton + types
```

## 🔗 Related

- [Prisma Documentation](https://www.prisma.io/docs)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Monorepo Best Practices](https://turbo.build/repo/docs)

---

**Note**: This package uses a singleton pattern to ensure only one Prisma Client instance exists across your entire application.
