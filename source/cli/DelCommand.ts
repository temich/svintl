/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { parsePartitionedKey, getPartitionPath } from './partition'

export class DelCommand {
  private translationService = new TranslationService()

  async execute(key: string, i18nPath = './src/lib/intl/'): Promise<void> {
    // Parse partitioned key
    const { partition, key: actualKey } = parsePartitionedKey(key)

    logger.log(`Deleting "${key}" from all locale files...`)

    // Get locale information
    const { localeFiles, i18nDir } = this.translationService.getLocaleInfo(i18nPath, partition)

    let keyExists = false

    // Remove key from all locale files
    for (const file of localeFiles) {
      const filePath = `${i18nDir}/${file}`

      try {
        const removed = this.translationService.removeFromLocaleFile(filePath, actualKey)
        if (removed) {
          logger.log(`✓ Deleted from ${file}`)
          keyExists = true
        }
      } catch (error) {
        logger.warn(`Failed to update ${file}: ${error}`)
      }
    }

    if (!keyExists) {
      logger.warn(`Key "${key}" not found in any locale files`)
    }

    // Remove context entry if it exists
    try {
      const removed = this.translationService.contextManagerInstance.removeContextEntry(getPartitionPath(i18nPath, partition), actualKey)
      if (removed) {
        logger.log(`✓ Deleted context for "${key}"`)
      }
    } catch (error) {
      logger.warn(`Failed to delete context: ${error}`)
    }

    logger.log(`✅ Saved`)

    // Auto-build dictionaries
    require('./build').build(getPartitionPath(i18nPath, partition), !!partition)
  }
}
