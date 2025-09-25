/**
 * CLI command for managing global project translation context
 * Stores shared context in context.yaml under the `context` key
 *
 * Allows setting, clearing, and inspecting the global context value
 *
 * @author claude-4-sonnet
 */

import { ContextFileManager } from './context'

export class ContextCommand {
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
      this.error('Invalid arguments passed to context command')

    if (args.length === 0) {
      const current = this.contextManager.getGlobalContext(i18nPath)

      if (current && current.trim().length > 0) {
        this.log('Current project context:')
        this.log(current)
      } else {
        this.log('No global project context set.')
      }

      return
    }

    if (args.length === 1 && args[0] === '--clear') {
      this.contextManager.clearGlobalContext(i18nPath)
      this.log('✅ Cleared global project context')
      return
    }

    const context = args.join(' ').trim()

    if (context.length === 0) {
      this.contextManager.clearGlobalContext(i18nPath)
      this.log('⚠️  Empty context provided. Cleared global project context.')
      return
    }

    this.contextManager.setGlobalContext(i18nPath, context)
    this.log('✅ Saved global project context')
  }
}


