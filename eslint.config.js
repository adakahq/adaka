import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

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
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../modules/*", "../../modules/*", "../../../modules/*"],
              message:
                "Modules may not import from other modules. Use src/shared/ or the event bus.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/*/**.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../modules/*", "../../modules/*", "../../../modules/*"],
              message:
                "Modules may not import from other modules. Use src/shared/ or the event bus.",
            },
            {
              group: ["@/modules/*", "#modules/*"],
              message:
                "Modules may not import from other modules. Use src/shared/ or the event bus.",
            },
          ],
        },
      ],
    },
  },
);
