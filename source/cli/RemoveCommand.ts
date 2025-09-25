/**
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'

export class RemoveCommand {
  private translationService = new TranslationService()

  async execute(key: string, i18nPath = './src/lib/intl/'): Promise<void> {
    logger.log(`Removing "${key}" from all language files...`)

    // Get language information
    const { languageFiles, i18nDir } = this.translationService.getLanguageInfo(i18nPath)

    let keyExists = false

    // Remove key from all language files
    for (const file of languageFiles) {
      const filePath = `${i18nDir}/${file}`

      try {
        const removed = this.translationService.removeFromLanguageFile(filePath, key)
        if (removed) {
          logger.log(`✓ Removed from ${file}`)
          keyExists = true
        }
      } catch (error) {
        logger.warn(`Failed to update ${file}: ${error}`)
      }
    }

    if (!keyExists) {
      logger.warn(`Key "${key}" not found in any language files`)
    }

    // Remove context entry if it exists
    try {
      const removed = this.translationService.contextManagerInstance.removeContextEntry(i18nPath, key)
      if (removed) {
        logger.log(`✓ Removed context for "${key}"`)
      }
    } catch (error) {
      logger.warn(`Failed to remove context: ${error}`)
    }

    logger.log(`✅ Saved`)

    // Auto-build dictionaries
    require('./build').build(i18nPath)
  }
}