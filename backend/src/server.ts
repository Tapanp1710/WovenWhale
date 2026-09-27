import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./config/env";
import { sqlClient } from "./db/client";
import { startScheduler } from "./jobs";
import { logger } from "./lib/logger";

const app = createApp();
const stopScheduler = process.env.DISABLE_SCHEDULER === "true" ? () => {} : startScheduler();

const server = serve({ fetch: app.fetch, port: env.BACKEND_PORT }, (info) => {
  logger.info("api_listening", { port: info.port, env: env.NODE_ENV });
});

async function shutdown(signal: string) {
  logger.info("api_shutdown", { signal });
  stopScheduler();
  server.close();
  await sqlClient.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
