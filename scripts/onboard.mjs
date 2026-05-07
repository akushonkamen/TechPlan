#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════
// TechPlan — Guided Onboard Script
// Interactive setup wizard inspired by OpenClaw's onboard flow
//
// Usage:
//   node scripts/onboard.mjs              # Interactive
//   node scripts/onboard.mjs --quickstart # Non-interactive, accept defaults
//   node scripts/onboard.mjs --skip-health # Skip health check
// ═══════════════════════════════════════════════════════════

import {
  intro,
  outro,
  select,
  confirm,
  text,
  spinner,
  log,
  isCancel,
  cancel,
} from "@clack/prompts";
import { execSync, spawn } from "child_process";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
} from "fs";
import { randomBytes } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Constants ──

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = dirname(dirname(__filename));
const MIN_NODE_MAJOR = 18;

// ── CLI Flag Parsing ──

const args = process.argv.slice(2);
const flags = {
  quickstart: args.includes("--quickstart"),
  skipHealth: args.includes("--skip-health"),
  port: getFlag("--port"),
  adminToken: getFlag("--admin-token"),
  maxUpload: getFlag("--max-upload"),
  scheduler: getFlag("--scheduler"),
};

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// ── Helpers ──

function handleCancel(value) {
  if (isCancel(value)) {
    cancel("Setup cancelled.");
    process.exit(0);
  }
  return value;
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      stdio: "pipe",
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

function generateToken() {
  return randomBytes(24).toString("hex");
}

function needsSudoForNpm() {
  // nvm-managed Node never needs sudo
  if (process.env.NVM_DIR && existsSync(process.env.NVM_DIR)) return false;
  // Homebrew-managed Node on macOS
  if (process.platform === "darwin") {
    const brewPrefix = run("brew --prefix 2>/dev/null");
    if (brewPrefix) {
      const npmPrefix = run("npm prefix -g 2>/dev/null");
      if (npmPrefix && npmPrefix.startsWith(brewPrefix)) return false;
    }
  }
  // Check if global npm prefix is writable
  const npmPrefix = run("npm prefix -g 2>/dev/null") || "/usr";
  try {
    const testFile = join(npmPrefix, ".techplan-write-test");
    writeFileSync(testFile, "test");
    unlinkSync(testFile);
    return false;
  } catch {
    return true;
  }
}

// ── Step 0: Welcome ──

async function showWelcome() {
  console.log("");
  console.log("  ╔═══════════════════════════════════════════════╗");
  console.log("  ║  _____       _               ____  _       _  ║");
  console.log("  ║ |_   _|__ __| |_ _ _ ___ _ _|___ \\| | ___ | | ║");
  console.log("  ║   | |/ -_|_-<  _| '_/ _ \\ ' \\ __/ | |/ _ \\| | ║");
  console.log("  ║   |_|\\___/__/\\__|_| \\___/_||_|_| |_|\\___/|_| ║");
  console.log("  ║         Technology Intelligence Platform       ║");
  console.log("  ╚═══════════════════════════════════════════════╝");
  console.log("");

  intro("TechPlan Setup Wizard");

  const mode = handleCancel(
    await select({
      message: "Choose setup mode",
      options: [
        { value: "quickstart", label: "QuickStart (recommended)", hint: "Accept all defaults, minimal prompts" },
        { value: "advanced", label: "Advanced", hint: "Full configuration wizard" },
      ],
    })
  );
  return mode;
}

// ── Step 1: Environment Check ──

function checkEnvironment() {
  log.step("Checking environment...");

  // Node.js version
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);
  if (major >= MIN_NODE_MAJOR) {
    log.success(`Node.js ${version} detected`);
  } else {
    log.error(`Node.js ${version} found, but >= v${MIN_NODE_MAJOR} required`);
    log.info("Install Node.js:");
    log.info("  macOS:  brew install node  or  nvm install --lts");
    log.info("  Linux:  nvm install --lts");
    process.exit(1);
  }

  // git
  if (run("git --version")) {
    log.success("git found");
  } else {
    log.warn("git not found — some features may not work");
    log.info("  macOS:  xcode-select --install");
    log.info("  Linux:  sudo apt install git");
  }

  // npm
  const npmVer = run("npm --version");
  if (npmVer) {
    log.success(`npm ${npmVer} found`);
  } else {
    log.error("npm not found — please install Node.js first");
    process.exit(1);
  }
}

// ── Step 2: Claude Code CLI ──

