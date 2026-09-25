import type { Config } from 'jest';

/**
 * Unit tests: src/**\/*.spec.ts (no database).
 * Keep `transform`/`transformIgnorePatterns` in sync with test/jest-e2e.config.ts
 * (ESM-only deps such as NestJS 12 are converted to CJS, see
 * test/jest/esm-to-cjs.transformer.cjs and docs/decisions/backend-core.md).
 */
const config: Config = {
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
    '^.+\\.m?js$': '<rootDir>/test/jest/esm-to-cjs.transformer.cjs',
  },
  // tsconfig.jest.json compiles tests as CommonJS so dynamic import() (used by
  // the Prisma 7 client to load its query compiler) becomes require() inside Jest.
  transformIgnorePatterns: [],
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/cli/**', '!src/main.ts'],
  coverageDirectory: './coverage',
};

export default config;
