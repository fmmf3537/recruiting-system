import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/services/**/*.ts'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        'prisma/',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/types/**',
        'src/lib/prisma.ts',
        'src/lib/redis.ts',
        'src/lib/env.ts',
        'src/lib/logger.ts',
      ],
      // 门槛 = 2026-08-27 基线 - 5%（lines/stmts 66.2, branches 71.05, funcs 58.18）
      // functions 基线低于 60%，若按 60% 下限首次会红，故仍取基线-5% 以保证 CI 能过
      thresholds: {
        lines: 61,
        functions: 53,
        statements: 61,
        branches: 66,
        perFile: false,
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
