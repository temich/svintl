/**
 * Base class for translation commands with common functionality
 * Provides shared utilities for OpenAI translation, file management, and logging
 * 
 * @author copilot
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import OpenAI from 'openai'
import { build } from './build'
import { ContextFileManager } from './context'

export abstract class BaseTranslationCommand {
  protected contextManager = new ContextFileManager()

  protected log(message: string): void {
    console.log(message)
  }

  protected warn(message: string): void {
    console.warn(`⚠️  ${message}`)
  }

  protected error(message: string): never {
    console.error(`❌ ${message}`)
    process.exit(1)
  }

  /**
   * Get all locale files and codes from i18n directory
   */
  protected getLocaleInfo(i18nPath: string): { localeFiles: string[], allLocales: string[], i18nDir: string } {
    const i18nDir = resolve(process.cwd(), i18nPath)
    const localeFiles = readdirSync(i18nDir).filter(file => file.match(/^[a-z]{2}(-[A-Z]{2})?\.yaml$/))
    const allLocales = localeFiles.map(file => file.replace('.yaml', ''))

    return { localeFiles, allLocales, i18nDir }
  }

  /**
   * Translate content using OpenAI with custom system prompt
   */
  protected async translateWithOpenAI(
    content: string,
    allLocales: string[],
    systemPrompt: string,
    comment?: string,
    projectContext?: string
  ): Promise<Record<string, string>> {
    if (!process.env.OPENAI_API_KEY) {
      this.error('OPENAI_API_KEY environment variable is required')
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
        max_tokens: 2000,
        temperature: 0.1,
      })

      const response = completion.choices[0]?.message?.content?.trim()

      if (response) {
        try {
          const parsedTranslations = JSON.parse(response)

          // Validate and collect translations for all locales
          for (const lang of allLocales) {
            if (parsedTranslations[lang]) {
              translations[lang] = parsedTranslations[lang]
            } else {
              this.warn(`No translation received for ${lang}, using original value as fallback`)
              translations[lang] = content
            }
          }
        } catch (parseError) {
          this.warn(`Failed to parse OpenAI response as JSON: ${parseError}`)
          this.warn(`Response was: ${response}`)

          // Fallback to original value for all locales
          for (const lang of allLocales) {
            translations[lang] = content
          }
        }
      } else {
        this.warn('No response from OpenAI, using original value fallback for all locales')

        // Fallback to original value for all locales
        for (const lang of allLocales) {
          translations[lang] = content
        }
      }
    } catch (error) {
      this.warn(`Translation request failed: ${error}`)
      this.log('Using original value fallback for all locales')

      // Fallback to original value for all locales
      for (const lang of allLocales) {
        translations[lang] = content
      }
    }

    return translations
  }

  /**
   * Update a specific locale file with a key-value pair
   */
  protected updateLocaleFile(filePath: string, key: string, value: string | Record<string, string> | string[] | Array<Record<string, string>>): void {
    // Read and parse YAML file
    const content = readFileSync(filePath, 'utf8')
    const yamlData = yamlLoad(content) as any

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
      lineWidth: -1, // Prevent line wrapping
      quotingType: '"', // Use double quotes
      forceQuotes: false, // Only quote when necessary
    }))
  }

  /**
 * Update all locale files with translations
 */
  protected updateAllLocaleFiles(
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
        this.error(`Failed to update ${file}: ${error}`)
      }
    }
  }

  /**
   * Store context entry and auto-build dictionaries
   */
  protected finalize(i18nPath: string, key: string, input: string, comment?: string): void {
    // Store input and context in context.yaml
    try {
      this.contextManager.setContextEntry(i18nPath, key, input, comment)
      this.log(`✓ Saved input and context to context.yaml`)
    } catch (error) {
      this.warn(`Failed to save context: ${error}`)
    }

    this.log(`✅ Translation completed`)

    // Auto-build dictionaries
    build(i18nPath)
  }
}
