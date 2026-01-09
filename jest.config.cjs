/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
    "!src/**/__tests__/**",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html", "json"],
  coverageThreshold: {
    global: {
      // Minimal test strategy - essential coverage only
      // Focus on core functionality, not exhaustive branch coverage
      branches: 10,
      functions: 30,
      lines: 25,
      statements: 25,
    },
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@noble/hashes/blake3\\.js$": "<rootDir>/node_modules/@noble/hashes/blake3.js",
    "^@noble/post-quantum/ml-dsa\\.js$": "<rootDir>/node_modules/@noble/post-quantum/ml-dsa.js",
    "^@noble/post-quantum/ml-kem\\.js$": "<rootDir>/node_modules/@noble/post-quantum/ml-kem.js",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@noble|libsodium-wrappers-sumo)/)",
  ],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  globalTeardown: "<rootDir>/tests/teardown.ts",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2022",
          module: "CommonJS",
          lib: ["ES2022"],
          moduleResolution: "node",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          skipLibCheck: true,
          strict: true,
        },
        isolatedModules: true,
      },
    ],
    "^.+\\.js$": [
      "ts-jest",
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  testTimeout: 30000, // 30 seconds for complex crypto operations
  verbose: true,
  // Force Jest to exit after tests complete
  // This prevents hanging if there are any remaining timers or async operations
  forceExit: true,
  // Run tests serially to prevent timer conflicts
  maxWorkers: 1,
};

