import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"] },
      },
      {
        // Talks to the real Supabase project in .env.local: npm run test:remote
        extends: true,
        test: { name: "remote", include: ["tests/remote/**/*.test.ts"] },
      },
    ],
  },
});
