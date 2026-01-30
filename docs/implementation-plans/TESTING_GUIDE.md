# Guía de Testing - Fase 1 RAG Improvements

Esta guía te ayudará a verificar que todas las mejoras de Fase 1 funcionan correctamente.

## 🎯 Objetivo

Verificar que después de implementar Fase 1:
- ✅ Summaries capturan valores específicos (contraseñas, códigos, números)
- ✅ Docs pequeños NO generan summary (ahorro de costo)
- ✅ Query classification funciona con LLM
- ✅ Queries sobre contraseñas NO son bloqueadas
- ✅ Retrieval funciona correctamente

---

## 🧪 Test Suite

### Test 1: Credentials in Document ⭐ CRÍTICO

**Objetivo**: Verificar que summaries capturan valores exactos como contraseñas

#### Setup

1. Crear archivo `test-credentials.txt` con este contenido:

```
Información de acceso al sistema

La contraseña temporal del WiFi es: TeSt123!@#
El código de usuario es: USR-99887
El número de cuenta es: ACC-555-12345
Válido hasta: 31 de diciembre de 2024

Para acceder al sistema, usa las credenciales arriba.
```

2. **Login** en la aplicación
3. **Ir a tu agente** (o crear uno nuevo)
4. **Subir el archivo** `test-credentials.txt` en la sección de Contexto
5. **Esperar** a que el documento muestre estado "READY" (procesado)

#### Verificación en Base de Datos

```sql
-- Conectar a la DB
psql $DATABASE_URL

-- Ver el summary generado
SELECT 
  filename,
  status,
  summary_status,
  jsonb_pretty(summary) as summary_formatted
FROM documents 
WHERE filename = 'test-credentials.txt'
ORDER BY "createdAt" DESC 
LIMIT 1;
```

**Resultado Esperado**:

```json
{
  "mainTopic": "Credenciales de acceso al sistema",
  "sections": [...],
  "keyEntities": [
    { "type": "credential", "value": "Contraseña temporal WiFi: TeSt123!@#" },
    { "type": "key_fact", "value": "Código de usuario: USR-99887" },
    { "type": "key_fact", "value": "Número de cuenta: ACC-555-12345" },
    { "type": "date", "value": "Válido hasta: 31 de diciembre de 2024" }
  ],
  "conclusions": [...]
}
```

