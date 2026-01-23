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

IMPORTANT RULES:
1. DETECT the input locale automatically - do not assume it's English
2. If the input starts with "!js", it's a JavaScript function that returns localized strings
3. For !js functions: Keep the "!js" tag but ADAPT the JavaScript logic to match each target locale's grammar rules
4. You can modify conditions, logic, and structure to fit each target locale's pluralization and grammar rules
5. For regular text: Translate from the detected source locale to each target locale
6. If the phrase contains placeholders like {name} or {itemId}, the translation MUST be a !js function with matching parameters
7. If the phrase contains placeholders like [names] in square brackets, treat them as array-of-strings parameters and use Intl.ListFormat with style "long" and type "conjunction"
8. Build grammatically correct phrases based on list length (e.g., singular vs plural verb agreement)
7. Always maintain the exact same function parameters (don't change parameter names or count) unless instructed to add a gender parameter
7. Use DOUBLE QUOTES for all string literals to avoid JavaScript syntax errors
8. Translate ALL parts of compound phrases completely
10. Ensure translations sound natural and commonly used within the provided context
11. For UI elements (buttons, links, menus), choose idiomatic, inviting phrasing that native speakers expect in that scenario
12. When translating navigation or call-to-action text, prefer natural, inviting prompts that encourage exploration over literal location descriptors
13. Return translations in JSON format as requested

GRAMMAR ADAPTATION EXAMPLES (any source language):

Source language to Russian (any → complex pluralization):
Input: "!js\\n(count) => count === 1 ? 'one item' : \`\${count} items\`"
Russian: "!js\\n(count) => { const rem = count % 10; const tens = Math.floor(count / 10) % 10; if (tens === 1) return \`\${count} предметов\`; if (rem === 1) return \`\${count} предмет\`; if (rem >= 2 && rem <= 4) return \`\${count} предмета\`; return \`\${count} предметов\`; }"

Source language to German (any → simple pluralization):
Input: "!js\\n(count) => count === 1 ? 'une chose' : \`\${count} choses\`" (French)
German: "!js\\n(count) => count === 1 ? \"1 Ding\" : \`\${count} Dinge\`"

Russian to other languages (complex → simpler pluralization):
Input: "!js\\n(count) => { const rem = count % 10; if (rem === 1) return '1 предмет'; return \`\${count} предметов\`; }"
English: "!js\\n(count) => count === 1 ? \"1 item\" : \`\${count} items\`"
French: "!js\\n(count) => count === 1 ? \"1 article\" : \`\${count} articles\`"

List placeholder example (use Intl.ListFormat for [names]):
Input: "[names] have joined the {groupName}"
English: "!js\\n(names, groupName) => { const list = new Intl.ListFormat(\"en\", { style: \"long\", type: \"conjunction\" }).format(names); return names.length === 1 ? \`\${list} has joined the \${groupName}\` : \`\${list} have joined the \${groupName}\`; }"

CRITICAL: 
- Automatically detect the source language from input text
- Always use double quotes (") for string literals in JavaScript, never single quotes (')
- For !js functions, ALWAYS include the "!js" tag at the beginning of each translation
- If placeholders like {name} exist, translate to a !js function with matching parameters
- If placeholders like [names] exist, translate to a !js function with array parameters and Intl.ListFormat
- Escape quotes properly in JSON: use \\" for literal quotes in the function
- ADAPT the logic to match each target language's grammar, don't just translate strings
- Keep the same function parameters but change conditions and return values as needed

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
