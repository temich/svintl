/**
 * Translation service with shared functionality for all translation commands
 * Extracted from BaseTranslationCommand to reduce duplication
 * 
 * @author copilot
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import OpenAI from 'openai'
import { build } from './build'
import { ContextFileManager } from './context'
import { getPartitionPath } from './partition'

export class TranslationService {
  private contextManager = new ContextFileManager()

  get contextManagerInstance(): ContextFileManager {
    return this.contextManager
  }

  getCommonTranslationPromptBody(): string {
    return [
      this.getTranslationRules(),
      this.getTranslationExamples(),
      this.getTranslationCriticalRules(),
    ].join('\n\n')
  }

  getPlaceholderInstructions(): string {
    return [
      'If the phrase contains placeholders like {name} or {itemId}, the translation MUST be a !js function with matching parameters.',
      'If the phrase contains placeholders like [names] in square brackets, treat them as array-of-strings parameters and use Intl.ListFormat with style "long" and type "conjunction".',
      'Build grammatically correct phrases based on list length (e.g., singular vs plural verb agreement).',
    ].join('\n')
  }

  private getTranslationRules(): string {
    return `IMPORTANT RULES:
1. DETECT the input locale automatically - do not assume it's English
2. If the input starts with "!js", it's a JavaScript function that returns localized strings
3. For !js functions: Keep the "!js" tag but ADAPT the JavaScript logic to match the target locale's grammar rules
4. You can modify conditions, logic, and structure to fit the target locale's pluralization and grammar rules
5. For regular text: Translate from the detected source locale to the target locale
6. If the phrase contains placeholders like {name} or {itemId}, the translation MUST be a !js function with matching parameters
7. If the phrase contains placeholders like [names] in square brackets, treat them as array-of-strings parameters and use Intl.ListFormat with style "long" and type "conjunction"
8. Build grammatically correct phrases based on list length (e.g., singular vs plural verb agreement)
9. Always maintain the exact same function parameters (don't change parameter names or count) unless instructed to add a gender parameter
10. Use DOUBLE QUOTES for all string literals to avoid JavaScript syntax errors
11. Translate ALL parts of compound phrases completely
12. Ensure translations sound natural and commonly used within the provided context
13. For UI elements (buttons, links, menus), choose idiomatic, inviting phrasing that native speakers expect in that scenario
14. When translating navigation or call-to-action text, prefer natural, inviting prompts that encourage exploration over literal location descriptors`
  }

  private getTranslationExamples(): string {
    return `GRAMMAR ADAPTATION EXAMPLES (any source language):

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
English: "!js\\n(names, groupName) => { const list = new Intl.ListFormat(\"en\", { style: \"long\", type: \"conjunction\" }).format(names); return names.length === 1 ? \`\${list} has joined the \${groupName}\` : \`\${list} have joined the \${groupName}\`; }"`
  }

  private getTranslationCriticalRules(): string {
    return `CRITICAL:
- Automatically detect the source language from input text
- Always use double quotes (") for string literals in JavaScript, never single quotes (')
- For !js functions, ALWAYS include the "!js" tag at the beginning of each translation
- If placeholders like {name} exist, translate to a !js function with matching parameters
- If placeholders like [names] exist, translate to a !js function with array parameters and Intl.ListFormat
- Escape quotes properly in JSON: use \\" for literal quotes in the function
- ADAPT the logic to match the target language's grammar, don't just translate strings
- Keep the same function parameters but change conditions and return values as needed`
  }

  getGenderInstructions(i18nPath: string): string | null {
    const genderValues = this.contextManager.getGlobalGenders(i18nPath)
    if (!genderValues || !Array.isArray(genderValues) || genderValues.length === 0)
      return null

    const genderList = genderValues.map(g => `'${g}'`).join(' | ')

    return `GRAMMATICAL GENDER SUPPORT:
- If a phrase has different grammatical gender forms in any target language, define the key as a function.
- The function MUST accept a Grammar parameter: gender: ${genderList}.
- If the input is already a !js function, KEEP existing parameters and ADD gender as the last parameter.
- If the phrase contains list placeholders like [names], add an additional Grammar parameter named grammar for the singular case (list length === 1). Use it only when the list has a single element; ignore it for plural lists.
- When gender is "${genderValues[genderValues.length - 1]}", prefer a gender-neutral form. If not possible, use a combined form like "бежал(а)", "должен(на)".
- Avoid neuter forms like "бежало" when referring to a person.`
  }

  /**
   * Get all locale files and codes from i18n directory
   */
  getLocaleInfo(i18nPath: string, partition?: string): { localeFiles: string[], allLocales: string[], i18nDir: string } {
    const i18nDir = getPartitionPath(i18nPath, partition)

    // Check if directory exists and provide user-friendly error
    try {
      const localeFiles = readdirSync(i18nDir).filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))
      const allLocales = localeFiles.map(file => file.replace('.yaml', ''))

      return { localeFiles, allLocales, i18nDir }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Context not found in ${i18nDir}`)
      }
      throw error
    }
  }

  /**
   * Translate content using OpenAI with custom system prompt
   */
  async translateWithOpenAI(
    content: string,
    allLocales: string[],
    systemPrompt: string,
    comment?: string,
    projectContext?: string
  ): Promise<Record<string, string>> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const translations: Record<string, string> = {}

    try {
      const trimmedProjectContext = projectContext?.trim()
      const trimmedComment = comment?.trim()

      const hasProjectContext = Boolean(trimmedProjectContext && trimmedProjectContext.length > 0)
      const hasPhraseContext = Boolean(trimmedComment && trimmedComment.length > 0)

      const promptSections: string[] = []

      if (hasProjectContext)
        promptSections.push(`Project context: ${trimmedProjectContext}`)

      promptSections.push(`Phrase: ${content}`)

      promptSections.push(`Phrase context: ${hasPhraseContext ? trimmedComment : 'None provided'}`)

      promptSections.push('Instructions: Provide translations that sound natural, commonly used, and idiomatic for the described context.')

      const contextPrompt = promptSections.join('\n\n')

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: systemPrompt.replace('${allLocales}', allLocales.join(', ')),
          },
          {
            role: 'user',
            content: contextPrompt,
          },
        ],
        max_completion_tokens: 2000,
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error('No response from OpenAI')
      }

      // Parse JSON response, handling markdown code blocks
      try {
        let cleanResponse = response.trim()

        // Remove markdown code block syntax if present
        if (cleanResponse.startsWith('```json')) {
          cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
        } else if (cleanResponse.startsWith('```')) {
          cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
        }

        const parsed = JSON.parse(cleanResponse)

        // Handle different response formats from OpenAI
        let translationData: Record<string, string> = {}
        if (parsed.translations && typeof parsed.translations === 'object') {
          translationData = parsed.translations
        } else if (typeof parsed === 'object' && parsed !== null) {
          translationData = parsed
        }

        Object.assign(translations, translationData)
      } catch (parseError) {
        throw new Error(`Failed to parse OpenAI response as JSON: ${response}`)
      }

      // Ensure all target locales are included, using original value for missing ones
      for (const locale of allLocales) {
        if (!(locale in translations)) {
          translations[locale] = content
        }
      }

      return translations
    } catch (error: any) {
      throw new Error(`Translation failed: ${error.message}`)
    }
  }

  /**
   * Update a specific locale file with a key-value pair
   */
  updateLocaleFile(filePath: string, key: string, value: string | Record<string, string> | string[] | Array<Record<string, string>>): void {
    // Read and parse YAML file
    const content = readFileSync(filePath, 'utf8')
    let yamlData = yamlLoad(content) as any

    // Handle empty files
    if (yamlData === null) {
      yamlData = {}
    }

    // Parse the key path and set the value
    const keyParts = key.split('.')
    let current = yamlData

    // Navigate to the parent object
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]

      if (!current[part])
        current[part] = {}

      current = current[part]
    }

    // Set the final key
    const finalKey = keyParts[keyParts.length - 1]
    current[finalKey] = value

    // Write back to file in YAML format
    writeFileSync(filePath, yamlDump(yamlData, {
      indent: 2,
      quotingType: '"',
      forceQuotes: false,
    }))
  }

  /**
   * Remove a key from a locale file
   */
  removeFromLocaleFile(filePath: string, key: string): boolean {
    const content = readFileSync(filePath, 'utf8')
    let yamlData = yamlLoad(content) as any

    // Handle empty files
    if (yamlData === null) {
      yamlData = {}
    }

    const keyParts = key.split('.')
    let current = yamlData

    // Navigate to the parent object
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]
      if (!current[part]) {
        return false // Key doesn't exist
      }
      current = current[part]
    }

    // Remove the final key
    const finalKey = keyParts[keyParts.length - 1]
    if (finalKey in current) {
      delete current[finalKey]
      writeFileSync(filePath, yamlDump(yamlData, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      }))
      return true
    }
    return false
  }

  /**
   * Update all locale files with translations
   */
  updateAllLocaleFiles(
    localeFiles: string[],
    i18nDir: string,
    key: string,
    translations: Record<string, string | Record<string, string> | string[] | Array<Record<string, string>>>
  ): void {
    for (const file of localeFiles) {
      const lang = file.replace('.yaml', '')
      const filePath = join(i18nDir, file)

      try {
        this.updateLocaleFile(filePath, key, translations[lang])
      } catch (error) {
        throw new Error(`Failed to update ${file}: ${error}`)
      }
    }
  }

  /**
   * Store input and build dictionaries
   */
  finalize(i18nPath: string, key: string, input: string, comment?: string, partition?: string): void {
    const partitionPath = getPartitionPath(i18nPath, partition)

    // Store input and context in context.yaml
    try {
      this.contextManager.setContextEntry(partitionPath, key, input, comment)
    } catch (error) {
      // Context saving failure is not critical
    }

    // Auto-build dictionaries
    build(partitionPath)
  }
}
