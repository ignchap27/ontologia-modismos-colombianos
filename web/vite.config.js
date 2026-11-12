import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// fs.allow deja leer los .rq de la carpeta consultas, que está afuera de web
export default defineConfig({ plugins: [react()], server: { fs: { allow: [".."] } } });
