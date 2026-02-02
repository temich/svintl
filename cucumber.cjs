module.exports = {
  default: {
    import: ['features/steps/**/*.ts'],
    requireModule: ['tsx'],
    format: ['progress'],
    failFast: false,
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['features/**/*.feature'],
  },
}
