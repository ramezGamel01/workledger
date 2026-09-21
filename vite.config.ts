import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import vinext from "vinext";

import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

export default defineConfig(async ({ mode }) => {
  const shared = {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@server": fileURLToPath(new URL("./", import.meta.url)),
      },
    },
    test: {
      environment: "jsdom" as const,
      globals: true,
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["./src/test/setup.ts"],
    },
  };
  if (mode === "test") {
    return { ...shared, plugins: [react()] };
  }
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    ...shared,
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          main: "vinext/server/fetch-handler",
          compatibility_flags: ["nodejs_compat"],
          d1_databases: [
            {
              binding: hostingConfig.d1,
              database_name: "workledger-d1",
              database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
            },
          ],
          r2_buckets: [
            {
              binding: hostingConfig.r2,
              bucket_name: "workledger-r2",
            },
          ],
        },
      }),
    ],
  };
});
