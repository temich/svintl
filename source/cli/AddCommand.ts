/**
 * CLI command for adding new i18n entries with automatic translation
 * Translates entries to all available languages using OpenAI API
 * Errors if the key already exists to prevent accidental overwrites
 *
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { parsePartitionedKey } from './partition'
import { formatTranslations } from './format'
import { join } from 'path'

export class AddCommand {
  private translationService = new TranslationService()

  async execute(key: string, value: string, comment?: string, i18nPath = './src/lib/intl/', debug = false): Promise<void> {
    try {
      // Parse partitioned key
      const { partition, key: actualKey } = parsePartitionedKey(key)

      // Get locale information
      const { localeFiles, allLocales, i18nDir } = this.translationService.getLocaleInfo(i18nPath, partition)

      // Check if key already exists in any locale file
      for (const file of localeFiles) {
        const filePath = join(i18nDir, file)
        if (this.translationService.keyExistsInLocaleFile(filePath, actualKey)) {
          logger.error(`Key "${key}" already exists. Use 'npx intl set' to update existing keys.`)
          return
        }
      }

      // Create system prompt for regular translations
      const systemPrompt = this.translationService.buildSystemPrompt({ mode: 'jsonObject', i18nPath })

    const projectContext = this.translationService.getGlobalProjectContext(i18nPath)
    const translations = await this.translationService.translateWithOpenAI(value, allLocales, systemPrompt, comment, projectContext, debug)

      // Update all locale files
      this.translationService.updateAllLocaleFiles(localeFiles, i18nDir, actualKey, translations)

      // Store context and build
      this.translationService.finalize(i18nPath, actualKey, value, comment, partition)

      console.log(formatTranslations(translations, allLocales))
    } catch (error) {
      logger.error(`Failed to add translation: ${error}`)
    }
  }

}
