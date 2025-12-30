import js from "@eslint/js";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

export default [
  // Global ignores
  {
    ignores: [
      "dist/**/*",
      "node_modules/**/*",
      "coverage/**/*",
      "*.cjs",
      "*.config.*",
      "**/*.d.ts",
    ],
  },
  // Base JavaScript configuration
  {
    files: ["**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        global: "readonly",
        NodeJS: "readonly",
      },
    },
    rules: {
      "no-console": "error",
      "no-unused-vars": "warn",
    },
  },
  // TypeScript configuration for source files
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        global: "readonly",
        NodeJS: "readonly",
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        performance: "readonly",
        jest: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescriptPlugin,
    },
    rules: {
      // Web Crypto API Prohibition - Security Critical
      "no-restricted-globals": [
        "error",
        {
          name: "crypto",
          message:
            "Web Crypto API is PROHIBITED. Use libsodium-wrappers-sumo and @noble/hashes instead. For Node.js crypto, use require('crypto').",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "crypto",
          property: "subtle",
          message:
            "Web Crypto API crypto.subtle is PROHIBITED. Use libsodium-wrappers-sumo for cryptographic operations.",
        },
        {
          object: "crypto",
          property: "getRandomValues",
          message:
            "Web Crypto API crypto.getRandomValues is PROHIBITED. Use sodium.randombytes_buf() from libsodium-wrappers-sumo.",
        },
        {
          object: "window",
          property: "crypto",
          message:
            "Web Crypto API window.crypto is PROHIBITED. Use libsodium-wrappers-sumo for cryptographic operations.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'MemberExpression[object.name="crypto"][property.name="subtle"]',
          message:
            "Web Crypto API crypto.subtle is PROHIBITED. Use libsodium-wrappers-sumo for cryptographic operations.",
        },
        {
          selector:
            'MemberExpression[object.name="crypto"][property.name="getRandomValues"]',
          message:
            "Web Crypto API crypto.getRandomValues is PROHIBITED. Use sodium.randombytes_buf() from libsodium-wrappers-sumo.",
        },
        {
          selector:
            'MemberExpression[object.object.name="window"][object.property.name="crypto"]',
          message:
            "Web Crypto API window.crypto is PROHIBITED. Use libsodium-wrappers-sumo for cryptographic operations.",
        },
        {
          selector:
            'CallExpression[callee.object.name="sodium"][callee.property.name="randombytes_buf"]',
          message:
            "Must call await sodium.ready before using sodium crypto functions.",
        },
        {
          selector:
            'CallExpression[callee.object.name="sodium"][callee.property.name="crypto_aead_xchacha20poly1305_ietf_encrypt"]',
          message:
            "Must call await sodium.ready before using sodium crypto functions.",
        },
        {
          selector:
            'CallExpression[callee.object.name="sodium"][callee.property.name="crypto_aead_xchacha20poly1305_ietf_decrypt"]',
          message:
            "Must call await sodium.ready before using sodium crypto functions.",
        },
        {
          selector:
            'CallExpression[callee.object.name="sodium"][callee.property.name="crypto_box_keypair"]',
          message:
            "Must call await sodium.ready before using sodium crypto functions.",
        },
        {
          selector:
            'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
          message:
            "Math.random() is PROHIBITED for generating fake data. Use real data sources or proper loading states.",
        },
      ],

      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // General rules
      "no-console": "error",
      "no-unused-vars": "off", // Use TypeScript version instead
    },
  },
  // TypeScript configuration for test files (without project requirement)
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        // Don't require project for test files since they're excluded from tsconfig.json
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        global: "readonly",
        NodeJS: "readonly",
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        performance: "readonly",
        jest: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescriptPlugin,
    },
    rules: {
      // TypeScript rules (without project-based rules)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn", // Allow any in tests for mocking
      "@typescript-eslint/no-non-null-assertion": "warn",

      // General rules
      "no-console": "off", // Allow console in tests
      "no-unused-vars": "off", // Use TypeScript version instead
    },
  },
];

