# RAG en LiveCall - Plan de Implementación

**Fecha**: 2025-01-30  
**Estado**: Listo para implementar  
**Prioridad**: ALTA (LiveCall es el feature más importante)

---

## 🎯 Problema Identificado

### Comportamiento Actual

| Modo | RAG Funciona | Contexto de Documentos |
|------|--------------|------------------------|
| **Chat (Text)** | ✅ SÍ | ✅ Retrieval dinámico por mensaje |
| **LiveCall (Voice)** | ❌ NO | ❌ Solo usa `agent.context` estático |

### Causa Raíz

**Chat Mode** (`apps/web/src/lib/streaming.ts`):
```typescript
// ✅ Llama a retrieval antes de cada respuesta
const retrievalContext = await retrieveContextForAgent(
  agent.id, 
  userMessage, 
  6
);
systemPrompt += formattedContext; // Añade contexto dinámicamente
```

**LiveCall Mode** (`apps/web/server/ws-server.ts`):
```typescript
// ❌ Solo construye prompt UNA VEZ al inicio
const systemPrompt = buildSystemPrompt(agent);

const realtimeClient = new RealtimeClient({
  sessionConfig: {
    instructions: systemPrompt, // Prompt estático sin RAG
  }
});
```

**Resultado**: En LiveCall, el agente NO tiene acceso a los documentos subidos.

---

## 🚀 Solución: Enfoque 1 (Retrieval Dinámico con Optimizaciones)

### Estrategia

Recuperar contexto de documentos **cada vez que el usuario termina de hablar** (después de transcripción) y actualizar las instructions del Realtime API.

### Ventajas

- ✅ **Mismo comportamiento que Chat**: Contexto relevante por query
- ✅ **Query classification**: Usa LLM classifier (Fase 1 implementado)
- ✅ **Precisión óptima**: Summaries para general, chunks para específico
- ✅ **Optimizable**: Cache, paralelización, conditional updates

### Desventajas

- ⚠️ **Latencia adicional**: +85-375ms (optimizado) o +235-510ms (sin optimizar)
- ⚠️ **Complejidad**: Más llamadas a APIs (OpenAI classification + session update)

---

## 📊 Análisis de Latencia

### Sin RAG (Actual)

```
┌────────────────────────────────────────────────────┐
│ Flujo LiveCall Sin RAG                             │
├────────────────────────────────────────────────────┤
│ 1. Usuario habla                                   │
│ 2. Audio → Realtime API          ~0-50ms           │
│ 3. ASR (Whisper)                 ~500-800ms        │
│ 4. LLM generation                ~800-1500ms       │
│ 5. TTS/Audio output              ~300-600ms        │
├────────────────────────────────────────────────────┤
│ TOTAL:                           ~1600-2950ms      │
└────────────────────────────────────────────────────┘
```

### Con RAG Optimizado (Propuesto)

```
┌────────────────────────────────────────────────────┐
│ Flujo LiveCall Con RAG (Optimizado)                │
├────────────────────────────────────────────────────┤
│ 1. Usuario habla                                   │
│ 2. Audio → Realtime API          ~0-50ms           │
│ 3. ASR (Whisper)                 ~500-800ms        │
│                                                     │
│ ┌─ RAG PIPELINE ────────────────────────────────┐ │
│ │ 3a. Classification (paralelo)   ~50-150ms    │ │
│ │ 3b. DB Retrieval (paralelo)     ~30-65ms     │ │
│ │ 3c. Format context              ~5-10ms      │ │
│ │ 3d. Update session (si cambió)  ~0-150ms     │ │
│ └───────────────────────────────────────────────┘ │
│                                                     │
│ 4. LLM generation + contexto     ~800-1500ms       │
│ 5. TTS/Audio output              ~300-600ms        │
├────────────────────────────────────────────────────┤
│ TOTAL:                           ~1685-3375ms      │
│ OVERHEAD:                        +85-425ms         │
│ OVERHEAD PROMEDIO:               ~250ms (10%)      │
└────────────────────────────────────────────────────┘
```