async function setupClaudeCli() {
  log.step("Checking Claude Code CLI...");

  const existingVersion = run("claude --version");
  if (existingVersion) {
    log.success(`Claude Code CLI found: ${existingVersion.split("\n")[0]}`);
    return;
  }

  log.warn("Claude Code CLI not found");

  const shouldInstall = flags.quickstart || handleCancel(
    await confirm({
      message: "Install Claude Code CLI now? (required for AI features)",
      initialValue: true,
    })
  );

  if (!shouldInstall) {
    log.info("You can install later: npm install -g @anthropic-ai/claude-code");
    log.info("The server will also attempt auto-install on startup.");
    return;
  }

  const s = spinner();
  s.start("Installing Claude Code CLI...");

  const sudoCmd = needsSudoForNpm() ? "sudo " : "";
  const result = run(`${sudoCmd}npm install -g @anthropic-ai/claude-code`, {
    timeout: 120_000,
  });

  const verify = run("claude --version");
  if (verify) {
    s.stop(`Claude Code CLI installed: ${verify.split("\n")[0]}`);
  } else {
    s.stop("Claude Code CLI installation may have failed");
    log.info("Install manually: npm install -g @anthropic-ai/claude-code");
  }
}

// ── Step 2b: Claude Auth ──

async function setupClaudeAuth() {
  if (!run("claude --version")) return;

  if (process.env.ANTHROPIC_API_KEY) {
    log.success("ANTHROPIC_API_KEY environment variable set");
    return;
  }

  if (flags.quickstart) {
    log.warn("Claude Code not authenticated — run 'claude auth login' after setup");
    return;
  }

  const shouldAuth = handleCancel(
    await confirm({
      message: "Authenticate Claude Code now? (recommended)",
      initialValue: true,
    })
  );

  if (!shouldAuth) {
    log.info("Run 'claude auth login' or set ANTHROPIC_API_KEY later");
    return;
  }

  log.info("Starting Claude Code authentication...");
  log.info("Follow the prompts in your browser.");

  try {
    execSync("claude auth login", { stdio: "inherit", cwd: PROJECT_ROOT });
    log.success("Claude Code authenticated");
  } catch {
    log.warn("Authentication may not have completed");
    log.info("You can retry: claude auth login");
    log.info("Or set: export ANTHROPIC_API_KEY=sk-ant-...");
  }
}

// ── Step 3: Install Dependencies ──

