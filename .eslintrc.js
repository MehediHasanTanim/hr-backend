module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
  },
  extends: [
    'airbnb-base',
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'import'],
  settings: {
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.eslint.json'],
      },
    },
  },
  rules: {
    'import/prefer-default-export': 'off',
    'class-methods-use-this': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    'max-classes-per-file': 'off',
    'no-void': 'off',
    'no-param-reassign': 'off',
    'prefer-destructuring': 'off',
  },
  overrides: [
    {
      files: ['*.config.ts', 'vitest.config.ts', 'vitest.utils.config.ts'],
      rules: {
        'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
        '@typescript-eslint/no-unsafe-assignment': 'off',
      },
    },
    {
      files: ['**/*.spec.ts'],
      rules: {
        'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
        '@typescript-eslint/require-await': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'coverage/', '*.js', '!.eslintrc.js'],
};
