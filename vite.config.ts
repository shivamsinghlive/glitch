import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { configFromEnv, createLlmProxy } from "./server/llmProxy";

const PROJECT_ROOT = import.meta.dirname;

// Same /api/llm proxy the production server uses, so the Groq key stays server-side in dev too
function vitePluginLlmProxy(): Plugin {
  return {
    name: "glitch-llm-proxy",
    configureServer(server: ViteDevServer) {
      const env = { ...loadEnv(server.config.mode, PROJECT_ROOT, ""), ...process.env };
      server.middlewares.use(createLlmProxy(configFromEnv(env)));
    },
  };
}

const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginLlmProxy()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