**Conclusión**: Overhead aceptable para obtener respuestas correctas.

---

## 🎯 Plan de Implementación en 3 Fases

### Fase A: MVP (Sin Optimización) - 2-3 horas

**Objetivo**: Probar que RAG funciona en LiveCall

**Cambios**:
1. Importar `retrieveContextForAgent` en `ws-server.ts`
2. Llamar retrieval después de `transcription.completed`
3. Actualizar `session.update()` con nuevo prompt
4. Agregar logs de métricas

**Overhead esperado**: ~400ms promedio

**Testing**: Subir PDF con "La contraseña es: TEST123", preguntar en LiveCall

---

### Fase B: Optimización Básica - 1 hora

**Objetivo**: Reducir latencia a ~250ms

**Optimizaciones**:
1. **Paralelizar**: Classification + Retrieval en `Promise.all()`
2. **Cache**: Summaries en memoria (duran toda la llamada)
3. **Smart classification**: Skip LLM para queries obvias

**Overhead esperado**: ~250ms promedio

---

### Fase C: Optimización Avanzada - 1 hora

**Objetivo**: Reducir latencia a ~150ms

**Optimizaciones**:
1. **Conditional update**: Solo actualizar session si contexto cambió
2. **Incremental context**: Mantener base prompt, solo cambiar docs
3. **Prefetch**: Cargar summaries al inicio de la llamada

**Overhead esperado**: ~150ms promedio (turno 1), ~50ms (turnos 2+)

---

## 💻 Implementación Detallada

### FASE A: MVP

#### Paso 1: Agregar Imports en `ws-server.ts`

```typescript
// Línea ~10, después de imports existentes
import { retrieveContextForAgent, formatRetrievalContext } from "../src/lib/retrieval";
import type { RetrievalContext } from "../src/lib/retrieval";
```

#### Paso 2: Modificar `handleRealtimeEvent` (Línea ~412)

**ANTES**:
```typescript
case "conversation.item.input_audio_transcription.completed":
  connection.currentTranscript = event.transcript;
  sendToClient(connection.ws, {
    type: "transcript",
    text: event.transcript,
    isFinal: true,
  });

  await saveTranscript(connection, event.transcript);

  if (connection.metrics.asrStartTime) {
    const asrLatency = Date.now() - connection.metrics.asrStartTime;
    console.log(`[Metrics] ASR latency: ${asrLatency}ms`);
  }

  updateConnectionState(connection, "generating");
  connection.metrics.llmStartTime = Date.now();
  break;
```

**DESPUÉS**:
```typescript
case "conversation.item.input_audio_transcription.completed":
  connection.currentTranscript = event.transcript;
  sendToClient(connection.ws, {
    type: "transcript",
    text: event.transcript,
    isFinal: true,
  });

  await saveTranscript(connection, event.transcript);

  // Calculate ASR latency
  if (connection.metrics.asrStartTime) {
    const asrLatency = Date.now() - connection.metrics.asrStartTime;
    console.log(`[Metrics] ASR latency: ${asrLatency}ms`);
  }

  // ========================================
  // ✨ NEW: RAG Integration for LiveCall
  // ========================================
  const ragStartTime = Date.now();
  
  try {
    console.log(`[RAG LiveCall] Retrieving context for agent ${connection.agentId}`);
    console.log(`[RAG LiveCall] Query: "${event.transcript}"`);
    
    // Retrieve context from documents
    const retrievalContext: RetrievalContext = await retrieveContextForAgent(
      connection.agentId,
      event.transcript,
      6 // limit
    );
    
    const formattedContext = formatRetrievalContext(retrievalContext);
    
    if (formattedContext) {
      console.log(`[RAG LiveCall] Found context (${formattedContext.length} chars)`);
      
      // Get agent for base prompt
      const agent = await prisma.agent.findUnique({
        where: { id: connection.agentId }
      });
      
      if (!agent) {
        throw new Error("Agent not found");
      }
      
      // Build updated prompt with RAG context
      const basePrompt = buildSystemPrompt({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        context: agent.context,
        toolsAllowed: agent.toolsAllowed as any,
        voice: agent.voice as any,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      });
      
      const updatedPrompt = basePrompt + formattedContext + `