async function installDependencies() {
  log.step("Installing dependencies...");

  const s = spinner();
  s.start("Running npm install...");

  try {
    execSync("npm install", {
      stdio: "pipe",
      cwd: PROJECT_ROOT,
      timeout: 300_000,
    });
    s.stop("Dependencies installed");
  } catch (err) {
    s.stop("Dependency installation failed");
    log.error(`npm install failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Step 4: Configuration (Advanced) ──

async function configureEnv(mode) {
  if (mode === "quickstart") {
    log.step("Using default configuration (QuickStart mode)");
    return {};
  }

  log.step("Configuration");

  // Check existing .env
  const envPath = join(PROJECT_ROOT, ".env");
  if (existsSync(envPath)) {
    const overwrite = handleCancel(
      await confirm({
        message: ".env file already exists. Overwrite?",
        initialValue: false,
      })
    );
    if (!overwrite) {
      log.info("Keeping existing .env file");
      return {};
    }
  }

  const port = handleCancel(
    await text({
      message: "Server port",
      initialValue: flags.port || "3000",
      validate: (v) => (isNaN(v) ? "Must be a number" : undefined),
    })
  );

  const adminToken = handleCancel(
    await text({
      message: "Admin token (leave empty to disable auth, or press Enter for random)",
      initialValue: flags.adminToken || "",
      placeholder: generateToken(),
    })
  );

  const maxUpload = handleCancel(
    await text({
      message: "Max upload size (MB)",
      initialValue: flags.maxUpload || "10",
      validate: (v) => (isNaN(v) ? "Must be a number" : undefined),
    })
  );

  const schedulerEnabled = handleCancel(
    await confirm({
      message: "Enable report scheduler?",
      initialValue: flags.scheduler !== "false",
    })
  );

  const config = {
    port,
    adminToken: adminToken || "",
    maxUploadMb: maxUpload,
    schedulerEnabled: String(schedulerEnabled),
  };

  // Write .env
  const lines = [
    "# TechPlan Configuration — generated by onboard",
    `PORT=${config.port}`,
    `ADMIN_TOKEN=${config.adminToken}`,
    `MAX_UPLOAD_SIZE_MB=${config.maxUploadMb}`,
    `SCHEDULER_ENABLED=${config.schedulerEnabled}`,
  ];
  writeFileSync(envPath, lines.join("\n") + "\n");
  log.success("Written .env configuration file");

  // Optionally write config.json if it doesn't exist
  const configPath = join(PROJECT_ROOT, "config.json");
  if (!existsSync(configPath)) {
    const initialConfig = {
      schedulerEnabled: schedulerEnabled,
      schedulerCheckIntervalMinutes: 30,
    };
    writeFileSync(configPath, JSON.stringify(initialConfig, null, 2) + "\n");
    log.success("Written initial config.json");
  } else {
    log.info("config.json already exists, skipping");
  }

  return config;
}

// ── Step 5: Build ──

async function buildProject() {
  log.step("Building project...");

  const s = spinner();
  s.start("Running npm run build...");

  try {
    execSync("npm run build", {
      stdio: "pipe",
      cwd: PROJECT_ROOT,
      timeout: 300_000,
    });
    s.stop("Build complete");
  } catch (err) {
    s.stop("Build failed");
    log.error(`Build failed: ${err.message}`);
    log.info("Try building manually: npm run build");
    process.exit(1);
  }

  // Verify output
  if (!existsSync(join(PROJECT_ROOT, "dist", "server.cjs"))) {
    log.error("Build completed but dist/server.cjs not found");
    process.exit(1);
  }
  if (!existsSync(join(PROJECT_ROOT, "dist", "index.html"))) {
    log.error("Build completed but dist/index.html not found");
    process.exit(1);
  }
  log.success("Build artifacts verified");
}

// ── Step 5b: Z-Image Turbo Setup ──

async function setupZImage() {
  log.step("Setting up Z-Image-Turbo (cover image generation)...");

  const arch = run("uname -m");
  if (arch !== "arm64" && arch !== "aarch64") {
    log.warn("Z-Image-Turbo requires Apple Silicon (M1/M2/M3/M4). Skipping.");
    log.info("Reports will work without cover images.");
    return;
  }
  log.success(`Apple Silicon detected (${arch})`);

  // Check uv
  const uvVer = run("uv --version");
  if (!uvVer) {
    log.warn("uv not found — installing...");
    run("curl -LsSf https://astral.sh/uv/install.sh | sh", { timeout: 60_000 });
    if (!run("uv --version")) {
      log.warn("uv installation failed. Install manually: https://docs.astral.sh/uv/");
      log.info("Then run: cd ~/projects/z-image-inference && uv sync");
      return;
    }
  }
  log.success(`uv found: ${(run("uv --version") || "").split("\n")[0]}`);

  // Clone z-image-inference
  const zimageDir = join(PROJECT_ROOT, "..", "z-image-inference");
  const zimageResolved = run(`realpath "${zimageDir}"`) || zimageDir;

  if (existsSync(zimageResolved)) {
    log.success(`z-image-inference already at ${zimageResolved}`);
  } else {
    const shouldClone = flags.quickstart || handleCancel(
      await confirm({
        message: "Clone z-image-inference for cover image generation?",
        initialValue: true,
      })
    );

    if (!shouldClone) {
      log.info("Clone later: git clone git@github.com:OrdinarySF/z-image-inference.git ~/projects/z-image-inference");
      return;
    }

    const s = spinner();
    s.start("Cloning z-image-inference...");
    const cloneResult = run("git clone git@github.com:OrdinarySF/z-image-inference.git " + zimageResolved, { timeout: 120_000 })
      || run("git clone https://github.com/OrdinarySF/z-image-inference.git " + zimageResolved, { timeout: 120_000 });

    if (existsSync(zimageResolved)) {
      s.stop("Cloned z-image-inference");
    } else {
      s.stop("Clone failed");
      log.info("Clone manually: git clone git@github.com:OrdinarySF/z-image-inference.git " + zimageResolved);
      return;
    }
  }

  // Install dependencies
  const s = spinner();
  s.start("Installing Z-Image dependencies (uv sync)...");
  const syncResult = run("uv sync", { cwd: zimageResolved, timeout: 300_000 });
  if (syncResult !== null || existsSync(join(zimageResolved, ".venv"))) {
    s.stop("Z-Image dependencies installed");
  } else {
    s.stop("uv sync may have failed");
    log.info("Run manually: cd " + zimageResolved + " && uv sync");
    return;
  }

  log.success("Z-Image-Turbo is ready!");
  log.info("Start model server: cd " + zimageResolved + " && uv run python model_server.py");
  log.info("Or start together: npm run dev:full");
}

// ── Step 5c: ppt-master Setup ──

async function setupPptMaster() {
  log.step("Setting up ppt-master (PPT export)...");

  const pptmasterDir = join(PROJECT_ROOT, "..", "ppt-master");
  const pptmasterResolved = run(`realpath "${pptmasterDir}"`) || pptmasterDir;

  if (existsSync(pptmasterResolved)) {
    log.success(`ppt-master already at ${pptmasterResolved}`);
  } else {
    const shouldClone = flags.quickstart || handleCancel(
      await confirm({
        message: "Clone ppt-master for PPT export?",
        initialValue: true,
      })
    );

    if (!shouldClone) {
      log.info("Clone later: git clone https://github.com/akushonkamen/ppt-master.git " + pptmasterResolved);
      return;
    }

    const s = spinner();
    s.start("Cloning ppt-master...");
    const cloneResult = run("git clone https://github.com/akushonkamen/ppt-master.git " + pptmasterResolved, { timeout: 120_000 });

    if (existsSync(pptmasterResolved)) {
      s.stop("Cloned ppt-master");
    } else {
      s.stop("Clone failed (network issue)");
      log.info("Clone manually: git clone https://github.com/akushonkamen/ppt-master.git " + pptmasterResolved);
      return;
    }
  }

  // Install Python dependencies
  const s = spinner();
  s.start("Installing ppt-master Python dependencies...");
  const pipResult = run("pip3 install -r requirements.txt", { cwd: pptmasterResolved, timeout: 120_000 });
  if (pipResult !== null) {
    s.stop("ppt-master dependencies installed");
  } else {
    s.stop("pip install may have failed");
    log.info("Run manually: cd " + pptmasterResolved + " && pip3 install -r requirements.txt");
  }

  log.success("ppt-master is ready!");
}

// ── Step 6: Health Check ──

async function healthCheck(config) {
  if (flags.skipHealth) {
    log.info("Health check skipped (--skip-health)");
    return;
  }

  const port = config.port || process.env.PORT || "3000";

  let shouldCheck;
  if (flags.quickstart) {
    shouldCheck = false; // skip in quickstart CI mode
  } else {
    shouldCheck = handleCancel(
      await confirm({
        message: "Run a quick health check? (starts server briefly)",
        initialValue: true,
      })
    );
  }

  if (!shouldCheck) {
    log.info("Health check skipped");
    return;
  }

  log.step("Health check");

  const s = spinner();
  s.start(`Starting server on port ${port}...`);

  const serverProcess = spawn("node", ["dist/server.cjs"], {
    cwd: PROJECT_ROOT,
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
    },
    detached: process.platform !== "win32",
  });

  // Wait for server to be ready
  let healthy = false;
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`http://localhost:${port}/api/dashboard/stats`);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // not ready yet
    }
  }

  // Kill server
  try {
    if (process.platform === "win32") {
      serverProcess.kill();
    } else {
      process.kill(-serverProcess.pid, "SIGTERM");
    }
  } catch {
    // process may have already exited
  }

  if (healthy) {
    s.stop("Server started successfully and responded to health check");
    log.success("All systems operational");
  } else {
    s.stop("Health check timed out");
    log.warn("Server did not respond within 16 seconds");
    log.info("This may be normal if port is in use. Try manually: npm start");
  }
}

