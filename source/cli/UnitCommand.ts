/**
 * CLI command for creating unit/pluralized i18n entries using Intl.PluralRules
 * Creates translations for all plural categories (one, few, many, other) for each language
 *
 * @author claude-4-sonnet
 */

import { TranslationService } from './TranslationService'

export class UnitCommand {
  private translationService = new TranslationService()

  async execute(key: string, input: string, comment?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    const commentText = comment ? ` (${comment})` : ''
    this.translationService.log(`Creating plural forms for "${key}" with input "${input}"${commentText}...`)

    // Get language information
    const { languageFiles, allLanguages, i18nDir } = this.translationService.getLanguageInfo(i18nPath)
    this.translationService.log(`Creating pluralized translations for ${allLanguages.length} languages...`)

    // Create system prompt for pluralization
    const systemPrompt = `You are a professional translator specialized in creating pluralized translations for an internationalization system using Intl.PluralRules.

Your task is to create plural forms for ALL supported plural categories for each target language according to Unicode CLDR pluralization rules.

IMPORTANT RULES:
1. DETECT the input language automatically from the provided text
2. For each target language, create translations as OBJECTS with named plural form keys: {"one": "...", "other": "..."}
3. Only include the plural categories that are actually used by each language - skip unused categories
4. Use proper language-specific pluralization patterns and grammar that sound natural and commonly used
5. The input text represents a concept that needs to be pluralized (e.g., "item", "message", "user")
6. Return a JSON object where each language contains an object with named plural forms

LANGUAGE-SPECIFIC PLURAL RULES (use only the categories needed for each language):
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
  "en": {"one": "message", "other": "messages"},
  "ru": {"one": "сообщение", "few": "сообщения", "many": "сообщений", "other": "сообщений"},
  "fr": {"one": "message", "other": "messages"}
}

Input: "usuario" (Spanish)
Output:
{
  "en": {"one": "user", "other": "users"},
  "es": {"one": "usuario", "other": "usuarios"},
  "ru": {"one": "пользователь", "few": "пользователя", "many": "пользователей", "other": "пользователей"}
}

CRITICAL REQUIREMENTS:
- Return objects with named plural form keys for each language
- Only include categories that exist for each language (skip unused ones)
- Use proper grammatical forms for each category
- Maintain semantic consistency across all translations
- Follow Unicode CLDR pluralization rules exactly
- Return JSON with language codes as keys and objects as values

Target languages: \${allLanguages}

Return ONLY a JSON object with the structure shown above.`

    // Translate using OpenAI
    const projectContext = this.translationService.contextManagerInstance.getGlobalContext(i18nPath)
    const translations = await this.translationService.translateWithOpenAI(input, allLanguages, systemPrompt, comment, projectContext)

    // Transform the translations to handle objects from OpenAI
    const objectTranslations: Record<string, Record<string, string>> = {}

    for (const lang of allLanguages) {
      const translation = translations[lang]

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
            this.translationService.warn(`Invalid plural structure for ${lang}, using fallback`)
            objectTranslations[lang] = this.createFallbackPluralObject(translation, lang)
          }
        } catch {
          // Fallback: create simple one/other object
          this.translationService.warn(`Failed to parse plural structure for ${lang}, using fallback`)
          objectTranslations[lang] = this.createFallbackPluralObject(translation, lang)
        }
      } else {
        // Fallback for any other type
        this.translationService.warn(`Unexpected translation type for ${lang}, using fallback`)
        objectTranslations[lang] = this.createFallbackPluralObject(String(translation), lang)
      }
    }

    // Convert objects to the new array-with-object format for YAML storage
    const yamlTranslations: Record<string, Array<Record<string, string>>> = {}
    for (const lang of allLanguages) {
      yamlTranslations[lang] = [objectTranslations[lang]]
    }

    // Update all language files with object plural data
    this.translationService.updateAllLanguageFiles(languageFiles, i18nDir, key, yamlTranslations)

    // Store context and build
    this.translationService.finalize(i18nPath, key, input, comment)
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

