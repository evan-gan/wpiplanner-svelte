import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [sveltekit()],
  // The permutation search runs in a module worker so the DFS never blocks the UI.
  worker: { format: 'es' },
  resolve: {
    // Mirrors SvelteKit's own $lib alias so `vitest` can resolve it without
    // going through the kit plugin's virtual modules.
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