// ── Step 7: Summary ──

function showSummary(config) {
  const port = config?.port || process.env.PORT || "3000";
  const hasAuth = config?.adminToken
    ? "token set"
    : process.env.ADMIN_TOKEN
      ? "inherited from env"
      : "no auth (open access)";
  const scheduler = config?.schedulerEnabled || "true";

  console.log("");
  outro("TechPlan is ready!");
  console.log("");
  log.info("Configuration:");
  log.info(`  Port:      ${port}`);
  log.info(`  Auth:      ${hasAuth}`);
  log.info(`  Upload:    ${config?.maxUploadMb || "10"} MB max`);
  log.info(`  Scheduler: ${scheduler === "true" ? "enabled" : "disabled"}`);
  console.log("");
  log.info("Quick start:");
  log.info("  npm run dev          Start development server");
  log.info("  npm start            Start production server");
  log.info(`  http://localhost:${port}`);
  console.log("");
  log.info("Next steps:");
  log.info("  1. Run 'npm run dev' to start the development server");
  log.info("  2. Open http://localhost:" + port + " in your browser");
  log.info("  3. Create your first topic and start collecting intelligence");
  console.log("");
  log.info("Skills pipeline:");
  log.info("  research → extract → sync-graph → report");
  console.log("");
  log.info("Cover image generation:");
  log.info("  cd ~/projects/z-image-inference && uv run python model_server.py");
  log.info("  Or start together: npm run dev:full");
  console.log("");
}

// ── Main ──

async function main() {
  // Non-interactive quickstart
  if (flags.quickstart) {
    console.log("");
    console.log("  TechPlan — QuickStart Setup");
    console.log("");

    checkEnvironment();
    await setupClaudeCli();
    await installDependencies();
    await setupZImage();
    await setupPptMaster();
    await buildProject();

    console.log("");
    outro("TechPlan is ready!");
    console.log("");
    log.info("Run: npm run dev");
    log.info("URL: http://localhost:3000");
    console.log("");
    process.exit(0);
  }

  // Interactive mode
  const mode = await showWelcome();

  checkEnvironment();
  await setupClaudeCli();
  await setupClaudeAuth();
  await installDependencies();
  const config = await configureEnv(mode);
  await buildProject();
  await setupZImage();
  await setupPptMaster();
  await healthCheck(config);
  showSummary(config);
}

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
