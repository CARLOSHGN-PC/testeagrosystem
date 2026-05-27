import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

function buildVersionPlugin(buildVersion) {
  return {
    name: "agrosystem-build-version",
    apply: "build",
    buildStart() {
      const publicDir = path.resolve(process.cwd(), "public");
      const versionFile = path.join(publicDir, "version.json");

      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }

      fs.writeFileSync(
        versionFile,
        JSON.stringify(
          {
            version: buildVersion,
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf-8",
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const buildVersion = new Date().toISOString();

  return {
    define: {
      __APP_BUILD_VERSION__: JSON.stringify(buildVersion),
    },
    server: {
      proxy: {
        "/api": {
          target: env.VITE_API_BASE_URL || "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
    plugins: [
      buildVersionPlugin(buildVersion),
      react(),
      VitePWA({
        registerType: "prompt",
        devOptions: {
          enabled: false,
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
          maximumFileSizeToCacheInBytes: 5000000,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/(api\.)?mapbox\.com\/.*$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "agrosystem-mapbox-api-cache",
                expiration: {
                  maxEntries: 3000,
                  maxAgeSeconds: 60 * 60 * 24 * 180,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/(a|b|c|d)\.tiles\.mapbox\.com\/.*$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "agrosystem-mapbox-tiles-cache",
                expiration: {
                  maxEntries: 20000,
                  maxAgeSeconds: 60 * 60 * 24 * 180,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*$/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "agrosystem-firebase-storage-cache",
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 60 * 24 * 90,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        manifest: {
          name: "AgroSystem",
          short_name: "AgroSystem",
          description: "Sistema Offline-First de Gestão Agrícola",
          theme_color: "#111a2d",
          background_color: "#111a2d",
          display: "standalone",
          orientation: "portrait",
          icons: [
            {
              src: "icon-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        },
      }),
    ],
    base: "/",
  };
});
