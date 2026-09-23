import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query", "axios"],
          antd: ["antd", "@ant-design/icons"],
          charts: ["recharts"],
          editor: ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/extension-image", "@tiptap/extension-placeholder"],
          motion: ["framer-motion"],
          utils: ["lucide-react", "papaparse", "zod"],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5176,
    strictPort: true,
  },
});
