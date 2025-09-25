/**
 * CLI command for setting values in all i18n dictionaries without translation
 * Sets the same value across all language files without using OpenAI API
 *
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'

export class ConstCommand {
  private translationService = new TranslationService()

  async execute(key: string, value: string, i18nPath = './src/lib/intl/'): Promise<void> {
    try {
      // Get locale information
      const { localeFiles, i18nDir } = this.translationService.getLocaleInfo(i18nPath)

      if (localeFiles.length === 0) {
        logger.error(`No locale files found in ${i18nDir}. Run 'npx intl hola' first.`)
      }

      // Update all locale files with the same value
      for (const file of localeFiles) {
        const filePath = `${i18nDir}/${file}`
        this.translationService.updateLocaleFile(filePath, key, value)
      }

      // Auto-build dictionaries
      this.translationService.finalize(i18nPath, key, value)
      
      logger.log(`✅ Set constant "${key}" in ${localeFiles.length} locale files`)
    } catch (error) {
      logger.error(`Failed to set constant: ${error}`)
    }
  }
}
