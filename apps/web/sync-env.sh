#!/bin/bash

# Script to manually sync root .env.local to apps/web/.env.local
# Usage: ./sync-env.sh

ROOT_ENV="../../.env.local"
LOCAL_ENV=".env.local"

if [ ! -f "$ROOT_ENV" ]; then
  echo "❌ Root .env.local not found at: $ROOT_ENV"
  exit 1
fi

cp "$ROOT_ENV" "$LOCAL_ENV"
echo "✅ Synced root .env.local to apps/web/.env.local"
echo "   You may need to restart your Next.js dev server for changes to take effect"

