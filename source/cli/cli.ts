#!/usr/bin/env node

/**
 * Main CLI entry point using yargs for argument parsing
 * General-purpose translation library CLI with minimal descriptions
 *
 * @author copilot
 */

import 'dotenv/config'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { TranslationService } from './TranslationService'
import { SetCommand } from './SetCommand'
import { UnitCommand } from './UnitCommand'
import { MoveCommand } from './MoveCommand'
import { RemoveCommand } from './RemoveCommand'
import { CreateCommand } from './CreateCommand'
import { DestroyCommand } from './DestroyCommand'
import { SyncCommand } from './SyncCommand'
import { HolaCommand } from './HolaCommand'
import { ConstCommand } from './ConstCommand'
import { ContextCommand } from './ContextCommand'
import { build } from './build'

const translationService = new TranslationService()

const cli = yargs(hideBin(process.argv))
  .scriptName('intl')
  .usage('Usage: $0 <command> [options]')
  .option('path', {
    alias: 'p',
    type: 'string',
    default: './src/lib/intl/',
    description: 'Path to i18n files directory'
  })
  .command('hola', 'Initialize new intl dictionary project', (yargs) => {
    return yargs.option('js', {
      type: 'boolean',
      default: false,
      description: 'Use JavaScript instead of TypeScript'
    })
  }, async (argv) => {
    const holaCommand = new HolaCommand()
    await holaCommand.execute(argv.js, argv.path)
  })
  .command('set <key> <value> [comment]', 'Set i18n entry with automatic translation', (yargs) => {
    return yargs
      .positional('key', {
        describe: 'Translation key (e.g., app.title)',
        type: 'string'
      })
      .positional('value', {
        describe: 'Translation value',
        type: 'string'
      })
      .positional('comment', {
        describe: 'Optional context comment',
        type: 'string'
      })
  }, async (argv) => {
    const setCommand = new SetCommand()
    await setCommand.execute(argv.key!, argv.value!, argv.comment, argv.path)
  })
  .command('unit <key> <value> [comment]', 'Create pluralized i18n entries', (yargs) => {
    return yargs
      .positional('key', {
        describe: 'Translation key',
        type: 'string'
      })
      .positional('value', {
        describe: 'Singular form value',
        type: 'string'
      })
      .positional('comment', {
        describe: 'Optional context comment',
        type: 'string'
      })
  }, async (argv) => {
    const unitCommand = new UnitCommand()
    await unitCommand.execute(argv.key!, argv.value!, argv.comment, argv.path)
  })
  .command('const <key> <value>', 'Set same value in all dictionaries', (yargs) => {
    return yargs
      .positional('key', {
        describe: 'Translation key',
        type: 'string'
      })
      .positional('value', {
        describe: 'Value to set',
        type: 'string'
      })
  }, async (argv) => {
    const constCommand = new ConstCommand()
    await constCommand.execute(argv.key!, argv.value!, argv.path)
  })
  .command('move <from> <to>', 'Move translation key', (yargs) => {
    return yargs
      .positional('from', {
        describe: 'Source key',
        type: 'string'
      })
      .positional('to', {
        describe: 'Target key',
        type: 'string'
      })
  }, async (argv) => {
    const moveCommand = new MoveCommand()
    await moveCommand.execute(argv.from!, argv.to!, argv.path)
  })
  .command('remove <key>', 'Remove translation key', (yargs) => {
    return yargs
      .positional('key', {
        describe: 'Translation key to remove',
        type: 'string'
      })
  }, async (argv) => {
    const removeCommand = new RemoveCommand()
    await removeCommand.execute(argv.key!, argv.path)
  })
  .command('create <lang> [source]', 'Create new locale dictionary', (yargs) => {
    return yargs
      .positional('lang', {
        describe: 'Target locale code',
        type: 'string'
      })
      .positional('source', {
        describe: 'Source locale code',
        type: 'string',
        default: 'en'
      })
  }, async (argv) => {
    const createCommand = new CreateCommand()
    await createCommand.execute(argv.lang!, argv.source, argv.path)
  })
  .command('destroy <lang>', 'Delete locale dictionary', (yargs) => {
    return yargs
      .positional('lang', {
        describe: 'Locale code to delete',
        type: 'string'
      })
      .option('yes', {
        alias: 'y',
        type: 'boolean',
        default: false,
        description: 'Skip confirmation'
      })
  }, async (argv) => {
    const destroyCommand = new DestroyCommand()
    await destroyCommand.execute(argv.lang!, argv.yes, argv.path)
  })
  .command('sync <source> [key]', 'Sync locales with source changes', (yargs) => {
    return yargs
      .positional('source', {
        describe: 'Source locale code',
        type: 'string'
      })
      .positional('key', {
        describe: 'Specific key to sync',
        type: 'string'
      })
  }, async (argv) => {
    const syncCommand = new SyncCommand()
    await syncCommand.execute(argv.source!, argv.key, argv.path)
  })
  .command('context [value]', 'Manage global project translation context', (yargs) => {
    return yargs
      .positional('value', {
        describe: 'Context value or --clear to clear',
        type: 'string'
      })
  }, async (argv) => {
    const contextCommand = new ContextCommand()
    const contextArgs = argv.value ? [argv.value] : []
    await contextCommand.execute(contextArgs, argv.path)
  })
  .command('build', 'Build YAML dictionaries into JavaScript', {}, async (argv) => {
    build(argv.path as string)
  })
  .demandCommand(1, 'You need at least one command before moving on')
  .help()
  .alias('help', 'h')
  .version()
  .alias('version', 'v')
  .strict()

// Handle the CLI
cli.parse()