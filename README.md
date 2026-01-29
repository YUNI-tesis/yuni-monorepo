# Yuni AI - Multi-Agent Chat Platform

Yuni es una plataforma multi-agente donde los usuarios pueden crear, gestionar y chatear con múltiples agentes de IA. Cada agente tiene una descripción, un system prompt estricto y un bloque de conocimiento contextual. El agente debe responder solo dentro de su rol definido y usar el contexto proporcionado.

## Arquitectura

### Monorepo con pnpm

- **apps/web** → Next.js App Router + Vercel AI SDK para streaming UI
- **apps/agent** → LangGraph (Node/TS) agent runtime + tools
- TypeScript strict, ESLint + Prettier
- Zod para validación en runtime (API bodies + model outputs)
- Almacenamiento: JSON basado en archivos en `/data` (preparado para DB como Supabase)
- Sin migraciones de DB; mantenerlo simple
- Variables de entorno vía `.env.local`. NO hardcodear keys.

## Características (MVP1)

### 1. CRUD de Agentes
- Crear agente con: nombre, descripción (límite 500 caracteres), systemPrompt (estricto), contexto (texto largo)
- Listar agentes, actualizar, eliminar

### 2. Chat por agente
- Iniciar una conversación con un agente
- Persistir historial de mensajes
- Respuestas con streaming (token streaming)

### 3. Seguridad y control de alcance
- Defensas contra prompt injection
- Rechazar solicitudes fuera de alcance basadas en la definición del agente
- Prevenir filtrado del system prompt y reglas internas

### 4. Seguimiento de costos
- Rastrear tokens entrada/salida y estimar USD por conversación y por mensaje

### 5. Arquitectura lista para voz (no implementar WebRTC completamente aún)
- Proporcionar endpoints API y placeholders UI para:
  - STT: audio → texto (usando OpenAI speech-to-text)
  - TTS: texto → audio (usando OpenAI TTS para MVP; más tarde cambiar a ElevenLabs)
- Incluir un botón "Modo Llamada (MVP)" que usa voz turn-based: grabar → transcribir → enviar → hablar respuesta

### 6. Documentos y RAG (Retrieval-Augmented Generation)
- Subir documentos (PDF, TXT, DOCX, imágenes) a AWS S3
- Procesamiento de documentos: extracción de texto y chunking automático
- **Sistema inteligente de resúmenes:**
  - Generación automática de resúmenes estructurados (tema principal, secciones, entidades clave, conclusiones)
  - Retrieval híbrido: usa resúmenes para preguntas generales, chunks para preguntas específicas
- RAG con dos niveles:
  - **Nivel 1 (resúmenes):** Respuestas rápidas y eficientes a preguntas generales
  - **Nivel 2 (chunks):** Acceso preciso a datos específicos, citas y detalles exactos
- Integración automática de contexto de documentos en respuestas del agente

## Instalación

### Requisitos previos
- Node.js 20+
- pnpm 10.8.1+

### Configuración

1. Instalar dependencias:
```bash
pnpm install
```

2. Configurar variables de entorno:
Crea un archivo `.env.local` en la raíz del proyecto:
```env
# LLM Configuration
OPENAI_API_KEY=tu_api_key_aqui

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/yuni_ai

# AWS S3 Storage (for document storage)
STORAGE_PROVIDER=s3
AWS_ACCESS_KEY_ID=tu_access_key_id
AWS_SECRET_ACCESS_KEY=tu_secret_access_key
AWS_S3_BUCKET_NAME=yuni-documents
AWS_REGION=us-east-1  # Optional, defaults to us-east-1

# Document upload limits (optional, defaults to 20MB)
DOC_MAX_SIZE_MB=20

# NextAuth
NEXTAUTH_SECRET=tu_secret_aqui
```

**Nota sobre almacenamiento:** El sistema usa AWS S3 para almacenamiento de documentos. Asegúrate de configurar las credenciales de AWS y crear un bucket S3 antes de usar la funcionalidad de documentos.

3. Ejecutar en modo desarrollo:
```bash
pnpm dev -r
```

Esto iniciará:
- Next.js en `http://localhost:3000`
- El runtime del agente (si está configurado para ejecutarse)

## Estructura del Proyecto

```
apps/
├── web/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── agents/
│   │   │   ├── page.tsx          # Lista de agentes
│   │   │   ├── new/
│   │   │   │   └── page.tsx      # Crear agente
│   │   │   └── [agentId]/
│   │   │       └── page.tsx      # Detalle agente + chat
│   │   └── api/
│   │       ├── agents/           # CRUD agentes
│   │       ├── conversations/   # Gestión conversaciones
│   │       ├── chat/             # Streaming chat
│   │       ├── stt/              # Speech-to-text
│   │       ├── tts/              # Text-to-speech
│   │       └── cost/             # Costos
│   ├── components/               # Componentes React
│   └── lib/                      # Utilidades y schemas
│
├── agent/
│   ├── src/
│   │   ├── graph.ts              # LangGraph state machine
│   │   ├── index.ts              # Exports principales
│   │   └── types.ts              # Tipos TypeScript
│   └── tools/                    # Herramientas del agente
│       ├── storage.ts
│       ├── buildSystemPrompt.ts
│       ├── guardrails.ts
│       ├── costTracker.ts
│       ├── stt.ts
│       └── tts.ts
│
└── data/
    ├── agents/                   # JSON files por agente
    └── conversations/           # JSON files por conversación
```

