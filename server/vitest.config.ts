import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/services/**/*.ts'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        'prisma/',
        '**/*.d.ts',
        '**/types/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    pool: 'forks',
    maxConcurrency: 1,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
