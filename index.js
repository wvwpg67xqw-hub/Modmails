const { execSync, spawn } = require("child_process");
const path = require("path");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// Auto-update
if (process.env.AUTO_UPDATE === "1") {
  run("git pull");
}

// Install pnpm if missing
try {
  execSync("pnpm --version", { stdio: "ignore" });
} catch {
  run("npm install -g pnpm");
}

// Install dependencies & build
run("pnpm install --frozen-lockfile");
run("pnpm --filter @workspace/api-server run build");

// Start the bot
const entry = path.join(__dirname, "artifacts", "api-server", "dist", "index.mjs");
console.log(`> node ${entry}`);

const child = spawn("node", [entry], { stdio: "inherit", env: process.env });

child.on("exit", (code) => process.exit(code ?? 0));
