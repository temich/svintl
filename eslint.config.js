'use strict'

// @ts-expect-error
const importPlugin = require('eslint-plugin-import')
const neostandard = require('neostandard')

module.exports = [
  ...neostandard({
    ts: true,
    ignores: neostandard.resolveIgnoresFromGitignore(),
  }),
  {
    plugins: {
      import: importPlugin,
    },
  },
  {
    rules: {
      'no-void': ['error', { allowAsStatement: true }],
      curly: ['error', 'multi'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/space-before-function-paren': ['error', 'never'],
      '@stylistic/padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: ['block-like', 'if', 'multiline-expression'],
          next: '*',
        },
        {
          blankLine: 'always',
          prev: '*',
          next: ['block-like', 'if', 'multiline-expression'],
        },
        {
          blankLine: 'always',
          prev: ['const', 'let'],
          next: ['expression', 'for'],
        },
        {
          blankLine: 'always',
          prev: 'expression',
          next: ['const', 'let'],
        },
        {
          blankLine: 'always',
          prev: ['multiline-const', 'multiline-let'],
          next: '*',
        },
        {
          blankLine: 'always',
          prev: '*',
          next: ['multiline-const', 'multiline-let'],
        },
        {
          blankLine: 'always',
          prev: '*',
          next: 'return',
        },
        {
          blankLine: 'always',
          prev: '*',
          next: 'break',
        },
        {
          blankLine: 'always',
          prev: '*',
          next: 'continue',
        },
      ],
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
        alphabetize: {
          order: 'asc',
        },
      }],
      'no-warning-comments': ['error', {
        terms: ['todo', 'fixme'],
        location: 'anywhere',
      }],
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
]
