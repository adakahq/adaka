import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  { ignores: ["dist/", "src-tauri/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "shared", pattern: "src/shared/**" },
        {
          type: "module",
          pattern: "src/modules/*",
          mode: "folder",
          capture: ["moduleName"],
        },
        { type: "root", pattern: "src/*", mode: "file" },
      ],
      "boundaries/include": ["src/**/*.{ts,tsx}"],
    },
    rules: {
      // CLAUDE.md: modules communicate ONLY via the event bus or workspace
      // files — never by importing each other. Enforced here.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "Cross-module import. Modules talk via src/shared/ or the event bus only (CLAUDE.md).",
          rules: [
            {
              from: "module",
              allow: [
                "shared",
                ["module", { moduleName: "{{from.moduleName}}" }],
              ],
            },
            { from: "app", allow: ["app", "shared", "module"] },
            { from: "shared", allow: ["shared"] },
            { from: "root", allow: ["root", "app", "shared"] },
          ],
        },
      ],
      "boundaries/no-unknown-files": "error",
    },
  },
);