## Modelos de Datos

### Agent
```typescript
{
  id: string;
  name: string;
  description: string; // max 500 chars
  systemPrompt: string; // strict role/rules
  context: string; // knowledge provided by user
  toolsAllowed: ("none" | "basic")[];
  voice?: {
    provider: "openai" | "elevenlabs";
    voiceId?: string;
    speakingRate?: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

### ConversationState
```typescript
{
  id: string;
  agentId: string;
  mode: "text" | "voice";
  messages: ChatMessage[];
  transcripts?: Array<{
    id: string;
    userAudioRef?: string;
    transcript: string;
    createdAt: string;
  }>;
  cost: { tokensIn: number; tokensOut: number; usd: number };
  createdAt: string;
  updatedAt: string;
}
```

## Flujo del Agente (LangGraph)

1. **LoadAgent** - Carga la definición del agente
2. **LoadConversation** - Carga o crea la conversación
3. **Guardrails** - Aplica filtros de seguridad y validación
4. **RetrieveContext** - Retrieval inteligente de documentos (RAG)
   - Analiza el tipo de consulta (general vs específica)
   - Para preguntas generales: usa resúmenes de documentos
   - Para preguntas específicas: combina resúmenes + chunks detallados
5. **GenerateResponse** - Genera respuesta usando OpenAI con contexto de documentos
6. **PersistConversation** - Guarda mensajes y actualiza costos

## Seguridad

### Guardrails implementados:
- **Prompt injection defense**: Detecta y neutraliza frases como "ignore previous instructions", "reveal system prompt"
- **PII/credentials filter**: Detecta y rechaza intentos de enviar secretos (API keys, passwords)
- **Out-of-scope control**: Rechaza solicitudes que conflictan con el system prompt/descripción del agente

### System Prompt Assembly:
1. Header de seguridad global Yuni (anti-injection, no disclosure, comply with policy)
2. El systemPrompt del agente (definición de rol de mayor prioridad)
3. La descripción del agente como "mission statement"
4. El contexto del agente como "Knowledge Base"

## Costos

El sistema rastrea tokens entrada/salida y estima USD usando tarifas de OpenAI:
- **gpt-4o-mini**: $0.15/$0.60 por 1M tokens (input/output)
- **gpt-4o**: $2.50/$10.00 por 1M tokens (input/output)

Los costos se acumulan por conversación y se muestran en tiempo real en el UI.

## Voz (MVP)

El modo de llamada MVP funciona así:
1. Usuario graba audio (MediaRecorder del navegador)
2. Audio se envía a `/api/stt` para transcripción (OpenAI Whisper)
3. Transcripción se envía a `/api/chat` para obtener respuesta
4. Respuesta de texto se envía a `/api/tts` para síntesis (OpenAI TTS)
5. Audio se reproduce en el navegador

### Cambiar a ElevenLabs (futuro)

Para cambiar el proveedor de TTS a ElevenLabs:
1. Actualizar `apps/web/lib/audio-utils.ts` en la función `synthesizeSpeech`
2. Agregar `ELEVENLABS_API_KEY` a `.env.local`
3. Implementar llamada a la API de ElevenLabs
4. Actualizar el schema de Agent para incluir `voiceId` de ElevenLabs

## Próximos Pasos (Futuro)

### Step 2: ElevenLabs Integration
- Reemplazar OpenAI TTS con ElevenLabs para mejor calidad de voz
- Agregar selección de voces personalizadas
- Streaming de TTS para menor latencia

### Step 3: 3D Avatar + Lip Sync
- Integrar WebRTC para baja latencia
- Streaming de transcripciones en tiempo real
- Sincronización de labios con audio TTS
- Avatar 3D animado

## Desarrollo

### Scripts disponibles

```bash
# Desarrollo (todos los workspaces)
pnpm dev -r

# Linting
pnpm lint

# Tests
pnpm test
```

### Testing

Ejecutar tests unitarios:
- Schemas Zod (Agent/ConversationState)
- Guardrails: prompt injection refusal, system prompt leak prevention
- Storage read/write roundtrip
- Integration smoke test: crear agente → crear conversación → enviar mensaje → verificar respuesta

## Notas de Arquitectura

- **Almacenamiento**: Actualmente basado en archivos JSON para agentes/conversaciones. PostgreSQL con Prisma para metadatos de documentos. AWS S3 para almacenamiento de archivos de documentos.
- **Streaming**: Implementado usando Server-Sent Events (SSE) para respuestas del chat
- **Seguridad**: Los guardrails se aplican antes de llamar al LLM, evitando costos innecesarios
- **Costos**: Estimación aproximada basada en conteo de caracteres (1 token ≈ 4 caracteres). Para precisión, usar tokenización real del modelo.
- **Documentos**: 
  - Almacenamiento provider-agnóstico con AWS S3 como implementación por defecto
  - Soporte para PDF, TXT, DOCX con extracción de texto y chunking automático
  - Sistema de resúmenes estructurados generados con LLM
- **RAG Inteligente**: 
  - Sistema híbrido de dos niveles (resúmenes + chunks)
  - Análisis automático del tipo de consulta para optimizar retrieval
  - Resúmenes para eficiencia, chunks para precisión
  - Preparado para migrar a embeddings/vector DB en el futuro.

## Licencia

ISC

