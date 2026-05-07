# ═══════════════════════════════════════════════════════
# TechPlan 一键安装脚本 (Windows PowerShell)
# 自动检测并安装 Node.js 18+ 和 Claude Code CLI，然后构建项目
#
# 使用方法:
#   右键 PowerShell → 以管理员身份运行
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\setup.ps1
# ═══════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$MinNodeMajor = 18

function Write-Info($msg)  { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ── Check admin ──
function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Warn "Not running as administrator."
    Write-Warn "Node.js MSI install may require admin. Re-launch as admin if install fails."
    Write-Host ""
}

# ── Check git ──
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-Err "git is required but not found. Install from: https://git-scm.com/download/win"
}

# ── Check Node.js ──
function Check-Node {
    try {
        $ver = (node -e "process.stdout.write(process.versions.node)" 2>$null)
        if ($LASTEXITCODE -ne 0) { return $false }
        $major = $ver.Split(".")[0]
        if ([int]$major -ge $MinNodeMajor) {
            Write-Info "Node.js $ver found (≥ $MinNodeMajor.0.0)"
            return $true
        } else {
            Write-Warn "Node.js $ver found but need ≥ $MinNodeMajor.0.0"
            return $false
        }
    } catch {
        Write-Warn "Node.js not found"
        return $false
    }
}

# ── Install Node.js ──
function Install-Node {
    Write-Host ""
    Write-Host "Installing Node.js LTS..." -ForegroundColor Cyan

    # Try winget first (Windows 10 1709+)
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Info "Using winget to install Node.js..."
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -eq 0) {
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-Info "Node.js installed via winget"
            return
        }
        Write-Warn "winget install failed, trying MSI fallback..."
    }

    # Fallback: download MSI installer with dynamic version detection
    Write-Info "Downloading Node.js LTS..."
    $ltsVersion = $null

    try {
        # Fetch the LTS version index from nodejs.org
        $indexUrl = "https://nodejs.org/dist/index.json"
        $releases = Invoke-RestMethod -Uri $indexUrl -TimeoutSec 15
        # First entry with lts flag is current LTS
        $ltsRelease = $releases | Where-Object { $_.lts -and $_.lts -ne $false } | Select-Object -First 1
        if ($ltsRelease) {
            $ltsVersion = $ltsRelease.version.TrimStart("v")
            Write-Info "Latest LTS: v$ltsVersion"
        }
    } catch {
        Write-Warn "Could not fetch latest LTS version"
    }

    if (-not $ltsVersion) {
        # Hardcoded fallback (updated periodically)
        $ltsVersion = "22.16.0"
        Write-Warn "Using fallback version: v$ltsVersion"
    }

    $msiUrl = "https://nodejs.org/dist/v$ltsVersion/node-v$ltsVersion-x64.msi"
    $installer = "$env:TEMP\node-install.msi"

    Write-Info "Downloading Node.js v$ltsVersion..."
    Invoke-WebRequest -Uri $msiUrl -OutFile $installer -UseBasicParsing

    Write-Info "Running installer (this may require admin)..."
    Start-Process msiexec.exe -ArgumentList "/i", $installer, "/qn", "/norestart" -Wait -NoNewWindow

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Remove-Item $installer -Force -ErrorAction SilentlyContinue
    Write-Info "Node.js installed"
}

# ── Check Claude Code CLI ──
function Check-Claude {
    try {
        $null = claude --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Claude Code CLI found"
            return $true
        }
    } catch {}
    Write-Warn "Claude Code CLI not found"
    return $false
}

# ── Install Claude Code CLI ──
function Install-Claude {
    Write-Host ""
    Write-Host "Installing Claude Code CLI..." -ForegroundColor Cyan
    npm install -g @anthropic-ai/claude-code
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Claude Code CLI installed"
    } else {
        Write-Warn "Installation may have failed. Install manually: npm install -g @anthropic-ai/claude-code"
    }
}

# ── Authenticate Claude Code ──
function Auth-Claude {
    Write-Host ""
    Write-Host "Checking Claude Code authentication..." -ForegroundColor Cyan
    if ($env:ANTHROPIC_API_KEY) {
        Write-Info "ANTHROPIC_API_KEY environment variable set"
    } else {
        Write-Warn "Claude Code needs authentication."
        Write-Host ""
        Write-Host "  Options:" -ForegroundColor Yellow
        Write-Host "  1. Run:  claude auth login   (interactive OAuth login)"
        Write-Host "  2. Or set environment variable:"
        Write-Host "     `$env:ANTHROPIC_API_KEY = 'sk-ant-...'"
        Write-Host ""
        $answer = Read-Host "Run 'claude auth login' now? [Y/n]"
        if ($answer -ne "n" -and $answer -ne "N") {
            # Try claude auth login first, fallback to claude login
            try {
                claude auth login 2>$null
                if ($LASTEXITCODE -ne 0) { throw "fallback" }
            } catch {
                try {
                    claude login 2>$null
                } catch {
                    Write-Warn "Login command not available."
                    Write-Host "  Try: claude auth login"
                    Write-Host "  Or:  `$env:ANTHROPIC_API_KEY = 'sk-ant-...'"
                }
            }
        } else {
            Write-Warn "Skipping Claude Code auth. Run 'claude auth login' later."
        }
    }
}

# ── Main ──
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   TechPlan — One-Click Setup" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check and install Node.js
if (-not (Check-Node)) {
    Install-Node
    if (-not (Check-Node)) {
        Write-Err "Node.js installation failed. Please install manually: https://nodejs.org"
    }
}

# Check and install Claude Code CLI
if (-not (Check-Claude)) {
    Install-Claude
}

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed" }

# Build
Write-Host ""
Write-Host "Building project..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Err "npm run build failed" }

# Authenticate Claude Code
Auth-Claude

# Done
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "   Setup complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Start dev server:   npm run dev"
Write-Host "  Start production:   npm start"
Write-Host ""
Write-Host "  Skills are in:      .claude\skills\"
Write-Host "  (research -> extract -> sync-graph -> report)"
Write-Host ""
