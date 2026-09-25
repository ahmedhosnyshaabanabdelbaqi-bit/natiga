import type { Config } from 'jest';

/**
 * e2e tests (supertest) against real PostgreSQL + Redis. Self-contained:
 * global setup creates a uniquely named template DB (migrations + reference
 * seed), every test app clones it, and everything is dropped afterwards.
 * Keep `transform` in sync with /jest.config.ts.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
    '^.+\\.m?js$': '<rootDir>/test/jest/esm-to-cjs.transformer.cjs',
  },
  // tsconfig.jest.json compiles tests as CommonJS so dynamic import() (used by
  // the Prisma 7 client to load its query compiler) becomes require() inside Jest.
  transformIgnorePatterns: [],
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/utils/global-setup.ts',
  globalTeardown: '<rootDir>/test/utils/global-teardown.ts',
  setupFiles: ['<rootDir>/test/utils/setup-env.ts'],
  testTimeout: 60_000,
  maxWorkers: 4,
};

export default config;
