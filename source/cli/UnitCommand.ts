/**
 * CLI command for creating unit/pluralized i18n entries using Intl.PluralRules
 * Creates translations for all plural categories (one, few, many, other) for each language
 *
 * @author copilot
 */

import { TranslationService } from './TranslationService'
import { logger } from './logger'
import { parsePartitionedKey } from './partition'

export class UnitCommand {
  private translationService = new TranslationService()

  async execute(key: string, input: string, comment?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    // Parse partitioned key
    const { partition, key: actualKey } = parsePartitionedKey(key)

    const commentText = comment ? ` (${comment})` : ''
    logger.log(`Creating plural forms for "${key}" with input "${input}"${commentText}...`)

    // Get locale information
    const { localeFiles, allLocales, i18nDir } = this.translationService.getLocaleInfo(i18nPath, partition)
    logger.log(`Creating pluralized translations for ${allLocales.length} locales...`)

    // Create system prompt for pluralization
    const systemPrompt = `You are a professional translator specialized in creating pluralized translations for an internationalization system using Intl.PluralRules.

Your task is to create plural forms for ALL supported plural categories for each target locale according to Unicode CLDR pluralization rules.

IMPORTANT RULES:
1. DETECT the input locale automatically from the provided text
2. For each target locale, create translations as OBJECTS with named plural form keys: {"one": "...", "other": "..."}
3. Only include the plural categories that are actually used by each locale - skip unused categories
4. Use proper locale-specific pluralization patterns and grammar that sound natural and commonly used
5. The input text represents a concept that needs to be pluralized (e.g., "item", "message", "user")
6. If the phrase contains placeholders like {name} or {itemId}, the translation MUST be a !js function with matching parameters
7. Return a JSON object where each locale contains an object with named plural forms
8. EVERY plural form in the output MUST include the placeholder {n} at the correct grammatical position for that language. The {n} represents where the number will be substituted. Position {n} according to the natural word order of each language.

LOCALE-SPECIFIC PLURAL RULES (use only the categories needed for each locale):
- English: {"one": "...", "other": "..."}
- Russian: {"one": "...", "few": "...", "many": "...", "other": "..."}
- Polish: {"one": "...", "few": "...", "many": "...", "other": "..."}
- French: {"one": "...", "other": "..."}
- German: {"one": "...", "other": "..."}
- Arabic: {"zero": "...", "one": "...", "two": "...", "few": "...", "many": "...", "other": "..."}
- Japanese: {"other": "..."}
- Chinese: {"other": "..."}

EXAMPLES:

Input: "message" (English)
Output:
{
  "en": {"one": "{n} message", "other": "{n} messages"},
  "ru": {"one": "{n} сообщение", "few": "{n} сообщения", "many": "{n} сообщений", "other": "{n} сообщений"},
  "fr": {"one": "{n} message", "other": "{n} messages"}
}

Input: "usuario" (Spanish)
Output:
{
  "en": {"one": "{n} user", "other": "{n} users"},
  "es": {"one": "{n} usuario", "other": "{n} usuarios"},
  "ru": {"one": "{n} пользователь", "few": "{n} пользователя", "many": "{n} пользователей", "other": "{n} пользователей"}
}

CRITICAL REQUIREMENTS:
- Follow Unicode CLDR pluralization rules exactly and maintain semantic consistency across all translations
- Every translation value MUST contain exactly one {n} placeholder, positioned for natural language flow

Target locales: \${allLocales}

Return ONLY a JSON object with the structure shown above.`

    const projectContext = this.translationService.getGlobalProjectContext(i18nPath)
    const genderInstructions = this.translationService.getGenderInstructions(i18nPath)
    const systemPromptWithGender = genderInstructions ? `${systemPrompt}\n\n${genderInstructions}` : systemPrompt

    // Translate using OpenAI
    const translations = await this.translationService.translateWithOpenAI(input, allLocales, systemPromptWithGender, comment, projectContext)

    // Transform the translations to handle objects or !js functions from OpenAI
    const objectTranslations: Record<string, Record<string, string>> = {}
    const yamlTranslations: Record<string, Array<Record<string, string>> | string> = {}

    for (const lang of allLocales) {
      // OpenAI returns base language codes (en, ru) but we have full codes (en-US, ru-RU)
      const baseLang = lang.split('-')[0]
      const translation = translations[baseLang] || translations[lang]

      if (typeof translation === 'string' && translation.trim().startsWith('!js')) {
        yamlTranslations[lang] = translation
        continue
      }

      // Check if translation is already an object (from OpenAI's response)
      if (typeof translation === 'object' && !Array.isArray(translation) && translation !== null) {
        objectTranslations[lang] = translation
      } else if (typeof translation === 'string') {
        // Try to parse as JSON for structured plural forms
        try {
          const parsed = JSON.parse(translation)

          // Check if the parsed result has the expected language structure
          if (typeof parsed === 'object' && parsed !== null && typeof parsed[lang] === 'object') {
            // OpenAI returned the full nested structure with language codes
            objectTranslations[lang] = parsed[lang]
          } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            // OpenAI returned just the plural object for this language
            objectTranslations[lang] = parsed
          } else {
            throw new Error(`Invalid plural structure returned for ${lang}: expected object with plural forms`)
          }
        } catch {
          throw new Error(`Failed to parse plural structure for ${lang}: invalid JSON response`)
        }
      } else {
        throw new Error(`Unexpected translation type for ${lang}: expected object or string, got ${typeof translation}`)
      }
    }

    // Convert objects to the new array-with-object format for YAML storage
    for (const lang of allLocales) {
      if (yamlTranslations[lang])
        continue
      yamlTranslations[lang] = [objectTranslations[lang]]
    }

    // Update all locale files with object plural data
    this.translationService.updateAllLocaleFiles(localeFiles, i18nDir, actualKey, yamlTranslations)

    // Store context and build
    this.translationService.finalize(i18nPath, actualKey, input, comment, partition)
  }

}

