/**
 * CLI command for managing global genders setting
 * Stores a boolean under the `genders` key in context.yaml
 *
 * @author copilot
 */

import { ContextFileManager } from './context'

export class GendersCommand {
  private contextManager = new ContextFileManager()

  private log(message: string): void {
    console.log(message)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(args: string[], i18nPath = './src/lib/intl/'): Promise<void> {
    if (!Array.isArray(args))
      this.error('Invalid arguments passed to genders command')

    if (args.length === 0) {
      const current = this.contextManager.getGlobalGenders(i18nPath)

      if (typeof current === 'boolean')
        this.log(`Genders enabled: ${current}`)
      else
        this.log('Genders setting is not set.')

      return
    }

    if (args.length !== 1)
      this.error('Genders command expects a single boolean value: true or false')

    const rawValue = args[0].trim().toLowerCase()
    if (rawValue !== 'true' && rawValue !== 'false')
      this.error('Genders value must be "true" or "false"')

    const enabled = rawValue === 'true'
    this.contextManager.setGlobalGenders(i18nPath, enabled)
    this.log(`✅ Genders set to ${enabled}`)
  }
}
