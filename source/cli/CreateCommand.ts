/**
 * @author claude-4-sonnet
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import OpenAI from 'openai'
import { build } from './build'
import { ContextFileManager } from './context'
import { validateLanguageTag, getNativeLanguageName } from './bcp47'

export class CreateCommand {
  private contextManager = new ContextFileManager()

  private log(message: string): void {
    console.log(message)
  }

  private warn(message: string): void {
    console.warn(`⚠️  ${message}`)
  }

  private error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  async execute(targetLang: string, sourceLang?: string, i18nPath = './src/lib/intl/'): Promise<void> {
    // Validate BCP 47 language tag
    const validationError = validateLanguageTag(targetLang)
    if (validationError) {
      this.translationService.error(validationError)
    }

    const i18nDir = resolve(process.cwd(), i18nPath)
    const targetFile = join(i18nDir, `${targetLang}.yaml`)

    // Create the directory if it doesn't exist (including nested paths)
    if (!existsSync(i18nDir)) {
      mkdirSync(i18nDir, { recursive: true })
      this.translationService.log(`Created directory: ${i18nDir}`)
    }

    // Check if target language already exists
    if (existsSync(targetFile)) {
      this.translationService.error(`Language "${targetLang}" already exists at ${targetFile}`)
    }

    // Get existing language files (now supporting BCP 47)
    const existingFiles = readdirSync(i18nDir)
      .filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))

    if (existingFiles.length === 0) {
      // No existing languages - create file with native key
      this.translationService.log(`Creating language file for "${targetLang}"...`)
      const nativeName = getNativeLanguageName(targetLang)
      const initialContent = {
        native: nativeName
      }
      const yamlContent = yamlDump(initialContent, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      })
      writeFileSync(targetFile, yamlContent)
      this.translationService.log(`✅ Created ${targetFile} with native name: ${nativeName}`)
      build(i18nPath)
      return
    }

    // Determine source language
    let sourceLanguage: string
    if (sourceLang) {
      const sourceFile = join(i18nDir, `${sourceLang}.yaml`)
      if (!existsSync(sourceFile)) {
        this.translationService.error(`Source language "${sourceLang}" does not exist`)
      }
      sourceLanguage = sourceLang
    } else if (existingFiles.includes('en.yaml')) {
      sourceLanguage = 'en'
    } else {
      this.translationService.error(`No English (en) language found. Please specify source language: npx intl create ${targetLang} <source-lang>`)
    }

    this.translationService.log(`Creating "${targetLang}" language from "${sourceLanguage}" source...`)

    // Load source dictionary
    const sourceFile = join(i18nDir, `${sourceLanguage}.yaml`)
    const sourceContent = readFileSync(sourceFile, 'utf8')
    const sourceData = yamlLoad(sourceContent) as any

    // Extract all key-value pairs for translation (excluding native key)
    const { native, ...sourceDataWithoutNative } = sourceData
    const entries = this.extractEntries(sourceDataWithoutNative)

    // Get saved contexts for enriched translation
    const savedContexts = this.translationService.contextManagerInstance.getAllContextEntries(i18nPath)

    this.translationService.log(`Found ${entries.length} entries to translate`)
    if (Object.keys(savedContexts).length > 0) {
      this.translationService.log(`Found ${Object.keys(savedContexts).length} saved contexts for enhanced translation`)
    }

    if (entries.length === 0) {
      // Create file with just native key
      const nativeName = getNativeLanguageName(targetLang)
      const initialContent = {
        native: nativeName
      }
      const yamlContent = yamlDump(initialContent, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      })
      writeFileSync(targetFile, yamlContent)
      this.translationService.log(`✅ Created ${targetFile} with native name: ${nativeName}`)
      build(i18nPath)
      return
    }

    // Check if OpenAI is available for translation
    if (!process.env.OPENAI_API_KEY) {
      this.translationService.warn('OPENAI_API_KEY not found - copying source language without translation')
      // Add native key to copied data (excluding source native key)
      const dataWithNative = {
        native: getNativeLanguageName(targetLang),
        ...sourceDataWithoutNative
      }
      writeFileSync(targetFile, yamlDump(dataWithNative))
      this.translationService.log(`✅ Created ${targetFile} (copy of ${sourceLanguage} with native name)`)
      build(i18nPath)
      return
    }

    // Translate in batches of 10
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const batchSize = 10
    const batches = []

    for (let i = 0; i < entries.length; i += batchSize) {
      batches.push(entries.slice(i, i + batchSize))
    }

    const translatedEntries: Record<string, string> = {}

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const progress = `[${i + 1}/${batches.length}]`

      try {
        const batchObject = batch.reduce((obj, { key, value }) => {
          // Check if we have saved context for this key
          const savedContext = savedContexts[key]
          if (savedContext && savedContext.context) {
            // Use the original input with context if available
            obj[key] = savedContext.input
          } else {
            // Use the source language value
            obj[key] = value
          }
          return obj
        }, {} as Record<string, string>)

        // Build contexts for this batch
        const batchContexts = batch.reduce((contexts, { key }) => {
          const savedContext = savedContexts[key]
          if (savedContext && savedContext.context) {
            contexts[key] = savedContext.context
          }
          return contexts
        }, {} as Record<string, string>)

        const completion = await openai.chat.completions.create({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate the provided JSON object from ${sourceLanguage} to ${targetLang}.

IMPORTANT RULES:
1. If a value starts with "!js", it's a JavaScript function - keep the "!js" tag and structure, only translate STRING LITERALS
2. For regular text: translate normally
3. Use DOUBLE QUOTES for all string literals in JavaScript functions
4. Return ONLY a JSON object with the same keys but translated values
5. Pay special attention to any provided context information to ensure accurate translation

Target language: ${targetLang}

For !js functions example:
Input: "!js\\n(count) => count === 1 ? \\"1 item\\" : \`\${count} items\`"
Output: "!js\\n(count) => count === 1 ? \\"[translation]\\" : \`\${count} [translation]\`"

${Object.keys(batchContexts).length > 0 ? `
CONTEXT INFORMATION for this batch:
${Object.entries(batchContexts).map(([key, context]) => `- "${key}": ${context}`).join('\n')}

Use this context information to provide more accurate translations.` : ''}`,
            },
            {
              role: 'user',
              content: JSON.stringify(batchObject, null, 2),
            },
          ],
          max_tokens: 2000,
          temperature: 0.1,
        })

        const response = completion.choices[0]?.message?.content?.trim()

        if (response) {
          try {
            const translatedBatch = JSON.parse(response)

            // Collect translated entries
            for (const { key } of batch) {
              if (translatedBatch[key]) {
                translatedEntries[key] = translatedBatch[key]
              } else {
                this.translationService.warn(`No translation for "${key}", using source`)
                translatedEntries[key] = batchObject[key]
              }
            }


          } catch (parseError) {
            this.translationService.warn(`${progress} Failed to parse response for batch ${i + 1}, using source values`)
            for (const { key, value } of batch) {
              translatedEntries[key] = value
            }
          }
        } else {
          this.translationService.warn(`${progress} No response for batch ${i + 1}, using source values`)
          for (const { key, value } of batch) {
            translatedEntries[key] = value
          }
        }
      } catch (error) {
        this.translationService.warn(`${progress} Translation failed for batch ${i + 1}: ${error}`)
        for (const { key, value } of batch) {
          translatedEntries[key] = value
        }
      }

      // Small delay to avoid rate limiting
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // Reconstruct the nested structure
    const translatedData = this.reconstructStructure(translatedEntries)

    // Add native key at the top level
    const finalData = {
      native: getNativeLanguageName(targetLang),
      ...translatedData
    }

    // Write the translated dictionary
    const yamlContent = yamlDump(finalData, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    })

    writeFileSync(targetFile, yamlContent)
    this.translationService.log(`✅ Translated`)

    // Rebuild dictionaries
    build(i18nPath)
  }

  private extractEntries(obj: any, prefix = ''): Array<{ key: string; value: string }> {
    const entries: Array<{ key: string; value: string }> = []

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key

      if (typeof value === 'string') {
        entries.push({ key: fullKey, value })
      } else if (typeof value === 'object' && value !== null) {
        entries.push(...this.extractEntries(value, fullKey))
      }
    }

    return entries
  }

  private reconstructStructure(entries: Record<string, string>): any {
    const result: any = {}

    for (const [key, value] of Object.entries(entries)) {
      const keyParts = key.split('.')
      let current = result

      // Navigate to the parent object, creating nested objects as needed
      for (let i = 0; i < keyParts.length - 1; i++) {
        const part = keyParts[i]
        if (!current[part]) {
          current[part] = {}
        }
        current = current[part]
      }

      // Set the final value
      const finalKey = keyParts[keyParts.length - 1]
      current[finalKey] = value
    }

    return result
  }
}
