import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                Buffer: "readonly",
                fetch: "readonly",
                module: "readonly",
                require: "readonly",
                exports: "readonly",
                __dirname: "readonly",
                __filename: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "warn",
            "no-useless-escape": "warn"
        }
    }
];
