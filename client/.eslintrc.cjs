/* Renamed from .eslintrc.js to .eslintrc.cjs so that it is treated as CommonJS (and not an ES module) on the runner. */
module.exports = {
    root: true,
    env: { browser: true, es2020: true, node: true, jest: true },
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:react/recommended",
        "plugin:react-hooks/recommended"
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 12, sourceType: "module" },
    plugins: ["react", "@typescript-eslint", "react-refresh"],
    settings: { react: { version: "detect" } },
    rules: {
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-explicit-any": "warn",
        "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    },
    overrides: [
        { files: ["**/__mocks__/**", "**/*.mock.js", "**/*.mock.ts"], extends: ["./.eslintrc.mock.cjs"] }
    ]
};
