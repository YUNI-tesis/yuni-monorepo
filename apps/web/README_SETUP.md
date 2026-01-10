# Setup Instructions

## Prerequisites

- Docker and Docker Compose installed
- Node.js and pnpm installed

## Database Setup

1. Start PostgreSQL using Docker Compose:
```bash
docker-compose up -d
```

2. Install dependencies (including `dotenv-cli`):
```bash
pnpm install
```

3. Create a `.env.local` file in `apps/web/` with the following content:

**Opción A: Con interpolación (recomendado si prefieres este estilo)**
```env
# Database variables
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
DB_NAME=yuni

# Database URL con interpolación
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-change-in-production"

# LLM Provider (opcional)
OPENAI_API_KEY="your-openai-api-key"
```

**Opción B: Valores expandidos directamente**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/yuni?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-change-in-production"
OPENAI_API_KEY="your-openai-api-key"
```

**O usa el script de ayuda:**
```bash
cd apps/web
./setup-env.sh
# Luego edita .env.local con tus valores reales
```

**Important**: 
- ✅ **Un solo archivo `.env.local`** - Next.js lo lee automáticamente
- ✅ Prisma CLI también leerá `.env.local` gracias a `dotenv-cli` con expansión de variables
- ✅ Puedes usar interpolación `${VAR}` si las variables están definidas en el mismo archivo
- 🔐 Generate a secure random string for `NEXTAUTH_SECRET`. You can use:
```bash
openssl rand -base64 32
```

**Note**: `.env.local` está en `.gitignore` y no se sube al repositorio. Es tu archivo local de configuración.

3. Generate Prisma Client:
```bash
cd apps/web
pnpm db:generate
```

4. Push the schema to the database:
```bash
pnpm db:push
```

Or run migrations:
```bash
pnpm db:migrate
```

## Running the Application

1. Install dependencies:
```bash
pnpm install
```

2. Start the development server:
```bash
pnpm dev
```

The application will be available at `http://localhost:3000`

## First Steps

1. Navigate to `/auth/register` to create your first user account
2. After registration, you'll be redirected to login
3. Sign in with your credentials
4. Start creating agents!

## Database Management

- View database in Prisma Studio:
```bash
cd apps/web
pnpm db:studio
```

- Stop PostgreSQL:
```bash
docker-compose down
```

- Stop and remove volumes (⚠️ deletes all data):
```bash
docker-compose down -v
```
