// @ts-check
import path from "node:path";
import js from "@eslint/js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/src/generated/**",
      "**/next-env.d.ts",
      "**/playwright-report/**",
      "**/test-results/**",
      ".claude/**",
      ".agents/**",
      "design-system/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["packages/domain/**/*.ts"],
    rules: {
      // Domain code must never fall back to untyped values.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
    },
  },
  ...nextCoreWebVitals.map((config) => ({
    ...config,
    files: ["apps/web/**/*.{ts,tsx}"],
    settings: { ...config.settings, next: { rootDir: path.join(import.meta.dirname, "apps/web") } },
  })),
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "tests/**", "scripts/**", "**/seed.ts"],
    rules: { "no-console": "off" },
  },
  prettier,
);
