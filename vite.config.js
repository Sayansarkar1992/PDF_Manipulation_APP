import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("/react/") || id.includes("/react-dom/")) {
            return "react-vendor";
          }

          if (id.includes("/pdf-lib/")) {
            return "pdf-lib";
          }

          if (id.includes("/jspdf/") || id.includes("/html2canvas/") || id.includes("/dompurify/")) {
            return "compress-tools";
          }

          if (id.includes("/pdfjs-dist/")) {
            return "pdfjs";
          }

          if (id.includes("/jszip/")) {
            return "zip-tools";
          }
        },
      },
    },
  },
});
