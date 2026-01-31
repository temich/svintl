/**
 * CLI command for managing global genders setting
 * Stores a list of gender values under the `genders` key in context.yaml
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

      if (Array.isArray(current) && current.length > 0)
        this.log(`Genders enabled: ${current.join(', ')}`)
      else
        this.log('Genders setting is not set.')

      return
    }

    // Accept list of gender values
    const genderValues = args.map(arg => arg.trim()).filter(val => val.length > 0)
    
    if (genderValues.length === 0)
      this.error('At least one gender value must be provided')

    this.contextManager.setGlobalGenders(i18nPath, genderValues)
    this.log(`✅ Genders set to: ${genderValues.join(', ')}`)
  }
}
