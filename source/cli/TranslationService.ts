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

/** OpenAI model used for all translation requests. */
const TRANSLATION_MODEL = 'gpt-5.5'

export class TranslationService {
  private contextManager = new ContextFileManager()

  get contextManagerInstance(): ContextFileManager {
    return this.contextManager
  }

  /**
   * The shared, deduplicated body of translation instructions used by every
   * command. Stated once each: source detection, naturalness, !js handling,
   * {placeholder}/[list] rules, and quoting — followed by a few worked examples.
   */
  getCommonTranslationPromptBody(): string {
    return `RULES:
1. Detect the source language automatically - do not assume English.
2. Translate into the target locale so the result is natural, idiomatic, and what native speakers commonly use in the given context. For UI elements (buttons, links, menus, calls to action) prefer inviting, idiomatic phrasing over literal wording. Translate every part of compound phrases.
3. If the input begins with "!js", keep the "!js" tag and translate it as a JavaScript function: adapt the logic, conditions and return values to the target locale's grammar and pluralization rules, but keep the exact same parameters (same names and count) unless a gender parameter is explicitly required.
4. A plain phrase containing {placeholder} tokens (e.g. {name}, {itemId}, {price}) is expected to be a function: the translation MUST be a "!js" function whose parameters match those tokens.
5. If the phrase contains [list] tokens in square brackets (e.g. [names]), treat them as array-of-strings parameters, format them with Intl.ListFormat using style "long" and type "conjunction", and make the surrounding grammar agree with the list length (e.g. singular vs plural verb).
6. In any "!js" function use double quotes (") for string literals (escape as \\" in JSON), never single quotes (').

EXAMPLES:

Placeholder phrase becomes a function (any -> English):
Input: "Subscribe for {price} per month"
English: "!js\\n(price) => \`Subscribe for \${price} per month\`"

Pluralization into a complex locale (any -> Russian):
Input: "!js\\n(count) => count === 1 ? 'one item' : \`\${count} items\`"
Russian: "!js\\n(count) => { const rem = count % 10; const tens = Math.floor(count / 10) % 10; if (tens === 1) return \`\${count} предметов\`; if (rem === 1) return \`\${count} предмет\`; if (rem >= 2 && rem <= 4) return \`\${count} предмета\`; return \`\${count} предметов\`; }"

Pluralization into a simple locale (any -> German):
Input: "!js\\n(count) => count === 1 ? 'one item' : \`\${count} items\`"
German: "!js\\n(count) => count === 1 ? \"1 Ding\" : \`\${count} Dinge\`"

List placeholder (Intl.ListFormat for [names]):
Input: "[names] have joined the {groupName}"
English: "!js\\n(names, groupName) => { const list = new Intl.ListFormat(\"en\", { style: \"long\", type: \"conjunction\" }).format(names); return names.length === 1 ? \`\${list} has joined the \${groupName}\` : \`\${list} have joined the \${groupName}\`; }"`
  }

  getGenderInstructions(i18nPath: string): string | null {
    const genderValues = this.contextManager.getGlobalGenders(i18nPath)
    if (!genderValues || !Array.isArray(genderValues) || genderValues.length === 0)
      return null

    const genderList = genderValues.map(g => `'${g}'`).join(' | ')
    // By convention, the last gender value is treated as the neutral/fallback form
    const neutralGender = genderValues[genderValues.length - 1]

    return `GRAMMATICAL GENDER SUPPORT:
- If a phrase has different grammatical gender forms in a target language, define the key as a "!js" function; if all forms are identical, return a plain string instead.
- The function MUST accept a Grammar parameter gender: ${genderList} as its LAST parameter (after the phrase's own parameters); if the input is already a "!js" function, keep its parameters and append gender.
- If the phrase contains [list] placeholders, add a Grammar parameter for the singular case (list length === 1) and use it only when the list has a single element.
- When gender is "${neutralGender}", prefer a gender-neutral form; otherwise use a combined form like "бежал(а)", "должен(на)". Never use a neuter form (e.g. "бежало") for a person.`
  }

  /**
   * Intro sentence + common body + (optional) gender block — the shared head of
   * every system prompt. `scope` controls whether we address one target locale
   * or all of them.
   */
  private buildPromptHead(i18nPath: string, scope: 'single' | 'all'): string {
    const intro = scope === 'all'
      ? 'You are a professional translator for an internationalization system. You will receive text in ANY locale and must translate it to ALL specified target locales.'
      : 'You are a professional translator for an internationalization system. You will receive text in ANY locale and must translate it to the specified target locale.'

    const gender = this.getGenderInstructions(i18nPath)

    return [intro, this.getCommonTranslationPromptBody(), gender]
      .filter(Boolean)
      .join('\n\n')
  }

