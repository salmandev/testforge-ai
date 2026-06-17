// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * ESLint flat config for TestForge AI monorepo
 *
 * Uses TypeScript-ESLint with strict rules matching the tsconfig.json settings.
 * Applied to all packages and apps in the workspace.
 *
 * @type {import("eslint").Linter.FlatConfig[]}
 */
export default tseslint.config(
  // ── Global ignores ───────────────────────────────────────────────────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.d.ts",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
    ],
  },

  // ── Base ESLint recommended rules ─────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript-ESLint strict rules ────────────────────────────────────────
  ...tseslint.configs.strictTypeChecked,

  // ── TypeScript parser options ─────────────────────────────────────────────
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── Custom rule overrides ─────────────────────────────────────────────────
  {
    rules: {
      // Relax some strict rules that are noisy in a monorepo
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",

      // Allow void for fire-and-forget patterns
      "@typescript-eslint/no-floating-promises": [
        "error",
        { ignoreVoid: true },
      ],

      // Allow require() in config files
      "@typescript-eslint/no-require-imports": "off",

      // Relax redundant type constituent checks for Zod schemas
      "@typescript-eslint/no-redundant-type-constituents": "off",

      // Allow empty functions (stubs, interface implementations)
      "@typescript-eslint/no-empty-function": "off",

      // Allow unsafe assignments where Zod inference is used
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",

      // General rules
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
    },
  },

  // ── Test file overrides ───────────────────────────────────────────────────
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/vitest.config.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },

  // ── Config file overrides ─────────────────────────────────────────────────
  {
    files: [
      "**/tsup.config.ts",
      "**/eslint.config.js",
      "**/vitest.config.ts",
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
    },
  }
);
