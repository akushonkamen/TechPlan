import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,js}', 'src/**/*.{test,spec}.{ts,js}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/__tests__/**', '**/*.d.ts', '**/*.config.{ts,js}', 'dist/**', 'node_modules/**'],
    },
  },
});
