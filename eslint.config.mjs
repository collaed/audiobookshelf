import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'readonly', exports: 'readonly',
        __dirname: 'readonly', __filename: 'readonly', process: 'readonly',
        global: 'readonly', console: 'readonly', Buffer: 'readonly',
        setTimeout: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly',
        clearInterval: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        describe: 'readonly', it: 'readonly', before: 'readonly', after: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly',
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-prototype-builtins': 'off',
    }
  },
  {
    ignores: ['client/**', 'client-v3/**', 'client-v3-new/**', 'node_modules/**', 'dist/**', 'build/**']
  }
]
