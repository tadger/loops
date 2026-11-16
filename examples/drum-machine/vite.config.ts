import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The workspace packages export TypeScript source; Vite compiles it through the workspace symlinks.
export default defineConfig({ plugins: [react()] });
