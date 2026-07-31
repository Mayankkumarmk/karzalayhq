import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  // Files/dirs ESLint should never look at
  {
    ignores: [
      'dist/**',
      'src/generated/**',
      'node_modules/**',
      'coverage/**',
      'prisma/migrations/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Node environment for our source + config + tests
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Must be last so it can turn off rules that conflict with Prettier
  prettier,
)
