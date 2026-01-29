# Guía de Documentos y RAG en Yuni AI

## Resumen

Yuni AI incluye un sistema avanzado de gestión de documentos con RAG (Retrieval-Augmented Generation) que permite a los agentes responder preguntas basándose en documentos subidos por el usuario.

## Arquitectura del Sistema

### 1. Almacenamiento de Documentos

Los documentos se almacenan en **AWS S3**:

- **Subida directa:** Los archivos se suben directamente desde el navegador a S3 usando URLs presignadas
- **No pasan por el servidor:** Esto mejora la velocidad y reduce la carga del servidor
- **Seguridad:** Solo usuarios autorizados pueden acceder a documentos de agentes que les pertenecen

### 2. Procesamiento de Documentos

Cuando subes un documento, el sistema realiza dos procesos:

#### A. Ingesta (Extracción + Chunking)
1. Descarga el archivo desde S3
2. Extrae el texto:
   - **PDF:** Usa `pdf-parse`
   - **TXT:** Lee directamente
   - **DOCX:** Usa `mammoth`
   - **Imágenes:** Preparado para OCR (a implementar)
3. Divide el texto en **chunks** de ~1200 caracteres con 200 de solapamiento
4. Guarda los chunks en la base de datos

#### B. Summarización (Resumen Estructurado)
1. Toma el texto completo del documento
2. Usa el LLM para generar un resumen estructurado con:
   - **Tema principal:** Descripción concisa del documento
   - **Secciones:** División lógica del contenido
   - **Entidades clave:** Personas, organizaciones, fechas, conceptos
   - **Conclusiones:** Puntos principales y hallazgos
3. Guarda el resumen en formato JSON en la base de datos

## Sistema de Retrieval Inteligente

El sistema usa una estrategia híbrida de dos niveles para responder preguntas:

### Nivel 1: Resúmenes (Preguntas Generales)

**Cuándo se usa:**
- Preguntas sobre el tema general del documento
- Solicitudes de resumen o visión general
- Consultas exploratorias
- Comparaciones de alto nivel

**Ejemplos:**
- "¿De qué trata este documento?"
- "Resumen los principales puntos"
- "¿Qué temas cubre este informe?"
- "¿Cuál es el objetivo de este paper?"

**Ventajas:**
- ⚡ Muy rápido (no requiere buscar en todos los chunks)
- 💰 Económico (menos tokens enviados al LLM)
- 🎯 Información bien estructurada

### Nivel 2: Chunks Detallados (Preguntas Específicas)

**Cuándo se usa:**
- Preguntas que requieren datos exactos
- Solicitudes de citas literales
- Búsqueda de números, fechas, valores específicos
- Detalles técnicos precisos

**Ejemplos:**
- "¿Qué valor exacto se menciona para X?"
- "Cita el texto donde dice Y"
- "¿Cuál es la fecha exacta del evento Z?"
- "¿Qué número aparece en la sección de resultados?"

**Ventajas:**
- 🔍 Acceso preciso al texto original
- ✅ Permite verificar información exacta
- 📍 Referencias específicas (doc:ID chunk:N)

### Estrategia Híbrida

Para preguntas específicas, el sistema:
1. **Primero** usa el resumen para identificar secciones relevantes
2. **Luego** busca en los chunks detallados de esas secciones
3. **Combina** ambos niveles en la respuesta

## Uso en la Interfaz

### 1. Subir un Documento

1. Ve a la página de detalle de tu agente
2. En la sección "Documentos", haz clic en **"Subir"**
3. Selecciona un archivo (PDF, TXT, DOCX)
4. El archivo se sube directamente a S3
5. El documento aparecerá con estado **"UPLOADING"** → **"UPLOADED"**

### 2. Procesar el Documento

1. Haz clic en **"Procesar"** para iniciar la ingesta
2. El sistema extrae texto y crea chunks
3. Estado cambia a **"INGESTING"** → **"READY"**
4. Si hay error, el estado será **"FAILED"** y verás el mensaje de error

### 3. Generar Resumen

1. Una vez el documento esté en estado **"READY"**
2. Haz clic en **"Resumir"**
3. El LLM analiza el documento y genera un resumen estructurado
4. El campo "Resumen" mostrará el estado

**Nota:** La generación de resumen toma ~10-30 segundos dependiendo del tamaño del documento.

### 4. Conversar con el Agente

Una vez procesado y resumido:
- El agente tiene acceso automático a los documentos
- Puedes hacer preguntas generales o específicas
- El sistema selecciona automáticamente la mejor estrategia de retrieval

