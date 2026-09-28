import { defineConfig } from "vitest/config";

export default defineConfig({
  // "web" is how the e2e container (docker-compose.yml) reaches the dev server.
  server: { strictPort: true, allowedHosts: ["web", "localhost"] },
  worker: { format: "es" }, // MapLibre starts its worker as an ES module
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
