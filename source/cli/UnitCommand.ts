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
6. Return a JSON object where each locale contains an object with named plural forms
7. CRITICAL: EVERY plural form in the output MUST include the placeholder {n} at the correct grammatical position for that language. The {n} represents where the number will be substituted. Position {n} according to the natural word order of each language.

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
- Return objects with named plural form keys for each locale
- Only include categories that exist for each locale (skip unused ones)
- Use proper grammatical forms for each category
- Maintain semantic consistency across all translations
- Follow Unicode CLDR pluralization rules exactly
- Return JSON with locale codes as keys and objects as values
- MANDATORY: Every single translation value MUST contain exactly one {n} placeholder positioned correctly for natural language flow

Target locales: \${allLocales}

Return ONLY a JSON object with the structure shown above.`

    // Translate using OpenAI
    const projectContext = this.translationService.contextManagerInstance.getGlobalContext(i18nPath)
    const translations = await this.translationService.translateWithOpenAI(input, allLocales, systemPrompt, comment, projectContext)

    // Transform the translations to handle objects from OpenAI
    const objectTranslations: Record<string, Record<string, string>> = {}

    for (const lang of allLocales) {
      // OpenAI returns base language codes (en, ru) but we have full codes (en-US, ru-RU)
      const baseLang = lang.split('-')[0]
      const translation = translations[baseLang] || translations[lang]

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
            // Fallback: create simple one/other object
            logger.warn(`Invalid plural structure for ${lang}, using fallback`)
            objectTranslations[lang] = this.createFallbackPluralObject(translation, lang)
          }
        } catch {
          // Fallback: create simple one/other object
          logger.warn(`Failed to parse plural structure for ${lang}, using fallback`)
          objectTranslations[lang] = this.createFallbackPluralObject(translation, lang)
        }
      } else {
        // Fallback for any other type
        logger.warn(`Unexpected translation type for ${lang}, using fallback`)
        objectTranslations[lang] = this.createFallbackPluralObject(String(translation), lang)
      }
    }

    // Convert objects to the new array-with-object format for YAML storage
    const yamlTranslations: Record<string, Array<Record<string, string>>> = {}
    for (const lang of allLocales) {
      yamlTranslations[lang] = [objectTranslations[lang]]
    }

    // Update all locale files with object plural data
    this.translationService.updateAllLocaleFiles(localeFiles, i18nDir, actualKey, yamlTranslations)

    // Store context and build
    this.translationService.finalize(i18nPath, actualKey, input, comment, partition)
  }

  /**
 * Create a fallback plural object for languages when parsing fails
 */
  private createFallbackPluralObject(translation: string, languageCode: string): Record<string, string> {
    // Simple heuristic: for most languages, create objects with named plural forms
    // For languages known to have more complex pluralization, attempt basic forms

    switch (languageCode) {
      case 'ru':
      case 'uk':
      case 'pl':
        // Slavic languages: one, few, many, other
        return {
          one: translation,
          few: translation + 'а',              // basic approximation
          many: translation + 'ов',            // basic approximation
          other: translation + 'ов'            // fallback
        }

      case 'ar':
        // Arabic: zero, one, two, few, many, other
        return {
          zero: 'لا ' + translation,
          one: translation,
          two: translation + 'ان',
          few: translation + 'ات',
          many: translation + 'ات',
          other: translation + 'ات'
        }

      case 'ja':
      case 'zh':
      case 'ko':
        // East Asian languages: other only
        return {
          other: translation
        }

      default:
        // Most languages: one, other
        return {
          one: translation,
          other: translation + 's'               // basic English-like pluralization
        }
    }
  }
}

