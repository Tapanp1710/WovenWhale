import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile("../.env");
} catch {
  // Environment supplied by the host (CI / production).
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