✅ **PASS**: Si `keyEntities` contiene valores exactos (TeSt123!@#, USR-99887, etc.)  
❌ **FAIL**: Si `keyEntities` solo tiene conceptos genéricos sin valores

#### Verificación con Queries

**En el chat del agente**, hacer estas preguntas:

1. **Query**: "¿Cuál es la contraseña del WiFi?"
   - **Expected**: "La contraseña temporal del WiFi es: TeSt123!@#"
   - ✅ **PASS**: Si responde con el valor exacto
   - ❌ **FAIL**: Si dice "No puedo ayudar" o no menciona el valor

2. **Query**: "¿Cuál es el código de usuario?"
   - **Expected**: "El código de usuario es: USR-99887"
   - ✅ **PASS**: Si responde con el valor exacto

3. **Query**: "¿De qué trata el documento?"
   - **Expected**: Resumen general sobre credenciales de acceso
   - ✅ **PASS**: Si da resumen sin detalles específicos (usa summary)

#### Verificación de Logs

**En terminal del servidor** (donde corre `pnpm dev`), buscar:

```bash
# Log de summarization
[summarize] Starting background summarization for <document-id>
[summarize] Successfully summarized document <document-id>

# Log de query classification
[RAG] Query: "¿Cuál es la contraseña del WiFi?"
[RAG] LLM classified "¿Cuál es la contraseña del WiFi?" as: specific
[RAG] Query type: specific

# Log de retrieval
[RAG] Found 1 document summaries
[RAG] Found 6 relevant chunks
[RAG] First chunk preview: Información de acceso al sistema...
```

✅ **PASS**: Si classification es "specific" para queries de contraseña  
✅ **PASS**: Si encuentra chunks relevantes  
✅ **PASS**: Si NO hay error de guardrails bloqueando

---

### Test 2: Small Document Cost Optimization 💰

**Objetivo**: Verificar que docs pequeños NO generan summary (ahorro)

#### Setup

1. Crear archivo `small-doc.txt` con este contenido:

```
Hola, esto es un documento de prueba muy corto.
Tiene menos de 2000 caracteres.
No necesita un resumen porque es muy pequeño.
```

2. **Subir el archivo** al agente
3. **Esperar** a que muestre estado "READY"

#### Verificación en Base de Datos

```sql
SELECT 
  filename,
  LENGTH(text) as text_length,
  status,
  summary_status,
  summary
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc."documentId"
WHERE filename = 'small-doc.txt'
LIMIT 1;
```

**Resultado Esperado**:
```
filename: small-doc.txt
text_length: ~150 (menos de 2000)
status: READY
summary_status: READY
summary: null
```

✅ **PASS**: Si `summary = null` y `summary_status = READY`  
❌ **FAIL**: Si `summary` tiene contenido (no debería generarse)

#### Verificación de Logs

```bash
# Buscar en logs del servidor:
[summarize] Skipping summary for small document <id> (150 chars < 2000)
```

✅ **PASS**: Si aparece log de "Skipping summary"  
❌ **FAIL**: Si aparece "Starting background summarization"

#### Cálculo de Ahorro

```sql
-- Contar docs pequeños en tu sistema
SELECT 
  COUNT(*) as small_docs_count,
  COUNT(*) * 0.006 as saved_usd
FROM (
  SELECT d.id, SUM(LENGTH(dc.text)) as total_length
  FROM documents d
  JOIN document_chunks dc ON d.id = dc."documentId"
  WHERE d.summary IS NULL AND d.summary_status = 'READY'
  GROUP BY d.id
  HAVING SUM(LENGTH(dc.text)) < 2000
) subquery;
```

**Ejemplo de resultado**:
```
small_docs_count: 42
saved_usd: 0.252  (42 docs * $0.006/doc)
```

📊 **Ahorro real**: Número de docs pequeños × $0.006

---

### Test 3: Query Classification Accuracy 🎯

**Objetivo**: Verificar que LLM classifier funciona correctamente

#### Setup

1. **Tener al menos 1 documento procesado** (puede ser test-credentials.txt)
2. **Acceder a los logs del servidor** en tiempo real

#### Queries de Prueba

Hacer estas queries en el chat y verificar classification en logs:

| # | Query | Classification Esperada | Retrieval Esperado |
|---|-------|------------------------|-------------------|
| 1 | "¿De qué trata el documento?" | `general` | Summaries only |
| 2 | "Resume el contenido" | `general` | Summaries only |
| 3 | "Explícame el tema principal" | `general` | Summaries only |
| 4 | "¿Cuál es la contraseña?" | `specific` | Summaries + Chunks |
| 5 | "¿Cuánto cuesta el producto?" | `specific` | Summaries + Chunks |
| 6 | "Dame el código de acceso" | `specific` | Summaries + Chunks |
| 7 | "¿Cuándo es la fecha límite?" | `specific` | Summaries + Chunks |
| 8 | "¿Qué número aparece en el documento?" | `specific` | Summaries + Chunks |

#### Verificación de Logs por Query

Para cada query, buscar en logs:

```bash
[RAG] Query: "<tu-query>"
[RAG] LLM classified "<tu-query>" as: <general|specific>
[RAG] Query type: <general|specific>
[RAG] Found X document summaries
[RAG] Found X relevant chunks  # (solo si specific)
```

#### Calcular Accuracy

```
Accuracy = (Queries clasificadas correctamente / Total queries) × 100%

Target: > 90% accuracy
```

✅ **PASS**: Si accuracy >= 90%  
⚠️ **WARNING**: Si accuracy 80-90% (revisar casos fallidos)  
❌ **FAIL**: Si accuracy < 80%

#### Troubleshooting

Si alguna query se clasifica mal:

1. **Revisar log**: ¿Usó LLM o keyword fallback?
   ```
   [RAG] LLM classified ... ✅ (usó LLM)
   [RAG] Keyword matched ... ⚠️ (usó fallback)
   ```

2. **Si usó fallback**: Problema con API Key o rate limit
   ```bash
   # Verificar env var
   echo $OPENAI_API_KEY  # o GOOGLE_API_KEY
   ```

3. **Si LLM clasificó mal**: Casos edge, aceptable si es < 10%

---

### Test 4: Guardrails NO Bloquean Documentos 🔓

**Objetivo**: Verificar que queries sobre contraseñas NO son bloqueadas

#### Setup

1. **Usar el documento** `test-credentials.txt` del Test 1
2. **Acceder a logs** del servidor

#### Queries de Prueba

Hacer estas queries que **ANTES** eran bloqueadas:

| Query | Expected Response | Bloqueado ANTES? |
|-------|-------------------|------------------|
| "¿Cuál es la contraseña?" | Responde con valor | ✅ SÍ |
| "Dame el código de acceso" | Responde con valor | ✅ SÍ |
| "¿Cuál es el password del WiFi?" | Responde con valor | ✅ SÍ |

#### Verificación

Para cada query:

1. **Response NO debe ser**:
   - ❌ "Lo siento, pero no puedo ayudar con esa solicitud"
   - ❌ "No puedo procesar mensajes con información sensible"
   - ❌ Cualquier mensaje de refusal

2. **Response DEBE ser**:
   - ✅ El valor exacto de la contraseña/código del documento
   - ✅ Respuesta natural usando info del documento

3. **Logs NO deben mostrar**:
   ```bash
   # ❌ NO debe aparecer:
   [guardrails] Blocked user message: ...
   [guardrails] SECRET_PATTERNS detected: ...
   ```

4. **Logs DEBEN mostrar**:
   ```bash
   # ✅ DEBE aparecer:
   [RAG] Query: "¿Cuál es la contraseña?"
   [RAG] LLM classified ... as: specific
   [RAG] Found 6 relevant chunks
   ```

✅ **PASS**: Si todas las queries responden con valores del documento  
❌ **FAIL**: Si alguna query es bloqueada por guardrails

---

## 📊 Dashboard de Métricas (Manual)

Después de correr todos los tests, completa este checklist:

### Summaries

- [ ] ✅ Summaries capturan `credential` con valor exacto
- [ ] ✅ Summaries capturan `key_fact` con números exactos
- [ ] ✅ Summaries capturan `date` con fechas exactas
- [ ] ✅ Docs < 2000 chars NO generan summary
- [ ] ✅ Docs > 2000 chars SÍ generan summary

**Resultado**: __ / 5 tests passed

### Query Classification

- [ ] ✅ "¿De qué trata?" → general
- [ ] ✅ "Resume el contenido" → general
- [ ] ✅ "¿Cuál es la contraseña?" → specific
- [ ] ✅ "¿Cuánto cuesta?" → specific
- [ ] ✅ "Dame el código" → specific

**Resultado**: __ / 5 tests passed

### Guardrails

- [ ] ✅ Query "contraseña" NO bloqueada
- [ ] ✅ Query "password" NO bloqueada
- [ ] ✅ Query "código" NO bloqueada
- [ ] ✅ Responde con valores del documento
- [ ] ✅ NO aparecen mensajes de refusal

**Resultado**: __ / 5 tests passed

### Retrieval

- [ ] ✅ Queries general usan summaries
- [ ] ✅ Queries specific usan chunks
- [ ] ✅ Logs muestran chunks recuperados
- [ ] ✅ Responses son precisas
- [ ] ✅ Context relevante es encontrado

**Resultado**: __ / 5 tests passed

---

## 🎯 Resumen Final

### Score Total

```
Total Tests Passed: __ / 20
Percentage: ___%

Target: >= 18/20 (90%)
```

### Interpretación

- **18-20/20 (90-100%)**: ✅ **EXCELENTE** - Fase 1 completamente funcional
- **15-17/20 (75-89%)**: ⚠️ **BUENO** - Revisar tests fallidos, posibles ajustes menores
- **< 15/20 (<75%)**: ❌ **REVISAR** - Problemas significativos, debuggear antes de continuar

---

## 🔧 Troubleshooting

### Problema: Summaries NO capturan valores específicos

**Síntoma**: keyEntities tiene conceptos pero no valores exactos

**Solución**:
1. Verificar que `summarization.ts` tiene el prompt actualizado
2. Re-procesar documento (eliminar y subir de nuevo)
3. Revisar logs: `[summarize] Successfully summarized document ...`

### Problema: Query classification siempre usa keywords

**Síntoma**: Logs muestran `[RAG] Keyword matched ...` en vez de `[RAG] LLM classified ...`

**Solución**:
1. Verificar API Key:
   ```bash
   # .env.local
   OPENAI_API_KEY=sk-...
   # o
   GOOGLE_API_KEY=...
   ```
2. Verificar provider en `LLM_CONFIG`:
   ```typescript
   // apps/web/src/lib/llm-config.ts
   provider: "openai" // o "gemini"
   ```
3. Revisar rate limits de API

### Problema: Queries bloqueadas por guardrails

**Síntoma**: Respuesta "Lo siento, no puedo ayudar..."

**Solución**:
1. Verificar que `agent-utils.ts` tiene `SECRET_PATTERNS = []`
2. Reiniciar servidor (`pnpm dev`)
3. Limpiar cache del navegador

### Problema: No encuentra documentos en retrieval

**Síntoma**: `[RAG] Found 0 relevant chunks`

**Solución**:
1. Verificar que documento está `status = READY`
2. Verificar que hay chunks en DB:
   ```sql
   SELECT COUNT(*) FROM document_chunks WHERE "documentId" = '<id>';
   ```
3. Probar query más específica con keywords del documento

---

## 📝 Reporte de Testing

Después de completar todos los tests, crear un issue o documento con:

```markdown
# Testing Report - Fase 1 RAG Improvements

**Fecha**: YYYY-MM-DD
**Tester**: [Tu nombre]

## Resultados

- Total Tests: 20
- Passed: __
- Failed: __
- Accuracy: __%

## Tests Fallidos

[Listar tests que fallaron y por qué]

## Métricas Observadas

- Docs procesados: __
- Docs pequeños (< 2000): __
- Ahorro estimado: $__
- Queries testeadas: __
- Classification accuracy: __%

## Recomendaciones

[ ] Proceder a Fase 2 (si accuracy < 85%)
[ ] Quedarse en Fase 1 (si accuracy >= 85%)
[ ] Ajustes necesarios: [describir]

## Logs Relevantes

[Pegar logs importantes o screenshots]
```

---

**¿Dudas?** Consulta el plan completo en: `docs/implementation-plans/RAG_IMPROVEMENT_PLAN.md`

**¿Problemas?** Revisa el log de implementación: `docs/implementation-plans/PHASE_1_IMPLEMENTATION_LOG.md`
