/**
 * CLI command for adding new i18n entries with automatic translation
 * Translates entries to all available languages using OpenAI API
 *
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { parsePartitionedKey } from './partition'

export class SetCommand {
  private translationService = new TranslationService()

  async execute(key: string, value: string, comment?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    try {
      // Parse partitioned key
      const { partition, key: actualKey } = parsePartitionedKey(key)

      // Get locale information
      const { localeFiles, allLocales, i18nDir } = this.translationService.getLocaleInfo(i18nPath, partition)

      // Create system prompt for regular translations
      const systemPrompt = `You are a professional translator for an internationalization system. You will receive text in ANY locale and must translate it to ALL specified target locales.

${this.translationService.getCommonTranslationPromptBody()}

Target languages: ${allLocales}

Return ONLY a JSON object with language codes as keys and translations as values.

For regular text:
{
  "de": "German translation",
  "fr": "French translation"
}

For !js functions:
{
  "de": "!js\\n(count) => count === 1 ? \\"1 Artikel\\" : \`\${count} Artikel\`",
  "fr": "!js\\n(count) => count === 1 ? \\"1 article\\" : \`\${count} articles\`"
}`

    const genderInstructions = this.translationService.getGenderInstructions(i18nPath)
    const systemPromptWithGender = genderInstructions ? `${systemPrompt}\n\n${genderInstructions}` : systemPrompt

    // Translate using OpenAI
    const translations = await this.translationService.translateWithOpenAI(value, allLocales, systemPromptWithGender, comment)

      // Update all locale files
      this.translationService.updateAllLocaleFiles(localeFiles, i18nDir, actualKey, translations)

      // Store context and build
      this.translationService.finalize(i18nPath, actualKey, value, comment, partition)

      logger.log(`✅ Set "${key}" in ${allLocales.length} locales`)
    } catch (error) {
      logger.error(`Failed to set translation: ${error}`)
    }
  }

}
