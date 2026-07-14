import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
      reporter: ['text', 'lcov'],
      exclude: ['src/server.js', 'src/tests/**'],
    },
  },
});
