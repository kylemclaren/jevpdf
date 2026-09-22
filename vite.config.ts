import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { typesafeProxy } from "./server/typesafe-proxy.ts"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix: read TYPESAFE_API_KEY on the server only. It is never
  // exposed through import.meta.env (that requires the VITE_ prefix).
  const env = loadEnv(mode, process.cwd(), "")
  return {
    plugins: [react(), tailwindcss(), typesafeProxy(env.TYPESAFE_API_KEY)],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  }
})