  /**
   * System prompt for the single-string commands.
   * - `single`: translate one phrase to one target locale, returning a bare string.
   * - `jsonObject`: translate one phrase to all locales, returning a JSON object
   *   keyed by locale code (used by add/set). Uses the literal `${allLocales}`
   *   token, resolved inside translateWithOpenAI.
   */
  buildSystemPrompt(options: { mode: 'single' | 'jsonObject'; i18nPath: string; target?: string }): string {
    if (options.mode === 'jsonObject') {
      return `${this.buildPromptHead(options.i18nPath, 'all')}

Target languages: \${allLocales}

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
    }

    return `${this.buildPromptHead(options.i18nPath, 'single')}

Target language: ${options.target ?? '${targetLang}'}

Return ONLY the translation as a string.`
  }

  /**
   * Project context line shared by batch user/system prompts.
   */
  private projectContextPrefix(projectContext?: string): string {
    const t = projectContext?.trim()
    return t ? `Project context: ${t}\n\n` : ''
  }

  /**
   * Batch-translate a flat list of phrases (each with optional context) to a
   * single target locale, returning the translations in input order. Composes
   * the full system prompt directly (no string splicing) and calls OpenAI.
   */
  async translateBatch(options: {
    values: string[]
    contexts: (string | undefined)[]
    targetLang: string
    i18nPath: string
    projectContext?: string
  }): Promise<string[]> {
    const { values, contexts, targetLang, i18nPath, projectContext } = options

    if (!process.env.OPENAI_API_KEY)
      throw new Error('OPENAI_API_KEY environment variable is required')

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const batchItems = values.map((value, index) => `Item ${index + 1}:
Phrase: ${value}
Context: ${contexts[index] || 'None provided'}`).join('\n\n')

    const systemPrompt = `${this.buildPromptHead(i18nPath, 'single')}

${this.projectContextPrefix(projectContext)}Translate all ${values.length} items below to ${targetLang}.

${batchItems}

Return ONLY a JSON array of translations in the same order as the items above.`

    try {
      const completion = await openai.chat.completions.create({
        model: TRANSLATION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Translate all ${values.length} items to ${targetLang}. Return a JSON array of strings.` },
        ],
        max_completion_tokens: 4000,
      })

      const response = completion.choices[0]?.message?.content
      if (!response)
        throw new Error('No response from OpenAI')

      let cleanResponse = response.trim()
      if (cleanResponse.startsWith('```json'))
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      else if (cleanResponse.startsWith('```'))
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')

      const parsed = JSON.parse(cleanResponse)
      if (!Array.isArray(parsed))
        throw new Error(`Expected JSON array, got: ${typeof parsed}`)

      return parsed
    } catch (error: any) {
      throw new Error(`Batch translation failed: ${error.message}`)
    }
  }

  /**
   * Flatten a nested object into dot-keyed string leaves.
   */
  extractEntries(obj: any, prefix = ''): Array<{ key: string; value: string }> {
    const entries: Array<{ key: string; value: string }> = []

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key

      if (typeof value === 'string')
        entries.push({ key: fullKey, value })
      else if (typeof value === 'object' && value !== null)
        entries.push(...this.extractEntries(value, fullKey))
    }

    return entries
  }

  /**
   * Set a dot-keyed value on a nested object, creating intermediate objects.
   */
  setNestedValue(obj: any, keyPath: string, value: any): void {
    const keys = keyPath.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!current[key])
        current[key] = {}
      current = current[key]
    }

    current[keys[keys.length - 1]] = value
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
   * Product-wide context from `context.yaml` (`npx intl context …`). Pass CLI `-p` base path.
   */
  getGlobalProjectContext(i18nPath: string): string | undefined {
    return this.contextManager.getGlobalContext(i18nPath)
  }

  /**
   * Translate content using OpenAI with custom system prompt
   */
  async translateWithOpenAI(
    content: string,
    allLocales: string[],
    systemPrompt: string,
    comment?: string,
    projectContext?: string,
    debug = false
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

      const resolvedSystemContent = systemPrompt.replace('${allLocales}', allLocales.join(', '))
      const requestPayload = {
        model: TRANSLATION_MODEL,
        messages: [
          { role: 'system' as const, content: resolvedSystemContent },
          { role: 'user' as const, content: contextPrompt },
        ],
        max_completion_tokens: 2000,
      }

      if (debug)
        console.log('[intl --debug] Translation request:\n', JSON.stringify(requestPayload, null, 2))

      const completion = await openai.chat.completions.create(requestPayload)

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
   * Check if a key exists in a locale file
   */
  keyExistsInLocaleFile(filePath: string, key: string): boolean {
    const content = readFileSync(filePath, 'utf8')
    let yamlData = yamlLoad(content) as any

    // Handle empty files
    if (yamlData === null) {
      return false
    }

    const keyParts = key.split('.')
    let current = yamlData

    // Navigate to the key
    for (const part of keyParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part]
      } else {
        return false
      }
    }

    return true
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
    build(partitionPath, !!partition)
  }
}
