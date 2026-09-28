import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Unit tests never touch a database; these only satisfy config validation on import.
    env: { DATABASE_URL: "postgres://unit-tests@localhost:1/none", SESSION_SECRET: "unit-test-session-secret-not-used-anywhere-else" },
  },
});
