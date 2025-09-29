/**
 * CLI command for moving/renaming i18n entries across all language files
 * Preserves translations while updating key paths
 *
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { parsePartitionedKey, getPartitionPath } from './partition'

export class MoveCommand {
  private translationService = new TranslationService()

  async execute(from: string, to: string, i18nPath = './src/lib/intl/'): Promise<void> {
    // Parse partitioned keys
    const fromParsed = parsePartitionedKey(from)
    const toParsed = parsePartitionedKey(to)

    logger.log(`Moving "${from}" to "${to}"...`)

    // Get locale information for source partition
    const { localeFiles: fromLocaleFiles, i18nDir: fromDir } = this.translationService.getLocaleInfo(i18nPath, fromParsed.partition)

    // Get locale information for destination partition
    const { localeFiles: toLocaleFiles, i18nDir: toDir } = this.translationService.getLocaleInfo(i18nPath, toParsed.partition)

    // Store the values from all locales in source partition
    const values: Record<string, string> = {}
    let keyExists = false

    // First pass: collect all values from source partition
    for (const file of fromLocaleFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = `${fromDir}/${file}`

      try {
        const value = this.extractValue(filePath, fromParsed.key)
        if (value !== null) {
          values[lang] = value
          keyExists = true
        }
      } catch (error) {
        logger.warn(`Failed to read ${file}: ${error}`)
      }
    }

    if (!keyExists) {
      logger.error(`Key "${from}" not found in any language files`)
    }

    // Handle cross-partition moves
    if (fromParsed.partition !== toParsed.partition) {
      // Moving between different partitions
      // Remove from source partition
      for (const file of fromLocaleFiles) {
        const filePath = `${fromDir}/${file}`
        try {
          this.translationService.removeFromLocaleFile(filePath, fromParsed.key)
        } catch (error) {
          logger.warn(`Failed to remove from ${file}: ${error}`)
        }
      }

      // Add to destination partition
      for (const file of toLocaleFiles) {
        const lang = file.replace('.yaml', '')
        const filePath = `${toDir}/${file}`

        if (values[lang]) {
          try {
            this.translationService.updateLocaleFile(filePath, toParsed.key, values[lang])
            logger.log(`✓ Moved to ${file}`)
          } catch (error) {
            logger.error(`Failed to update ${file}: ${error}`)
          }
        }
      }
    } else {
      // Moving within the same partition
      const localeFiles = fromLocaleFiles
      const i18nDir = fromDir

      for (const file of localeFiles) {
        const lang = file.replace('.yaml', '')
        const filePath = `${i18nDir}/${file}`

        if (values[lang]) {
          try {
            // Remove from old location and add to new location
            this.translationService.removeFromLocaleFile(filePath, fromParsed.key)
            this.translationService.updateLocaleFile(filePath, toParsed.key, values[lang])
            logger.log(`✓ Moved in ${file}`)
          } catch (error) {
            logger.error(`Failed to update ${file}: ${error}`)
          }
        }
      }
    }

    // Move context entry if it exists
    try {
      if (fromParsed.partition !== toParsed.partition) {
        // Cross-partition move: get context from source partition and set in destination partition
        const contextManager = this.translationService.contextManagerInstance
        const contextEntry = contextManager.getContextEntry(fromDir, fromParsed.key)

        if (contextEntry) {
          contextManager.setContextEntry(toDir, toParsed.key, contextEntry.input, contextEntry.context)
          contextManager.removeContextEntry(fromDir, fromParsed.key)
          logger.log(`✓ Moved context from "${from}" to "${to}"`)
        }
      } else {
        // Same partition move
        const moved = this.translationService.contextManagerInstance.moveContextEntry(fromDir, fromParsed.key, toParsed.key)
        if (moved) {
          logger.log(`✓ Moved context from "${from}" to "${to}"`)
        }
      }
    } catch (error) {
      logger.warn(`Failed to move context: ${error}`)
    }

    logger.log(`✅ Saved`)

    // Auto-build both source and destination partitions if they are different
    const build = require('./build').build
    if (fromParsed.partition !== toParsed.partition) {
      build(getPartitionPath(i18nPath, fromParsed.partition))
      build(getPartitionPath(i18nPath, toParsed.partition))
    } else {
      build(getPartitionPath(i18nPath, fromParsed.partition))
    }
  }

  private extractValue(filePath: string, key: string): string | null {
    const fs = require('fs')
    const yaml = require('js-yaml')

    const content = fs.readFileSync(filePath, 'utf8')
    const yamlData = yaml.load(content) as any

    // Navigate to the key
    const keyParts = key.split('.')
    let current = yamlData

    for (const part of keyParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part]
      } else {
        return null
      }
    }

    return typeof current === 'string' ? current : null
  }
}
