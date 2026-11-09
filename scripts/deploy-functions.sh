#!/usr/bin/env bash
set -euo pipefail

export PATH="/Users/claude/homebrew/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /Users/claude/Projects/Nodes

echo "=========================================="
echo "  Brain Edge Functions Deploy"
echo "  Project: iihjcqiiavleyheqzotl"
echo "=========================================="
echo ""

if ! npx -y supabase projects list --output-format text >/dev/null 2>&1; then
  echo "Supabase login required."
  npx -y supabase login --output-format text
fi

echo ""
echo "Deploying 'accounts' function..."
npx -y supabase functions deploy accounts --project-ref iihjcqiiavleyheqzotl --no-verify-jwt

echo ""
echo "Deploying 'task-events' function..."
npx -y supabase functions deploy task-events --project-ref iihjcqiiavleyheqzotl --no-verify-jwt

echo ""
echo "=========================================="
echo "✓ Functions deployed successfully!"
echo "=========================================="
