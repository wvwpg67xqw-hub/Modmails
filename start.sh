#!/bin/bash
set -e

# ── Clone repo if not already cloned ──────────────────────────────────────────
if [ ! -d .git ]; then
  git clone https://github.com/wvwpg67xqw-hub/Modmails .
fi

# ── Auto-update ────────────────────────────────────────────────────────────────
if [[ "${AUTO_UPDATE}" == "1" ]]; then
  git pull
fi

# ── Install pnpm if missing ────────────────────────────────────────────────────
if ! command -v pnpm &> /dev/null; then
  npm install -g pnpm
fi

# ── Install dependencies ───────────────────────────────────────────────────────
pnpm install --frozen-lockfile

# ── Build the bot ──────────────────────────────────────────────────────────────
pnpm --filter @workspace/api-server run build

# ── Start ─────────────────────────────────────────────────────────────────────
node artifacts/api-server/dist/index.mjs
