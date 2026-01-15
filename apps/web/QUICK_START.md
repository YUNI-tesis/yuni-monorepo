# Quick Start - Realtime Voice Calls

Get up and running with voice calls in 5 minutes! 🚀

---

## 1. Prerequisites

- Node.js 18+ installed
- pnpm installed
- PostgreSQL database running
- OpenAI API key (required)
- ElevenLabs API key (optional)

---

## 2. Setup (First Time Only)

### Install dependencies:
```bash
cd apps/web
pnpm install
```

### Configure environment:
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```bash
OPENAI_API_KEY=sk-...                    # Required
DATABASE_URL=postgresql://...            # Required
ELEVENLABS_API_KEY=...                   # Optional
WS_PORT=3001                             # Optional (default: 3001)
```

### Setup database:
```bash
pnpm db:push     # Push schema to database
```

---

## 3. Start Servers

### Easy way (one command):
```bash
./start-dev.sh
```

### Manual way (two terminals):
```bash
# Terminal 1: WebSocket Server
pnpm ws:dev

# Terminal 2: Next.js Server
pnpm dev
```

---

## 4. Configure Agent

1. Go to `http://localhost:3000`
2. Login/Register
3. Create a new agent or edit existing
4. Add voice configuration:

```json
{
  "voice": {
    "provider": "openai",
    "voiceId": "alloy",
    "speakingRate": 1.0
  }
}
```

**Available voices:**
- OpenAI: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
- ElevenLabs: Get voice ID from https://elevenlabs.io/voices

---

## 5. Make a Call

1. Click on your agent
2. Click **"Voice Call"** button
3. Select **"Realtime Mode"**
4. Allow microphone permissions
5. **Start talking!** 🎙️

The system will:
- ✅ Automatically detect when you stop speaking
- ✅ Transcribe your speech
- ✅ Generate a response
- ✅ Play the response in the configured voice

---

## 6. During the Call

### Controls:
- 🔇 **Mute/Unmute**: Toggle microphone
- ⏸️ **Interrupt**: Stop agent mid-sentence (barge-in)
- 🛑 **End Call**: Hang up

### What you'll see:
- Your transcript (as you speak)
- Agent response (as text)
- Status indicator (listening, thinking, speaking)

---

## 7. Troubleshooting

### Server won't start?
```bash
# Check if port is in use
lsof -ti:3001 | xargs kill -9

# Try again
./start-dev.sh
```

### No audio from agent?
1. Check browser console for errors
2. Verify OpenAI API key is valid
3. Check agent voice configuration
4. Try a different browser

### Transcription not working?
1. Allow microphone permissions
2. Check browser console
3. Verify WebSocket connection: `ws://localhost:3001`

### High latency?
1. Check internet connection
2. Try OpenAI TTS (faster than ElevenLabs)
3. Reduce `silence_duration_ms` in server config

---

## 8. Next Steps

- 📖 Read full documentation: `REALTIME_SETUP.md`
- 🏗️ Learn about architecture: `REALTIME_MIGRATION.md`
- 🔧 Configure advanced settings in `server/ws-server.ts`
- 🎨 Customize UI in `src/components/LiveCall.tsx`

---

## 9. Example Agent Configuration

Here's a complete agent configuration for voice calls:

```json
{
  "name": "Spanish Tutor",
  "description": "A friendly Spanish language tutor",
  "systemPrompt": "You are a helpful Spanish language tutor. Speak clearly and correct pronunciation gently.",
  "context": "Focus on conversational Spanish. Use simple vocabulary.",
  "voice": {
    "provider": "openai",
    "voiceId": "nova",
    "speakingRate": 0.9
  }
}
```

---

## 10. Cost Estimates

**Per 5-minute call:**
- Realtime API: $0.05 - $0.15
- TTS: $0.01 - $0.03
- **Total**: ~$0.06 - $0.18

**Free tier:**
- OpenAI: Pay-as-you-go
- ElevenLabs: 10,000 characters/month free

---

## Need Help?

- Check logs: Server terminal and browser console
- Review `REALTIME_SETUP.md` for detailed troubleshooting
- All errors are logged with `[Realtime]`, `[WebSocket]`, or `[TTS]` prefixes

---

**You're all set! Enjoy natural voice conversations with your AI agents! 🎉**
