import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Opt-in PWA-in-dev: the dev service worker breaks Vite's HMR websocket and
  // spams cache errors, so only enable it when explicitly testing the PWA:
  //   VITE_PWA_DEV=true npm run dev -- --host
  const env = loadEnv(mode, process.cwd(), "");
  const pwaInDev = env.VITE_PWA_DEV === "true";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: {
          enabled: pwaInDev,
        },
        includeAssets: [
          "favicon.svg",
          "favicon-16.png",
          "favicon-32.png",
          "apple-touch-icon.png",
        ],
        manifest: {
          name: "Grano · specialty coffee",
          short_name: "Grano",
          description: "Grano — a specialty coffee brewing companion.",
          theme_color: "#f3ede2",
          background_color: "#f3ede2",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa-maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
  };
});
