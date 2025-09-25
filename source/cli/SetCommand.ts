/**
 * CLI command for adding new i18n entries with automatic translation
 * Translates entries to all available languages using OpenAI API
 *
 * @author claude-4-sonnet
 */

import { BaseTranslationCommand } from './BaseTranslationCommand'

export class SetCommand extends BaseTranslationCommand {

  async execute(key: string, value: string, comment?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    const commentText = comment ? ` (${comment})` : ''
    this.log(`Setting "${key}" with value "${value}"${commentText}...`)

    // Get language information
    const { languageFiles, allLanguages, i18nDir } = this.getLanguageInfo(i18nPath)
    this.log(`Translating to ${allLanguages.length} languages...`)

    // Create system prompt for regular translations
    const systemPrompt = `You are a professional translator for an internationalization system. You will receive text in ANY language and must translate it to ALL specified target languages.

IMPORTANT RULES:
1. DETECT the input language automatically - do not assume it's English
2. If the input starts with "!js", it's a JavaScript function that returns localized strings
3. For !js functions: Keep the "!js" tag but ADAPT the JavaScript logic to match each target language's grammar rules
4. You can modify conditions, logic, and structure to fit each target language's pluralization and grammar rules
5. For regular text: Translate from the detected source language to each target language
6. Always maintain the exact same function parameters (don't change parameter names or count)
7. Use DOUBLE QUOTES for all string literals to avoid JavaScript syntax errors
8. Translate ALL parts of compound phrases completely
9. Ensure translations sound natural and commonly used within the provided context
10. For UI elements (buttons, links, menus), choose idiomatic, inviting phrasing that native speakers expect in that scenario
11. When translating navigation or call-to-action text, prefer natural, inviting prompts that encourage exploration over literal location descriptors
12. Return translations in JSON format as requested

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

CRITICAL: 
- Automatically detect the source language from input text
- Always use double quotes (") for string literals in JavaScript, never single quotes (')
- For !js functions, ALWAYS include the "!js" tag at the beginning of each translation
- Escape quotes properly in JSON: use \\" for literal quotes in the function
- ADAPT the logic to match each target language's grammar, don't just translate strings
- Keep the same function parameters but change conditions and return values as needed

Target languages: \${allLanguages}

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

    // Translate using OpenAI
    const projectContext = this.contextManager.getGlobalContext(i18nPath)
    const translations = await this.translateWithOpenAI(value, allLanguages, systemPrompt, comment, projectContext)

    // Update all language files
    this.updateAllLanguageFiles(languageFiles, i18nDir, key, translations)

    // Store context and build
    this.finalize(i18nPath, key, value, comment)
  }

}
