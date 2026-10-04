import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La página se compila dentro de gateway/public para que el gateway la sirva.
// En desarrollo (npm run web:dev) las llamadas /api van al gateway local.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../gateway/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
