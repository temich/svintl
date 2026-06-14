/**
 * CLI command for updating existing i18n entries with automatic translation
 * Translates entries to all available languages using OpenAI API
 * Errors if the key doesn't exist to prevent typos
 *
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { parsePartitionedKey } from './partition'
import { formatTranslations } from './format'
import { join } from 'path'

export class SetCommand {
  private translationService = new TranslationService()

  async execute(key: string, value: string, comment?: string, i18nPath = './src/lib/intl/', debug = false): Promise<void> {
    try {
      // Parse partitioned key
      const { partition, key: actualKey } = parsePartitionedKey(key)

      // Get locale information
      const { localeFiles, allLocales, i18nDir } = this.translationService.getLocaleInfo(i18nPath, partition)

      // Check if key exists in at least one locale file
      let keyExists = false
      for (const file of localeFiles) {
        const filePath = join(i18nDir, file)
        if (this.translationService.keyExistsInLocaleFile(filePath, actualKey)) {
          keyExists = true
          break
        }
      }

      if (!keyExists) {
        logger.error(`Key "${key}" does not exist. Use 'npx intl add' to create new keys.`)
        return
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
      logger.error(`Failed to update translation: ${error}`)
    }
  }

}
