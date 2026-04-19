#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════
# TechPlan 一键安装脚本 (macOS / Linux)
# 自动检测并安装 Node.js 18+ 和 Claude Code CLI，然后构建项目
# ═══════════════════════════════════════════════════════

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}!${RESET} $*"; }
error() { echo -e "${RED}✗${RESET} $*"; exit 1; }

MIN_NODE_MAJOR=18
NVM_VERSION="v0.40.3"

# ── Detect OS ──
OS="$(uname -s)"
case "$OS" in
  Darwin) info "Detected: macOS" ;;
  Linux)  info "Detected: Linux" ;;
  *)      error "Unsupported OS: $OS" ;;
esac

# ── Check git ──
if ! command -v git &>/dev/null; then
  error "git is required but not found. Install it first:
  macOS:  xcode-select --install
  Linux:  sudo apt install git  (or yum/dnf equivalent)"
fi

# ── Check Node.js ──
check_node() {
  if command -v node &>/dev/null; then
    local ver
    ver=$(node -e "process.stdout.write(process.versions.node)")
    local major=${ver%%.*}
    if [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
      info "Node.js $ver found (≥ ${MIN_NODE_MAJOR}.0.0)"
      return 0
    else
      warn "Node.js $ver found but need ≥ ${MIN_NODE_MAJOR}.0.0"
      return 1
    fi
  else
    warn "Node.js not found"
    return 1
  fi
}

# ── Install Node.js ──
install_node() {
  echo ""
  echo -e "${BOLD}Installing Node.js...${RESET}"

  # macOS: try Homebrew first (simpler, no shell config needed)
  if [ "$OS" = "Darwin" ] && command -v brew &>/dev/null; then
    info "Homebrew found, installing via brew..."
    brew install node
    if check_node; then return 0; fi
    warn "brew install failed, falling back to nvm..."
  fi

  # nvm install (works on both macOS and Linux)
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

  if [ ! -d "$NVM_DIR" ]; then
    info "Installing nvm $NVM_VERSION..."
    curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash
  else
    info "nvm already installed at $NVM_DIR"
  fi

  # Source nvm
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  if ! type nvm &>/dev/null 2>&1; then
    error "nvm installation failed. Please install Node.js manually: https://nodejs.org"
  fi

  # Install latest LTS Node.js
  info "Installing Node.js LTS..."
  nvm install --lts
  nvm use --lts

  local ver
  ver=$(node -e "process.stdout.write(process.versions.node)")
  info "Node.js $ver installed successfully"
}

# ── Determine if sudo is needed for global npm ──
need_sudo_for_npm() {
  # nvm-managed Node never needs sudo
  if [ -d "${NVM_DIR:-$HOME/.nvm}" ] && type nvm &>/dev/null 2>&1; then
    return 1  # false — no sudo needed
  fi
  # Homebrew-managed Node never needs sudo
  if [ "$OS" = "Darwin" ] && command -v brew &>/dev/null; then
    local npm_prefix
    npm_prefix=$(npm prefix -g 2>/dev/null || echo "")
    if [[ "$npm_prefix" == "$(brew --prefix 2>/dev/null)"* ]]; then
      return 1  # false
    fi
  fi
  # System Node typically needs sudo for -g
  local npm_prefix
  npm_prefix=$(npm prefix -g 2>/dev/null || echo "/usr")
  [ -w "$npm_prefix" ] && return 1 || return 0
}

# ── Check Claude Code CLI ──
check_claude() {
  if command -v claude &>/dev/null; then
    info "Claude Code CLI found"
    return 0
  else
    warn "Claude Code CLI not found"
    return 1
  fi
}

# ── Install Claude Code CLI ──
install_claude() {
  echo ""
  echo -e "${BOLD}Installing Claude Code CLI...${RESET}"
  local sudo_cmd=""
  if need_sudo_for_npm; then
    warn "System Node detected, using sudo for global install..."
    sudo_cmd="sudo"
  fi
  $sudo_cmd npm install -g @anthropic-ai/claude-code
  if command -v claude &>/dev/null; then
    info "Claude Code CLI installed"
  else
    warn "Claude Code CLI installation may have failed"
    echo "  You can install manually: npm install -g @anthropic-ai/claude-code"
  fi
}

# ── Authenticate Claude Code ──
auth_claude() {
  echo ""
  echo -e "${BOLD}Checking Claude Code authentication...${RESET}"
  if claude --version &>/dev/null 2>&1; then
    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
      info "ANTHROPIC_API_KEY environment variable set"
    else
      echo -e "${YELLOW}Claude Code needs authentication.${RESET}"
      echo ""
      echo "  Options:"
      echo "  1. Run:  ${BOLD}claude auth login${RESET}   (interactive OAuth login)"
      echo "  2. Or set environment variable:"
      echo "     ${BOLD}export ANTHROPIC_API_KEY=sk-ant-...${RESET}"
      echo ""
      read -rp "Run 'claude auth login' now? [Y/n] " answer
      case "$answer" in
        n*|N*) warn "Skipping Claude Code auth. Run 'claude auth login' later." ;;
        *)
          # Try claude auth login first, fallback to claude login
          claude auth login 2>/dev/null || claude login 2>/dev/null || {
            warn "Login command not available."
            echo "  Try: claude auth login"
            echo "  Or:  export ANTHROPIC_API_KEY=sk-ant-..."
          }
          ;;
      esac
    fi
  fi
}

# ── Build project ──
build_project() {
  echo ""
  echo -e "${BOLD}Installing dependencies...${RESET}"
  npm install

  echo ""
  echo -e "${BOLD}Building project...${RESET}"
  npm run build
}

# ── Main ──
main() {
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════${RESET}"
  echo -e "${BOLD}   TechPlan — One-Click Setup${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════${RESET}"
  echo ""

  if ! check_node; then
    install_node
  fi

  if ! check_claude; then
    install_claude
  fi

  build_project
  auth_claude

  echo ""
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════${RESET}"
  echo -e "${GREEN}${BOLD}   Setup complete!${RESET}"
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════${RESET}"
  echo ""
  echo "  Start dev server:   ${BOLD}npm run dev${RESET}"
  echo "  Start production:   ${BOLD}npm start${RESET}"
  echo ""
  echo "  Skills are in:      .claude/skills/"
  echo "  (research → extract → sync-graph → report)"
  echo ""
}

main