CRITICAL INSTRUCTIONS FOR DOCUMENT-BASED RESPONSES:

You have access to two types of context:
1. DOCUMENT SUMMARIES: Use for general questions about topics, themes, and high-level content
2. DETAILED CHUNKS: Use for specific questions requiring exact data, quotes, or precise details

Response Rules:
- ONLY use information explicitly present in the summaries or chunks above
- For general questions: Primarily use the summaries (faster, comprehensive)
- For specific questions (exact numbers, dates, quotes, passwords, codes): Use the detailed chunks
- If information is not in the provided context: Say "I couldn't find that information in the uploaded documents"
- NEVER invent or assume information not present in the context
- When citing specific data, mention it comes from the uploaded documents`;
      
      // Update Realtime session with new instructions
      const realtimeClient = connection.realtimeWs as any as RealtimeClient;
      await realtimeClient.updateSession({
        instructions: updatedPrompt,
      });
      
      const ragLatency = Date.now() - ragStartTime;
      console.log(`[Metrics] RAG latency: ${ragLatency}ms`);
      
      // Send RAG metrics to client
      sendToClient(connection.ws, {
        type: "metrics",
        rag: {
          total: ragLatency,
          contextLength: formattedContext.length,
        }
      });
    } else {
      console.log(`[RAG LiveCall] No document context found`);
      const ragLatency = Date.now() - ragStartTime;
      console.log(`[Metrics] RAG latency (no context): ${ragLatency}ms`);
    }
  } catch (error: any) {
    console.error(`[RAG LiveCall] Error retrieving context:`, error);
    // Continue without RAG if it fails (graceful degradation)
  }
  // ========================================
  // END RAG Integration
  // ========================================

  updateConnectionState(connection, "generating");
  connection.metrics.llmStartTime = Date.now();
  break;
```

#### Paso 3: Actualizar Tipos (si es necesario)

Verificar que `RetrievalContext` está exportado en `retrieval.ts`:

```typescript
// apps/web/src/lib/retrieval.ts
export interface RetrievalContext {
  summaryContext: string;
  detailedChunks: DocumentChunk[];
}
```

---

### FASE B: Optimización Básica

#### Optimización 1: Paralelizar Classification + Retrieval

**Modificar `retrieval.ts`** (línea ~177):

```typescript
// ANTES (secuencial):
export async function retrieveContextForAgent(
  agentId: string,
  query: string,
  limit: number = 6
): Promise<RetrievalContext> {
  console.log(`[RAG] Query: "${query}"`);
  const queryType = await classifyQueryWithLLM(query);
  console.log(`[RAG] Query type: ${queryType}`);

  const summaries = await getDocumentSummaries(agentId);
  console.log(`[RAG] Found ${summaries.length} document summaries`);
  // ...
}

// DESPUÉS (paralelo):
export async function retrieveContextForAgent(
  agentId: string,
  query: string,
  limit: number = 6
): Promise<RetrievalContext> {
  console.log(`[RAG] Query: "${query}"`);
  
  // ✅ Paralelizar classification + summaries
  const [queryType, summaries] = await Promise.all([
    classifyQueryWithLLM(query),
    getDocumentSummaries(agentId),
  ]);
  
  console.log(`[RAG] Query type: ${queryType}`);
  console.log(`[RAG] Found ${summaries.length} document summaries`);
  // ... resto igual
}
```

**Ahorro**: ~65ms (el tiempo de getDocumentSummaries)

---

#### Optimización 2: Cache de Summaries

**Agregar en `ws-server.ts`** (línea ~30, después de imports):

