import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const filteredLogger = {
  info(msg: any, _options?: any) {
    console.info(msg);
  },
  warn(msg: any, _options?: any) {
    console.warn(msg);
  },
  error(msg: any, _options?: any) {
    // Filter out noisy WS proxy errors from Vite dev server
    if (typeof msg === "string") {
      if (msg.includes("ws proxy error") || msg.includes("ws proxy socket error")) {
        return;
      }
    } else if (msg instanceof Error) {
      const message = msg.message || "";
      if (message.includes("ECONNABORTED") || message.includes("ECONNRESET")) {
        return;
      }
    }

    console.error(msg);
  },
  clearScreen() {
    // Do not clear user's terminal
  },
} as any;

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react()],
  customLogger: filteredLogger,
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        changeOrigin: true,
        ws: true,
        configure: (proxy: any) => {
          // Remove Vite's default error listeners so we can control logging ourselves
          proxy.removeAllListeners("error");

          proxy.on("error", (err: any) => {
            const code = err?.code as string | undefined;

            // Ignore expected aborted/closed socket errors during development
            if (code === "ECONNABORTED" || code === "ECONNRESET" || code === "EPIPE") {
              return;
            }

            // Log other errors so they are still visible
            // eslint-disable-next-line no-console
            console.error("[vite ws proxy error]", err);
          });
        },
      },
    },
  },
});
