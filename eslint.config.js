import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  // Backend (Node) override for the add-on code
  {
    files: ["addon/rootfs/usr/src/app/src/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: "module",
    },
    rules: {
      semi: ["error", "always"],
      quotes: ["error", "double", { avoidEscape: true }],
      // Prefer classic function declarations over const/let function expressions and arrows
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
    },
    rules: {
      // Enforce semicolons and double quotes
      semi: ["error", "always"],
      quotes: ["error", "double", { avoidEscape: true }],
      // Prefer declarations everywhere, disallow arrow/const/let function expressions
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
    },
  },
]);
