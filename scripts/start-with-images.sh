#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════
# Start TechPlan + Z-Image model server together
# Flow: Download model → Start model server → Start TechPlan
# ═══════════════════════════════════════════════════════

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ZIMAGE_DIR="$HOME/projects/z-image-inference"
ZIMAGE_PORT=8000
ZIMAGE_PID=""

cleanup() {
  if [ -n "${ZIMAGE_PID:-}" ]; then
    echo ""
    echo -e "${YELLOW}Stopping Z-Image model server (PID $ZIMAGE_PID)...${RESET}"
    kill "$ZIMAGE_PID" 2>/dev/null || true
    wait "$ZIMAGE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ ! -d "$ZIMAGE_DIR" ]; then
  echo -e "${YELLOW}z-image-inference not found at $ZIMAGE_DIR${RESET}"
  echo "  Reports will work without cover images."
  echo "  Install: npm run onboard"
  echo ""
  echo -e "${BOLD}Starting TechPlan (no image generation)...${RESET}"
  echo ""
  npx tsx server.ts
  exit 0
fi

# ── Step 1: Download model (foreground, shows progress) ──

echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo -e "${BOLD}  Step 1/3: Downloading Z-Image Model${RESET}"
echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo ""

(cd "$ZIMAGE_DIR" && uv run python model_server.py --download-only)

if [ $? -ne 0 ]; then
  echo ""
  echo -e "${YELLOW}Model download failed. Starting TechPlan without image generation...${RESET}"
  echo ""
  npx tsx server.ts
  exit 1
fi

echo ""
echo -e "${GREEN}Model downloaded successfully!${RESET}"
echo ""

# ── Step 2: Start model server ──

echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo -e "${BOLD}  Step 2/3: Starting Model Server${RESET}"
echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo ""

(cd "$ZIMAGE_DIR" && uv run python model_server.py) &
ZIMAGE_PID=$!

# Wait for model server to be ready
echo -e "${CYAN}Loading model into memory...${RESET}"
for i in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:${ZIMAGE_PORT}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}Z-Image model server ready at http://127.0.0.1:${ZIMAGE_PORT}${RESET}"
    break
  fi
  if ! kill -0 "$ZIMAGE_PID" 2>/dev/null; then
    echo -e "${YELLOW}Z-Image model server crashed. Starting TechPlan without it...${RESET}"
    unset ZIMAGE_PID
    break
  fi
  if [ $((i % 15)) -eq 0 ]; then
    echo -e "${CYAN}  Still loading... ($((i * 2))s)${RESET}"
  fi
  sleep 2
done

echo ""

# ── Step 3: Start TechPlan ──

echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo -e "${BOLD}  Step 3/3: Starting TechPlan${RESET}"
echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo ""

npx tsx server.ts
