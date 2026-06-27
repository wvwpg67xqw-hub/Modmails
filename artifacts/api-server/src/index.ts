import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startBot } from "./modmail/bot.js";

// ── Environment validation ─────────────────────────────────────────────────────

const REQUIRED_ENV = ["PORT", "DISCORD_TOKEN", "STAFF_SERVER_ID", "MAIN_SERVER_ID"] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.error({ missing: key }, `Required environment variable "${key}" is not set`);
    process.exit(1);
  }
}

const port = Number(process.env["PORT"]);

if (Number.isNaN(port) || port <= 0) {
  logger.error({ value: process.env["PORT"] }, "Invalid PORT value");
  process.exit(1);
}

// ── HTTP server ────────────────────────────────────────────────────────────────

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Failed to start HTTP server");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// ── Discord bot ────────────────────────────────────────────────────────────────

startBot();

// ── Graceful shutdown ──────────────────────────────────────────────────────────

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down…");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Forced exit after timeout");
    process.exit(1);
  }, 8000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
