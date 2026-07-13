import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      thresholds: { statements: 85, branches: 80, functions: 85, lines: 85 },
      reporter: ['text', 'lcov']
    }
  }
});