```typescript
// Cache de summaries por agentId (limpiado al terminar llamada)
const summariesCache = new Map<string, any[]>();

// Función helper para obtener summaries con cache
async function getCachedSummaries(agentId: string): Promise<any[]> {
  if (summariesCache.has(agentId)) {
    console.log(`[RAG Cache] Using cached summaries for agent ${agentId}`);
    return summariesCache.get(agentId)!;
  }
  
  // Primera vez: consultar DB
  const summaries = await prisma.document.findMany({
    where: {
      agentId,
      status: "READY",
      summaryStatus: "READY",
      summary: { not: null },
    },
    select: {
      id: true,
      filename: true,
      summary: true,
    },
  });
  
  summariesCache.set(agentId, summaries);
  return summaries;
}
```

**Modificar `cleanupConnection`** (línea ~700+):

```typescript
function cleanupConnection(connection: CallConnection) {
  console.log(`[WebSocket] Cleaning up connection: ${connection.sessionId}`);

  // ✅ Limpiar cache de summaries
  summariesCache.delete(connection.agentId);
  
  // ... resto del cleanup existente
}
```

**Uso en RAG pipeline**: Reemplazar llamada a Prisma con `getCachedSummaries()`

**Ahorro**: ~65ms en turno 2+ (después del primer retrieval)

---

#### Optimización 3: Smart Classification

**Agregar en `query-classifier.ts`** (después de línea 13):

```typescript
/**
 * Smart classification: Skip LLM for obvious queries
 * Saves ~225ms on 60-70% of queries
 */
function shouldSkipLLM(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Queries muy cortas: usar keywords
  if (query.length < 10) {
    return true;
  }
  
  // Keywords obvios de SPECIFIC
  const obviousSpecificKeywords = [
    "contraseña", "password", "clave",
    "código", "code", "número", "cuánto",
    "cuál es", "dame", "dime",
  ];
  
  // Keywords obvios de GENERAL
  const obviousGeneralKeywords = [
    "de qué trata", "qué es", "explica",
    "resume", "resumen", "general",
  ];
  
  const hasObviousKeyword = 
    obviousSpecificKeywords.some(kw => lowerQuery.includes(kw)) ||
    obviousGeneralKeywords.some(kw => lowerQuery.includes(kw));
  
  return hasObviousKeyword;
}

export async function classifyQueryWithLLM(query: string): Promise<QueryType> {
  // ✅ Smart skip: usar keywords para queries obvias
  if (shouldSkipLLM(query)) {
    console.log(`[RAG] Using keyword classification (skipped LLM)`);
    return classifyQueryWithKeywords(query);
  }
  
  // ... resto del código existente (LLM classification)
}
```

**Ahorro**: ~225ms en 60-70% de queries (queries con keywords obvios)

---

### FASE C: Optimización Avanzada

#### Optimización 4: Conditional Session Update

**Agregar en `ws-server.ts`** (cerca del RAG pipeline):

```typescript
// Store last sent context per connection
const lastContextBySession = new Map<string, string>();

// En el RAG pipeline (después de formatRetrievalContext):
if (formattedContext) {
  // Hash del contexto para comparar
  const contextHash = formattedContext.substring(0, 100); // Simple hash
  const lastContext = lastContextBySession.get(connection.sessionId);
  
  if (lastContext === contextHash) {
    console.log(`[RAG LiveCall] Context unchanged, skipping session update`);
    // SKIP update, save ~100ms
  } else {
    console.log(`[RAG LiveCall] Context changed, updating session`);
    
    // Build and update prompt
    const updatedPrompt = basePrompt + formattedContext + /* ... */;
    await realtimeClient.updateSession({ instructions: updatedPrompt });
    
    // Store new context
    lastContextBySession.set(connection.sessionId, contextHash);
  }
}

// En cleanupConnection:
lastContextBySession.delete(connection.sessionId);
```

**Ahorro**: ~100ms si el contexto no cambió (queries similares seguidas)

---

#### Optimización 5: Prefetch Summaries al Inicio

**Modificar `handleInit`** (línea ~168):

