module.exports = {
  default: {
    import: ['features/steps/**/*.ts'],
    requireModule: ['tsx'],
    format: ['progress'],
    failFast: true,
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['features/**/*.feature'],
  },
}
