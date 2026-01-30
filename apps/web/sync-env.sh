#!/bin/bash

# Script to manually sync root .env to apps/web/.env.local
# Usage: ./sync-env.sh
# Note: next.config.ts handles this automatically, but you can run this manually if needed

ROOT_ENV="../../.env"
LOCAL_ENV=".env.local"

if [ ! -f "$ROOT_ENV" ]; then
  echo "❌ Root .env not found at: $ROOT_ENV"
  exit 1
fi

cp "$ROOT_ENV" "$LOCAL_ENV"
echo "✅ Synced root .env to apps/web/.env.local"
echo "   You may need to restart your Next.js dev server for changes to take effect"

