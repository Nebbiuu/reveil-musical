import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/**/index.ts',
        'src/domain/ports/**',
        'src/domain/models/Track.ts',
        'src/domain/models/UserPreferences.ts',
        'src/domain/models/WakeUpResult.ts',
        'src/application/dto/**',
        'src/application/ports/**',
        '**/*.d.ts',
        'src/demo.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
