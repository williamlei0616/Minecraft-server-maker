import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest runs the tests; the site itself is built by Next (next.config.mjs).
const base = process.env.PAGES_BASE ?? '/';

export default defineConfig({
  base,
  resolve: {
    // Same "@/..." alias the Next app uses (see tsconfig paths).
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    environment: 'node',
  },
});