```typescript
async function handleInit(ws: WebSocket, message: ClientMessage & { type: "init" }) {
  // ... código existente hasta crear connection (línea ~200)
  
  connections.set(sessionId, connection);
  
  // ✅ NUEVO: Prefetch summaries en background (no bloquea init)
  getCachedSummaries(agentId).catch(err => {
    console.error(`[RAG Cache] Failed to prefetch summaries:`, err);
  });
  
  // ... resto del código (create RealtimeClient, etc)
}
```

**Beneficio**: Summaries ya cargados cuando llega el primer turno (ahorra ~65ms en turno 1)

---

## 📊 Comparación de Fases

| Fase | Overhead Promedio | Turno 1 | Turno 2+ | Complejidad |
|------|-------------------|---------|----------|-------------|
| **Sin RAG** | 0ms | 0ms | 0ms | Muy Baja |
| **Fase A (MVP)** | ~400ms | ~400ms | ~400ms | Baja |
| **Fase B (Optimizado)** | ~250ms | ~250ms | ~250ms | Media |
| **Fase C (Avanzado)** | ~150ms | ~250ms | ~50-100ms | Media-Alta |

**Recomendación**: Implementar Fase B (mejor balance costo/beneficio)

---

## 🧪 Plan de Testing

### Test 1: RAG Funciona en LiveCall (Crítico)

**Setup**:
1. Subir PDF con: "La contraseña del WiFi es: TEST123"
2. Iniciar LiveCall con el agente
3. Decir: "¿Cuál es la contraseña del WiFi?"

**Expected**:
- ✅ Transcripción: "¿Cuál es la contraseña del WiFi?"
- ✅ Log: `[RAG LiveCall] Found context (XXX chars)`
- ✅ Respuesta: "La contraseña del WiFi es: TEST123"

**Si FALLA**:
- ❌ Revisar logs: `[RAG LiveCall] Error retrieving context`
- ❌ Verificar que `retrieveContextForAgent` está importado
- ❌ Verificar que agent tiene documentos procesados

---

### Test 2: Query Classification en LiveCall

**Setup**:
1. Documentos ya subidos
2. LiveCall iniciada

**Queries**:
1. "¿De qué trata el documento?" → debe clasificar como `general`
2. "¿Cuál es el código?" → debe clasificar como `specific`

**Expected Logs**:
```
[RAG] Query: "¿De qué trata el documento?"
[RAG] LLM classified "¿De qué trata el documento?" as: general
[RAG LiveCall] Found context (XXX chars)
```

---

### Test 3: Latencia con Métricas

**Setup**:
1. Documentos subidos
2. LiveCall iniciada
3. Consola del servidor visible

**Test**:
1. Hacer pregunta en LiveCall
2. Observar logs de métricas

**Expected Logs**:
```
[Metrics] ASR latency: 650ms
[Metrics] RAG latency: 280ms          ← NUEVO
[Metrics] LLM latency: 1200ms
[Metrics] Total latency: 2130ms
```

**Validación**:
- ✅ RAG latency < 500ms (Fase A)
- ✅ RAG latency < 350ms (Fase B)
- ✅ RAG latency < 200ms (Fase C)

---

### Test 4: Cache de Summaries

**Setup**:
1. Documentos subidos
2. LiveCall iniciada

**Test**:
1. **Turno 1**: Hacer pregunta
2. **Turno 2**: Hacer otra pregunta

**Expected Logs**:
```
# Turno 1
[RAG LiveCall] Retrieving context for agent...
[Metrics] RAG latency: 280ms

# Turno 2
[RAG Cache] Using cached summaries for agent...
[Metrics] RAG latency: 180ms          ← Más rápido
```

**Validación**:
- ✅ Turno 2 es ~65-100ms más rápido que Turno 1

---

### Test 5: Graceful Degradation

**Setup**:
1. **SIN** documentos subidos
2. LiveCall iniciada

**Test**:
1. Hacer pregunta sobre algo del `agent.context` estático

