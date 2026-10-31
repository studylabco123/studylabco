import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const testEnv = (): Record<string, string> => {
  try {
    return parseEnv(readFileSync(".env.test", "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
};

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          // Loads .env.test (SUPABASE_DB_URL etc.) for the database tests.
          env: testEnv(),
          // All DB test files share one local database: run them one at a time.
          fileParallelism: false,
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
