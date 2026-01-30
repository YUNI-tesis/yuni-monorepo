# RAG con Embeddings - Plan de Implementación

## Estado Actual (Naive RAG)

### Procesamiento de Documentos
1. ✅ Usuario sube documento (PDF, TXT, DOCX)
2. ✅ Sistema extrae texto automáticamente
3. ✅ Texto se divide en chunks (~1200 chars, 200 overlap)
4. ✅ **NUEVO**: Auto-genera resumen del documento completo usando LLM
5. ✅ Chunks y resumen se guardan en PostgreSQL

### Estrategia de Retrieval
- **Para preguntas generales**: Usa los resúmenes de documentos (ahorra tokens)
- **Para preguntas específicas**: Busca en chunks originales
- **Problema actual**: Búsqueda naive con ILIKE (coincidencia de keywords)
  - No entiende similitud semántica
  - "¿Qué es fotosíntesis?" no encuentra "proceso de plantas que convierte luz solar"

## Plan: Migración a Embeddings

### 1. Infraestructura Base

#### PostgreSQL + pgvector
```sql
-- Habilitar extensión pgvector
CREATE EXTENSION vector;

-- Agregar columna de embeddings a DocumentChunk
ALTER TABLE "DocumentChunk" 
ADD COLUMN embedding vector(1536);  -- OpenAI ada-002 = 1536 dims

-- Índice para búsqueda rápida (HNSW = Hierarchical Navigable Small World)
CREATE INDEX documentchunk_embedding_idx 
ON "DocumentChunk" 
USING hnsw (embedding vector_cosine_ops);

-- También embeddings para resúmenes
ALTER TABLE "Document"
ADD COLUMN summary_embedding vector(1536);
```

#### Variables de Entorno
```bash
# .env.local
OPENAI_EMBEDDING_MODEL=text-embedding-3-small  # Más barato, 1536 dims
# o text-embedding-ada-002 (legacy, más común)
```

### 2. Generación de Embeddings

#### Durante el Ingest (POST /api/documents/[id]/ingest)
```typescript
// Después de crear chunks
for (const chunk of chunks) {
  // Generar embedding para cada chunk
  const embedding = await generateEmbedding(chunk.text);
  
  await prisma.documentChunk.create({
    data: {
      documentId,
      index: chunk.index,
      text: chunk.text,
      embedding: embedding,  // vector de 1536 números
    },
  });
}
```

#### Durante el Summarize (POST /api/documents/[id]/summarize)
```typescript
// Después de generar el resumen
const summaryText = JSON.stringify(summary);
const summaryEmbedding = await generateEmbedding(summaryText);

await prisma.document.update({
  where: { id: documentId },
  data: {
    summary: summary,
    summaryStatus: "READY",
    summary_embedding: summaryEmbedding,
  },
});
```

#### Función Helper para Embeddings
```typescript
// apps/web/src/lib/embeddings.ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  // Truncar si es muy largo (max ~8000 tokens para ada-002)
  const truncated = text.slice(0, 32000); // ~8k tokens * 4 chars
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncated,
  });
  
  return response.data[0].embedding;
}
```

### 3. Retrieval con Similitud Semántica

