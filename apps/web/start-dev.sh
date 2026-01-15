#!/bin/bash

# Start Development Servers
# Runs both Next.js and WebSocket servers concurrently

set -e

echo "🚀 Starting Yuni AI Development Servers..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "⚠️  Warning: .env.local not found!"
  echo "   Please copy .env.example to .env.local and configure your environment variables."
  echo ""
  exit 1
fi

# Check if OPENAI_API_KEY is set
if ! grep -q "OPENAI_API_KEY=sk-" .env.local; then
  echo "⚠️  Warning: OPENAI_API_KEY not configured in .env.local"
  echo "   The Realtime API requires a valid OpenAI API key."
  echo ""
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
  echo ""
fi

echo "✅ Starting servers..."
echo ""
echo "   📡 WebSocket Server: http://localhost:3001"
echo "   🌐 Next.js Server: http://localhost:3000"
echo ""
echo "   Press Ctrl+C to stop all servers"
echo ""

# Use trap to ensure both processes are killed on exit
trap 'kill 0' EXIT

# Start both servers in parallel
pnpm ws:dev &
pnpm dev &

# Wait for all background processes
wait
