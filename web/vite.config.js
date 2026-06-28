import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" => funciona tanto no dev quanto hospedado em qualquer subpasta estatica.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173, open: true },
});
