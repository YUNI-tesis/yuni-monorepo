# Realtime Voice Call Setup

Esta aplicación ahora soporta llamadas de voz en tiempo real usando **OpenAI Realtime API** para entrada de audio/transcripción/razonamiento, combinado con TTS propio (OpenAI o ElevenLabs) para la salida de voz.

## Arquitectura

```
Cliente (Browser)
    ↓ WebSocket (audio chunks)
Servidor WebSocket (ws-server.ts)
    ↓ WebSocket
OpenAI Realtime API
    ↓ (text response)
TTS Provider (OpenAI/ElevenLabs)
    ↓ (audio chunks)
Cliente (Browser)
```

### Flujo de datos:

1. **Audio entrada**: Usuario habla → Cliente captura audio → Servidor → Realtime API
2. **Transcripción**: Realtime API detecta fin de turno → Transcribe → Servidor → Cliente
3. **Generación**: Realtime API genera texto (no audio) → Servidor recibe texto
4. **TTS**: Servidor envía texto a TTS propio → Genera audio → Streaming al cliente
5. **Barge-in**: Cliente detecta audio nuevo → Interrumpe → Cancela respuesta de Realtime

## Configuración

### 1. Variables de entorno

Agrega las siguientes variables a tu archivo `.env.local`:

```bash
# OpenAI (requerido)
OPENAI_API_KEY=sk-...

# ElevenLabs (opcional, solo si usas ElevenLabs como TTS)
ELEVENLABS_API_KEY=...

# Puerto del servidor WebSocket (opcional, default: 3001)
WS_PORT=3001

# Database
DATABASE_URL=postgresql://...
```

### 2. Instalación de dependencias

```bash
cd apps/web
pnpm install
```

### 3. Iniciar servidores

Necesitas ejecutar **dos servidores** simultáneamente:

**Terminal 1 - Servidor WebSocket:**
```bash
cd apps/web
pnpm ws:dev
```

**Terminal 2 - Servidor Next.js:**
```bash
cd apps/web
pnpm dev
```

## Uso

### 1. Configurar agente con voz

Al crear o editar un agente, usa el selector de voces integrado en el formulario. El sistema detectará automáticamente el modo óptimo:

**Modos disponibles:**

#### 🚀 OpenAI Realtime Audio (Recomendado - Baja Latencia ~500ms):
- **Voces**: `alloy`, `echo`, `shimmer`, `ash`, `ballad`, `coral`, `sage`, `verse`, `marin`, `cedar`
- **Latencia**: Ultra-baja (~500ms end-to-end)
- **Uso**: Conversaciones en tiempo real
- **Configuración automática**: El sistema usa audio directo de Realtime API

#### 🎨 ElevenLabs Custom (Voces Personalizadas - Latencia ~2-3s):
- **Voces**: Predeterminadas + voces custom del usuario
- **Latencia**: Mayor (~2-3s)
- **Uso**: Voces personalizadas, voice cloning
- **Configuración automática**: El sistema usa TTS separado

**Ejemplo de configuración (JSON):**

```json
{
  "name": "Mi Agente",
  "systemPrompt": "...",
  "voice": {
    "provider": "openai",      // o "elevenlabs"
    "voiceId": "nova",          // OpenAI: nova/alloy/echo/etc | ElevenLabs: voice_id
    "speakingRate": 1.0
  }
}
```

> **Nota**: El sistema detecta automáticamente si usar audio directo (baja latencia) o TTS separado (flexible) basándose en la configuración de voz. Ver `HYBRID_VOICE_MODE.md` para más detalles.

### 2. Iniciar llamada

Desde la página del agente, haz clic en el botón de llamada. Esto abrirá el componente `LiveCall` que:

1. Conecta al servidor WebSocket
2. Inicializa sesión de Realtime API
3. Solicita permisos de micrófono
4. Comienza a escuchar

### 3. Interacción

- **Hablar**: Simplemente habla, el sistema detecta automáticamente cuándo terminas
- **Silenciar**: Click en el botón de micrófono para silenciar/activar
- **Interrumpir**: Click en el botón de pausa mientras el asistente habla
- **Terminar**: Click en "End Call" para finalizar

## Características

### ✅ Implementadas

- ✅ OpenAI Realtime API para ASR y generación de texto
- ✅ Detección automática de turnos (turn-taking)
- ✅ Transcripción incremental y final
- ✅ TTS con OpenAI
- ✅ TTS con ElevenLabs
- ✅ Streaming de audio
- ✅ Barge-in / Interrupciones
- ✅ Reconexión automática (Realtime)
- ✅ Métricas de latencia
- ✅ Gestión de costos
- ✅ Historial de conversación