## Configuración Técnica

### Variables de Entorno

```env
# AWS S3
STORAGE_PROVIDER=s3
AWS_ACCESS_KEY_ID=tu_access_key_id
AWS_SECRET_ACCESS_KEY=tu_secret_access_key
AWS_S3_BUCKET_NAME=yuni-documents
AWS_REGION=us-east-1

# Límites
DOC_MAX_SIZE_MB=20  # Tamaño máximo por documento
```

### Comandos Útiles

```bash
# Generar cliente Prisma (después de cambios en schema)
cd apps/web
pnpm db:generate

# Crear migración
pnpm db:migrate

# Ver base de datos
pnpm db:studio
```

## Limitaciones Actuales

1. **Formatos soportados:**
   - ✅ PDF
   - ✅ TXT
   - ✅ DOCX
   - ⏳ Imágenes (preparado, OCR a implementar)

2. **Tamaño máximo:** 20MB por archivo (configurable)

3. **Retrieval:** Basado en keywords (ILIKE)
   - Futuro: Migrar a embeddings + vector database para mejor precisión

4. **Summarización:** Requiere llamada al LLM
   - Costo: ~1-5 centavos por documento dependiendo del tamaño
   - Tiempo: ~10-30 segundos por documento

## Mejores Prácticas

### 1. Cuándo Generar Resúmenes

✅ **SÍ generar resumen cuando:**
- El documento es largo (>5 páginas)
- Esperas preguntas generales sobre el contenido
- Quieres respuestas rápidas y eficientes

❌ **NO es necesario cuando:**
- Solo necesitas buscar datos específicos
- El documento es muy corto (<1 página)
- Ya tienes el resumen en otro formato

### 2. Optimización de Costos

- Genera resúmenes solo cuando sea útil (no automáticamente)
- Los resúmenes se cachean, no es necesario regenerarlos
- Para documentos muy largos, considera dividirlos en secciones

### 3. Calidad de las Respuestas

Para mejores resultados:
- Sube documentos bien formateados
- Usa nombres de archivo descriptivos
- Si el documento tiene estructura (secciones), mantenla clara
- Para PDFs escaneados, asegúrate que tengan OCR

## Arquitectura del Flujo

```
Usuario sube archivo
    ↓
Genera URL presignada (S3)
    ↓
Upload directo a S3
    ↓
Confirma subida
    ↓
[INGESTA]
- Descarga de S3
- Extracción de texto
- Chunking
- Guarda chunks en DB
    ↓
Documento READY
    ↓
[SUMMARIZACIÓN] (opcional)
- Reconstruye texto completo
- LLM genera resumen estructurado
- Guarda resumen en DB
    ↓
Usuario hace pregunta
    ↓
[RETRIEVAL INTELIGENTE]
- Analiza tipo de pregunta
- Si general: usa resúmenes
- Si específica: usa resúmenes + chunks
    ↓
LLM genera respuesta con contexto
```

## Troubleshooting

### Problema: Documento se queda en UPLOADING
**Causa:** El archivo no llegó completamente a S3  
**Solución:** 
- Verifica tu conexión a internet
- Comprueba las credenciales de S3
- Intenta subir el archivo de nuevo

### Problema: Error en INGESTING
**Causa:** Formato no soportado o archivo corrupto  
**Solución:**
- Verifica que el formato sea PDF, TXT o DOCX
- Asegúrate que el archivo no esté protegido con contraseña
- Intenta abrir el archivo localmente para verificar que no está corrupto

### Problema: Error en SUMMARIZACIÓN
**Causa:** Documento muy largo o LLM no disponible  
**Solución:**
- Verifica que `OPENAI_API_KEY` esté configurada
- Para documentos muy largos (>100 páginas), considera dividirlos
- Revisa los logs del servidor para más detalles

### Problema: El agente no encuentra información del documento
**Causas posibles:**
- Documento no tiene resumen generado
- Documento no está en estado READY
- La pregunta usa términos muy diferentes al contenido

**Solución:**
- Genera el resumen si aún no existe
- Reformula la pregunta usando términos del documento
- Verifica que el documento procesó correctamente

## Roadmap Futuro

- [ ] Soporte para imágenes con OCR
- [ ] Embeddings + Vector Database (pgvector)
- [ ] Búsqueda semántica en lugar de keywords
- [ ] Summarización automática en background
- [ ] Previsualización de documentos en la UI
- [ ] Anotaciones y highlights
- [ ] Soporte para más formatos (Excel, PowerPoint, etc.)
