import { defineConfig } from 'vite';

// Witch's Brew build configuration.
// Havok ships its physics core as a WASM module; it must not be pre-bundled so
// that the `?url` import of the .wasm file resolves to a real asset.
export default defineConfig({
  base: './',
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5173,
  },
});
