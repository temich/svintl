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
      // Get language information
      const { languageFiles, i18nDir } = this.translationService.getLanguageInfo(i18nPath)

      if (languageFiles.length === 0) {
        logger.error(`No language files found in ${i18nDir}. Run 'npx intl hola' first.`)
      }

      // Update all language files with the same value
      for (const file of languageFiles) {
        const filePath = `${i18nDir}/${file}`
        this.translationService.updateLanguageFile(filePath, key, value)
      }

      // Auto-build dictionaries
      this.translationService.finalize(i18nPath, key, value)
      
      logger.log(`✅ Set constant "${key}" in ${languageFiles.length} language files`)
    } catch (error) {
      logger.error(`Failed to set constant: ${error}`)
    }
  }
}
