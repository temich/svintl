module.exports = {
  default: {
    import: ['features/steps/**/*.ts'],
    requireModule: ['tsx'],
    format: ['progress'],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['features/**/*.feature'],
  },
}