**Expected**:
- ✅ Log: `[RAG LiveCall] No document context found`
- ✅ Respuesta funciona (usa context estático)
- ✅ NO hay error

**Validación**: Sistema funciona sin documentos (fallback al comportamiento original)

---

## 📈 Métricas a Monitorear Post-Deployment

### Dashboard de Métricas (Manual)

```typescript
// Agregar contador de queries en ws-server.ts
let ragStats = {
  totalQueries: 0,
  queriesWithContext: 0,
  queriesWithoutContext: 0,
  totalLatency: 0,
  classificationLatency: 0,
  retrievalLatency: 0,
  updateLatency: 0,
};

// Actualizar después de cada RAG call
ragStats.totalQueries++;
if (formattedContext) {
  ragStats.queriesWithContext++;
  ragStats.totalLatency += ragLatency;
} else {
  ragStats.queriesWithoutContext++;
}

// Log cada 10 queries
if (ragStats.totalQueries % 10 === 0) {
  console.log(`[RAG Stats] Total: ${ragStats.totalQueries}, With context: ${ragStats.queriesWithContext}, Avg latency: ${ragStats.totalLatency / ragStats.queriesWithContext}ms`);
}
```

### Métricas Clave

| Métrica | Target | Cómo Medir |
|---------|--------|------------|
| **RAG Success Rate** | > 95% | `queriesWithContext / totalQueries` |
| **Avg Latency (Fase B)** | < 300ms | `totalLatency / queriesWithContext` |
| **Cache Hit Rate** | > 70% | Logs "Using cached summaries" |
| **Classification Skip Rate** | > 60% | Logs "skipped LLM" |

---

## 🚨 Troubleshooting

### Problema 1: "Agent not found" en RAG pipeline

**Síntoma**: Error al obtener agent dentro del RAG pipeline

**Causa**: Connection no tiene referencia al agent completo

**Solución**: Guardar agent en connection al init:

```typescript
// En handleInit, después de crear connection:
connection.agent = agent; // ✅ Store full agent

// En RAG pipeline:
const basePrompt = buildSystemPrompt(connection.agent); // ✅ Use stored agent
```

---

### Problema 2: Session update no surte efecto

**Síntoma**: RAG funciona pero LLM no usa el contexto

**Causa**: Realtime API puede ignorar `session.update()` si hay response en progreso

**Solución**: Asegurar que update se hace ANTES de que empiece la generación:

```typescript
// Update session ANTES de updateConnectionState("generating")
await realtimeClient.updateSession({ instructions: updatedPrompt });

// DESPUÉS del update
updateConnectionState(connection, "generating");
connection.metrics.llmStartTime = Date.now();
```

---

### Problema 3: RAG latency muy alta (>1s)

**Síntoma**: RAG toma más de 1 segundo

**Causas posibles**:
1. LLM classification lenta (OpenAI API slow)
2. DB query lenta (muchos documentos)
3. Network issues

**Debug**:
```typescript
// Agregar timestamps detallados
const t0 = Date.now();
const queryType = await classifyQueryWithLLM(query);
console.log(`[RAG Debug] Classification took: ${Date.now() - t0}ms`);

const t1 = Date.now();
const summaries = await getDocumentSummaries(agentId);
console.log(`[RAG Debug] Summaries took: ${Date.now() - t1}ms`);

const t2 = Date.now();
const chunks = await retrieveRelevantChunks(agentId, query, limit);
console.log(`[RAG Debug] Chunks took: ${Date.now() - t2}ms`);
```

---

## 🔒 Consideraciones de Seguridad

### 1. Validación de Ownership

```typescript
// Verificar que el agente pertenece al usuario
const agent = await prisma.agent.findUnique({
  where: { id: connection.agentId },
  include: { user: true },
});

if (agent.userId !== connection.userId) {
  throw new Error("Unauthorized access to agent");
}
```

### 2. Rate Limiting

