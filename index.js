const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

// ----------------------
// Auto-update (optional)
// ----------------------
if (process.env.AUTO_UPDATE === "1") {
  run("git pull");
}

// ----------------------
// Ensure pnpm (proper way)
// ----------------------
run("corepack enable");
run("corepack prepare pnpm@latest --activate");

// ----------------------
// Install dependencies (with OOM + timeout resilience)
// ----------------------
run("pnpm install --frozen-lockfile", {
  env: {
    ...process.env,
    NODE_OPTIONS: "--max-old-space-size=384",
  },
});

// ----------------------
// Build workspace
// ----------------------
run("pnpm --filter @workspace/api-server run build");

// ----------------------
// Locate entry file
// ----------------------
const entry = path.join(
  __dirname,
  "artifacts",
  "api-server",
  "dist",
  "index.mjs"
);

if (!fs.existsSync(entry)) {
  console.error(`Build failed or missing output: ${entry}`);
  process.exit(1);
}

// ----------------------
// Start application
// ----------------------
console.log(`> Starting: node ${entry}`);

const child = spawn("node", [entry], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("Failed to start process:", err);
  process.exit(1);
});
