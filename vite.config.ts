import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.PORT ?? 5174);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  // Bundle grande (KaTeX + Markdown) não é problema num app local servido da própria máquina.
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  // transformers.js carrega WASM/ONNX dinamicamente; pré-empacotar quebra os caminhos.
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  server: {
    port: 5173,
    proxy: { '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true } },
  },
});