### 🔄 Próximas mejoras

- [ ] VAD en cliente para feedback visual antes de enviar audio
- [ ] Function calling / Tools
- [ ] Soporte para múltiples idiomas
- [ ] Grabación de llamadas
- [ ] Análisis de sentimiento
- [ ] WebRTC (opción alternativa a WebSocket)

## Arquitectura de archivos

```
apps/web/
├── server/
│   ├── types.ts              # Tipos TypeScript (Realtime, WebSocket)
│   ├── realtime-client.ts    # Cliente de Realtime API
│   ├── tts-providers.ts      # Abstracción de TTS (OpenAI, ElevenLabs)
│   └── ws-server.ts          # Servidor WebSocket principal
└── src/
    └── components/
        └── LiveCall.tsx      # Componente de cliente React
```

## Solución de problemas

### El servidor WebSocket no inicia

**Error**: `Address already in use`

**Solución**: El puerto 3001 ya está en uso. Cambia `WS_PORT` en `.env.local` o mata el proceso:
```bash
lsof -ti:3001 | xargs kill -9
```

### No se escucha audio del asistente

**Posibles causas**:
1. **CORS**: Verifica que el servidor WebSocket acepte conexiones del cliente
2. **Formato de audio**: Verifica que el navegador soporte MP3
3. **AudioContext**: Algunos navegadores requieren interacción del usuario antes de reproducir audio

**Solución**: Verifica la consola del navegador para errores específicos.

### La transcripción no aparece

**Posibles causas**:
1. **Permisos de micrófono**: El navegador bloqueó el acceso
2. **Formato de audio incompatible**: Realtime espera PCM 16kHz mono
3. **Conexión Realtime fallida**: Verifica logs del servidor

**Solución**:
```bash
# En el servidor, verifica logs:
[Realtime] Session created: rtc_xxx
[Realtime] Speech started
[Realtime] Speech stopped
[Realtime] Text response complete
```

### Latencia alta

**Causas comunes**:
1. **Red lenta**: Prueba con mejor conexión
2. **TTS lento**: ElevenLabs puede ser más lento que OpenAI
3. **Audio chunks grandes**: Reduce tamaño de chunks en `LiveCall.tsx`

**Optimizaciones**:
- Usa OpenAI TTS para menor latencia
- Reduce `silence_duration_ms` en configuración de Realtime
- Usa formato de audio comprimido (opus vs pcm16)

### Error: "Agent not found"

**Causa**: El agentId no existe en la base de datos

**Solución**: Verifica que el agente esté creado y el ID sea correcto.

## Métricas y observabilidad

El servidor registra las siguientes métricas:

```typescript
{
  latency: {
    asr: 500,      // Audio → Transcripción (ms)
    llm: 1200,     // Transcripción → Texto (ms)
    tts: 300,      // Texto → Primer audio chunk (ms)
    total: 2000    // Total end-to-end (ms)
  },
  usage: {
    input_tokens: 150,
    output_tokens: 80,
  }
}
```

Estos se envían al cliente y se pueden mostrar en un panel de métricas.

## Costos estimados

### OpenAI Realtime API
- **Input**: ~$5 per 1M tokens
- **Output**: ~$15 per 1M tokens
- **Audio**: ~$0.01 por minuto de entrada

### OpenAI TTS
- **Standard**: $15 per 1M characters
- ~$0.015 por 1000 palabras

### ElevenLabs
- **Tier gratuito**: 10,000 caracteres/mes
- **Creator**: $5/mes, 30,000 caracteres/mes
- **Pro**: $22/mes, 100,000 caracteres/mes

**Estimación por llamada de 5 minutos**:
- Realtime API: ~$0.05 - $0.15
- TTS: ~$0.01 - $0.03
- **Total**: ~$0.06 - $0.18 por llamada

## Referencias

- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime WebSocket API](https://platform.openai.com/docs/api-reference/realtime)
- [ElevenLabs API Docs](https://elevenlabs.io/docs/api-reference)
- [WebSocket API (ws)](https://github.com/websockets/ws)

## Soporte

Para problemas o preguntas, revisa los logs del servidor y del cliente. La mayoría de los errores se registran con contexto suficiente para debuggear.

Si encuentras un bug, reporta con:
1. Logs del servidor WebSocket
2. Logs de la consola del navegador
3. Pasos para reproducir
4. Configuración del agente (sin API keys)
