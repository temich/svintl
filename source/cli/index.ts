#!/usr/bin/env node

/**
 * Main CLI entry point for i18n management tool
 * Provides commands for adding, moving, and building translation files
 *
 * @author claude-4-sonnet
 */

import 'dotenv/config'
import { SetCommand } from './SetCommand.js'
import { MoveCommand } from './MoveCommand.js'
import { RemoveCommand } from './RemoveCommand.js'
import { CreateCommand } from './CreateCommand.js'
import { DestroyCommand } from './DestroyCommand.js'
import { SyncCommand } from './SyncCommand.js'
import { build } from './build.js'

class I18nCLI {
  private log(message: string): void {
    console.log(message)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  private showHelp(): void {
    this.log('Available commands:')
    this.log('  set <key> <value> [comment] - Set an i18n entry with automatic translation')
    this.log('  move <from> <to>            - Move an existing i18n entry to a new key')
    this.log('  remove <key>                - Remove an i18n entry from all language files')
    this.log('  create <lang> [source]      - Create new language dictionary from source (default: en)')
    this.log('  destroy <lang> [-y]         - Delete language dictionary (with confirmation)')
    this.log('  sync <source> [key]         - Sync all languages with source changes (optionally single key)')
    this.log('  build                       - Build YAML dictionaries into dict.js')
    this.log('')
    this.log('Options:')
    this.log('  -p <path>           - Path to i18n files directory (default: ./src/lib/intl/)')
    this.log('')
    this.log('Examples:')
    this.log('  npx intl set example.hello "Hello world"')
    this.log('  npx intl set wardrobe.kinds.tops "Tops" "part of clothing"')
    this.log('  npx intl move example.hello example.greeting')
    this.log('  npx intl remove example.greeting')
    this.log('  npx intl create jp          # Create Japanese from English')
    this.log('  npx intl create jp ru       # Create Japanese from Russian')
    this.log('  npx intl destroy jp -y      # Delete Japanese (force)')
    this.log('  npx intl sync ru            # Sync all languages with Russian changes')
    this.log('  npx intl sync en wardrobe.title  # Sync only wardrobe.title key')
    this.log('  npx intl build')
    this.log('  npx intl -p ./locales/ set app.title "My App"')
    this.log('')
    this.log('Environment:')
    this.log('  OPENAI_API_KEY      - Required for translation (loads from .env file)')
    this.log('')
    this.log('Note: Works with .yaml i18n files')
  }

  async run(): Promise<void> {
    const args = process.argv.slice(2)

    if (args.length === 0) {
      this.showHelp()

      return
    }

    // Parse flags
    let i18nPath = './src/lib/intl/'
    let forceDestroy = false
    const commandArgs = [...args]

    // Check for -p flag
    const pathIndex = commandArgs.indexOf('-p')
    if (pathIndex !== -1) {
      if (pathIndex + 1 >= commandArgs.length)
        this.error('-p flag requires a path argument')

      i18nPath = commandArgs[pathIndex + 1]
      commandArgs.splice(pathIndex, 2)
    }

    // Check for -y flag (force destroy)
    const forceIndex = commandArgs.indexOf('-y')
    if (forceIndex !== -1) {
      forceDestroy = true
      commandArgs.splice(forceIndex, 1)
    }

    if (commandArgs.length === 0) {
      this.showHelp()

      return
    }

    const command = commandArgs[0]

    switch (command) {
      case 'set': {
        if (commandArgs.length < 3 || commandArgs.length > 4)
          this.error('set command requires 2-3 arguments: <key> <value> [comment]')

        const setCommand = new SetCommand()
        const comment = commandArgs.length === 4 ? commandArgs[3] : undefined

        await setCommand.execute(commandArgs[1], commandArgs[2], comment, i18nPath)

        break
      }

      case 'move': {
        if (commandArgs.length !== 3)
          this.error('move command requires exactly 2 arguments: <from> <to>')

        const moveCommand = new MoveCommand()

        await moveCommand.execute(commandArgs[1], commandArgs[2], i18nPath)

        break
      }

      case 'remove': {
        if (commandArgs.length !== 2)
          this.error('remove command requires exactly 1 argument: <key>')

        const removeCommand = new RemoveCommand()

        await removeCommand.execute(commandArgs[1], i18nPath)

        break
      }

      case 'create': {
        if (commandArgs.length < 2 || commandArgs.length > 3)
          this.error('create command requires 1-2 arguments: <target-lang> [source-lang]')

        const createCommand = new CreateCommand()
        const sourceLang = commandArgs.length === 3 ? commandArgs[2] : undefined

        await createCommand.execute(commandArgs[1], sourceLang, i18nPath)

        break
      }

      case 'destroy': {
        if (commandArgs.length !== 2)
          this.error('destroy command requires exactly 1 argument: <lang>')

        const destroyCommand = new DestroyCommand()

        await destroyCommand.execute(commandArgs[1], forceDestroy, i18nPath)

        break
      }

      case 'sync': {
        if (commandArgs.length < 2 || commandArgs.length > 3)
          this.error('sync command requires 1-2 arguments: <source-lang> [key]')

        const syncCommand = new SyncCommand()
        const specificKey = commandArgs.length === 3 ? commandArgs[2] : undefined

        await syncCommand.execute(commandArgs[1], specificKey, i18nPath)

        break
      }

      case 'build': {
        build(i18nPath)

        break
      }

      default:
        this.error(`Unknown command: ${command}`)
    }
  }
}

// Run the CLI
const cli = new I18nCLI()

cli.run().catch((error) => {
  console.error('CLI Error:', error)
  process.exit(1)
})