#### En apps/agent/tools/retrieval.ts
```typescript
export async function retrieveContextForAgent({
  agentId,
  query,
  limit = 6,
}: {
  agentId: string;
  query: string;
  limit?: number;
}): Promise<string> {
  
  // 1. Generar embedding de la query del usuario
  const queryEmbedding = await generateEmbedding(query);
  
  // 2. Detectar si es pregunta general o específica
  const isGeneral = await classifyQuery(query); // LLM quick check
  
  if (isGeneral) {
    // 3a. Para preguntas generales: buscar en resúmenes
    const documents = await prisma.$queryRaw`
      SELECT 
        d.id,
        d.filename,
        d.summary,
        1 - (d.summary_embedding <=> ${queryEmbedding}::vector) as similarity
      FROM "Document" d
      WHERE d."agentId" = ${agentId}
        AND d.status = 'READY'
        AND d.summary_embedding IS NOT NULL
      ORDER BY d.summary_embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;
    
    // Formatear contexto con resúmenes
    return documents.map(d => 
      `[Documento: ${d.filename}]\n${JSON.stringify(d.summary)}`
    ).join('\n\n');
    
  } else {
    // 3b. Para preguntas específicas: buscar en chunks
    const chunks = await prisma.$queryRaw`
      SELECT 
        c.id,
        c.text,
        c.index,
        d.filename,
        1 - (c.embedding <=> ${queryEmbedding}::vector) as similarity
      FROM "DocumentChunk" c
      JOIN "Document" d ON c."documentId" = d.id
      WHERE d."agentId" = ${agentId}
        AND d.status = 'READY'
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;
    
    // Formatear contexto con chunks
    return chunks.map((c, i) => 
      `[Chunk ${i+1} de ${c.filename}]\n${c.text}`
    ).join('\n\n---\n\n');
  }
}
```

### 4. Clasificador de Queries (LLM rápido)

```typescript
// apps/agent/tools/query-classifier.ts
async function classifyQuery(query: string): Promise<boolean> {
  const response = await llm.invoke([
    {
      role: "system",
      content: `Clasifica si la pregunta del usuario es GENERAL o ESPECÍFICA.
- GENERAL: preguntas amplias, resúmenes, panorama general ("¿De qué trata?", "¿Cuál es el tema?")
- ESPECÍFICA: preguntas detalladas, datos concretos ("¿Cuál es el valor de X?", "¿Cómo se calcula Y?")

Responde solo: GENERAL o ESPECÍFICA`
    },
    {
      role: "user",
      content: query
    }
  ]);
  
  return response.content.trim().toUpperCase() === "GENERAL";
}
```

### 5. Optimizaciones

#### Caché de Embeddings
- No regenerar embeddings para el mismo texto
- Hash del texto como key
- Redis o tabla en DB

#### Batch Processing
- Generar embeddings en lotes (OpenAI permite batches)
- Reducir llamadas a API

#### Re-ranking (opcional)
- Primero: búsqueda vector (top 20)
- Luego: re-rank con modelo más potente (top 6)
- Mejora relevancia final

## Costos Estimados

### OpenAI Embeddings (text-embedding-3-small)
- **Costo**: $0.02 por 1M tokens
- **Ejemplo**: Documento de 50 páginas (~25k tokens)
  - 25k tokens ÷ 1200 chars/chunk ≈ 20 chunks
  - 20 embeddings × $0.00002 = **$0.0004 por documento**
- **Query embedding**: ~$0.000001 por pregunta

### Alternativas Locales (Gratuitas)
- **sentence-transformers** (Python, Hugging Face)
  - all-MiniLM-L6-v2 (384 dims, muy rápido)
  - all-mpnet-base-v2 (768 dims, mejor calidad)
- **Ollama** con `mxbai-embed-large`
- Requiere servicio adicional + más storage

## Migración Paso a Paso

1. ✅ **Fase 1 (Completado)**: Auto-resúmenes + naive search
2. **Fase 2**: Agregar pgvector + schema migration
3. **Fase 3**: Implementar generación de embeddings (batch para docs existentes)
4. **Fase 4**: Actualizar retrieval.ts con búsqueda vector
5. **Fase 5**: Testing + optimización

## Siguiente Paso Inmediato

```bash
# 1. Instalar pgvector en PostgreSQL
# Según tu entorno:
# - Supabase: ya incluido
# - Neon: ya incluido  
# - Local/Docker: docker-compose.yml needs pgvector image

# 2. Migration Prisma
pnpm --filter web prisma migrate dev --name add_embeddings

# 3. Instalar deps
pnpm --filter web add openai
pnpm --filter agent add openai

# 4. Implementar generateEmbedding helper
# 5. Modificar ingest route
# 6. Modificar summarize route
# 7. Actualizar retrieval.ts
```

## Referencias

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Prisma + pgvector](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries#pgvector-similarity-search)
