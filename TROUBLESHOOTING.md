# Troubleshooting - Error de Autenticación PostgreSQL

## Error: Authentication failed against database server

Si ves este error al ejecutar `pnpm db:push`:

```
Error: P1000: Authentication failed against database server at `localhost`, 
the provided database credentials for `postgres` are not valid.
```

## Solución:

El contenedor de Docker puede haber sido creado con credenciales diferentes. Sigue estos pasos:

### 1. Detener y eliminar el contenedor existente:

```bash
cd /Users/lucaslovaglio/projects/university/tesis/yuni-ai
docker-compose down -v
```

⚠️ **Nota**: `-v` elimina los volúmenes, borrando todos los datos. Si necesitas conservar datos, usa solo `docker-compose down`.

### 2. Verificar que tu `.env.local` tenga las credenciales correctas:

Asegúrate de que `apps/web/.env.local` tenga:

```env
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
DB_NAME=yuni

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}?schema=public"
```

O valores expandidos:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/yuni?schema=public"
```

### 3. Reiniciar el contenedor:

```bash
docker-compose up -d
```

### 4. Verificar que el contenedor esté corriendo:

```bash
docker-compose ps
```

Deberías ver algo como:
```
NAME            STATUS
yuni-postgres   Up (healthy)
```

### 5. Probar la conexión:

```bash
cd apps/web
pnpm db:push
```

## Si el problema persiste:

1. Verifica que el puerto 5432 no esté siendo usado por otro proceso:
```bash
lsof -i :5432
```

2. Verifica los logs del contenedor:
```bash
docker-compose logs postgres
```

3. Prueba conectarte manualmente:
```bash
docker exec -it yuni-postgres psql -U postgres -d yuni
```

Si puedes conectarte manualmente pero Prisma no, el problema está en las variables de entorno.