```typescript
// Limitar RAG queries por sesión
const ragQueries = new Map<string, number>();

if ((ragQueries.get(connection.sessionId) || 0) > 100) {
  console.warn(`[RAG] Rate limit exceeded for session ${connection.sessionId}`);
  // Skip RAG pero continuar con response
}

ragQueries.set(
  connection.sessionId, 
  (ragQueries.get(connection.sessionId) || 0) + 1
);
```

### 3. Error Handling

```typescript
try {
  // RAG pipeline
} catch (error: any) {
  console.error(`[RAG LiveCall] Error:`, error);
  
  // ✅ Graceful degradation: continuar SIN RAG
  // NO fallar toda la llamada
  sendToClient(connection.ws, {
    type: "warning",
    message: "Document context temporarily unavailable"
  });
}
```

---

## 📝 Checklist de Implementación

### Fase A: MVP

- [ ] Importar `retrieveContextForAgent` en `ws-server.ts`
- [ ] Modificar `handleRealtimeEvent` case `transcription.completed`
- [ ] Agregar RAG pipeline (retrieval + update session)
- [ ] Agregar logs de métricas (`[Metrics] RAG latency: Xms`)
- [ ] Testing: Subir PDF, preguntar en LiveCall
- [ ] Verificar: Respuesta correcta con contexto de documento

### Fase B: Optimización Básica

- [ ] Paralelizar classification + summaries en `retrieveContextForAgent`
- [ ] Implementar cache de summaries en `ws-server.ts`
- [ ] Agregar `getCachedSummaries()` helper
- [ ] Limpiar cache en `cleanupConnection`
- [ ] Implementar smart classification en `query-classifier.ts`
- [ ] Testing: Verificar latencia reducida (~250ms)

### Fase C: Optimización Avanzada

- [ ] Implementar conditional session update (skip si no cambió)
- [ ] Agregar `lastContextBySession` Map
- [ ] Implementar prefetch de summaries en `handleInit`
- [ ] Testing: Verificar latencia en turno 2+ (~50-100ms)

---

## 🎯 Criterios de Éxito

### Funcionalidad

- ✅ RAG funciona en LiveCall (mismo comportamiento que Chat)
- ✅ Query classification activa (logs muestran "general" o "specific")
- ✅ Respuestas correctas con datos de documentos
- ✅ Graceful degradation si no hay documentos

### Performance

- ✅ RAG latency < 500ms (Fase A)
- ✅ RAG latency < 300ms (Fase B)
- ✅ RAG latency < 200ms en turno 1, < 100ms en turno 2+ (Fase C)
- ✅ Cache hit rate > 70% en conversaciones largas

### UX

- ✅ Latencia total (ASR + RAG + LLM) < 3.5s en el 95% de queries
- ✅ Usuario NO nota diferencia vs Chat mode
- ✅ Respuestas precisas justifican latencia adicional

---

## 📅 Timeline Estimado

| Fase | Tiempo | Acumulado |
|------|--------|-----------|
| **Fase A: MVP** | 2-3 horas | 2-3 horas |
| **Testing Fase A** | 1 hora | 3-4 horas |
| **Fase B: Opt. Básica** | 1 hora | 4-5 horas |
| **Testing Fase B** | 0.5 horas | 4.5-5.5 horas |
| **Fase C: Opt. Avanzada** | 1 hora | 5.5-6.5 horas |
| **Testing Fase C** | 0.5 horas | 6-7 horas |

**Total**: 6-7 horas para implementación completa (Fase A + B + C)

**Recomendación**: Implementar Fase A → testear → evaluar si necesita B/C

---

## 🚀 Próximos Pasos

1. **Implementar Fase A (MVP)** en `ws-server.ts`
2. **Ejecutar Test 1** (PDF con contraseña)
3. **Medir latencia real** con logs
4. **Decidir**: ¿Necesita optimización o 400ms es aceptable?
5. Si sí → Implementar Fase B
6. Si no → Listo, RAG funciona en LiveCall ✅

---

**Última Actualización**: 2025-01-30  
**Próxima Revisión**: Después de implementar Fase A  
**Owner**: Equipo Yuni AI
